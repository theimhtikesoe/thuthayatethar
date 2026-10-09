type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  run: () => Promise<{ meta: { changes: number } }>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  all?: <T = Record<string, unknown>>() => Promise<{ results: T[] }>;
};

type D1Database = {
  prepare: (query: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<unknown>;
};

type R2Object = { key: string; size: number; httpEtag: string; body: ReadableStream; httpMetadata?: { contentType?: string } };
type R2Range = { offset: number; length: number };
type R2Bucket = {
  put: (key: string, value: ArrayBuffer | ReadableStream, options?: Record<string, unknown>) => Promise<R2Object | null>;
  get: (key: string, options?: { range?: R2Range }) => Promise<R2Object | null>;
  delete: (key: string) => Promise<void>;
};
type SecretStoreBinding = { get: () => Promise<string> };
type ExecutionContext = { waitUntil: (promise: Promise<unknown>) => void };
declare const FixedLengthStream: new (length: number) => TransformStream<Uint8Array, Uint8Array>;

export interface Env {
  DB: D1Database;
  BUCKET?: R2Bucket;
  TELEGRAM_WEBHOOK_SECRET?: string | SecretStoreBinding;
  TELEGRAM_ALLOWED_CHAT_IDS?: string | SecretStoreBinding;
  TELEGRAM_BOT_TOKEN?: string | SecretStoreBinding;
  TELEGRAM_API_BASE_URL?: string;
  FILE_RELAY_ACCESS_ID?: string | SecretStoreBinding;
  FILE_RELAY_ACCESS_SECRET?: string | SecretStoreBinding;
  MAX_FILE_BYTES?: string;
  CATALOG_ORIGIN?: string | SecretStoreBinding;
  ADMIN_TOKEN?: string | SecretStoreBinding;
  TELEGRAM_WEBHOOK_SECRET_STORE?: SecretStoreBinding;
  TELEGRAM_BOT_TOKEN_STORE?: SecretStoreBinding;
  ADMIN_TOKEN_STORE?: SecretStoreBinding;
}

type RuntimeEnv = Omit<Env, "TELEGRAM_WEBHOOK_SECRET" | "TELEGRAM_ALLOWED_CHAT_IDS" | "TELEGRAM_BOT_TOKEN" | "CATALOG_ORIGIN" | "ADMIN_TOKEN" | "FILE_RELAY_ACCESS_ID" | "FILE_RELAY_ACCESS_SECRET"> & {
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ALLOWED_CHAT_IDS?: string;
  TELEGRAM_BOT_TOKEN?: string;
  CATALOG_ORIGIN?: string;
  ADMIN_TOKEN?: string;
  FILE_RELAY_ACCESS_ID?: string;
  FILE_RELAY_ACCESS_SECRET?: string;
};

type JsonRecord = Record<string, unknown>;
type MediaType = "document" | "photo";
const MAX_UPDATE_BYTES = 256 * 1024;
const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;

async function secretValue(value: string | SecretStoreBinding | undefined): Promise<string | undefined> {
  return typeof value === "string" ? value : value ? await value.get() : undefined;
}

async function resolveSecrets(env: Env): Promise<RuntimeEnv> {
  return {
    ...env,
    TELEGRAM_WEBHOOK_SECRET: await secretValue(env.TELEGRAM_WEBHOOK_SECRET_STORE ?? env.TELEGRAM_WEBHOOK_SECRET),
    TELEGRAM_BOT_TOKEN: await secretValue(env.TELEGRAM_BOT_TOKEN_STORE ?? env.TELEGRAM_BOT_TOKEN),
    ADMIN_TOKEN: await secretValue(env.ADMIN_TOKEN_STORE ?? env.ADMIN_TOKEN),
    TELEGRAM_ALLOWED_CHAT_IDS: await secretValue(env.TELEGRAM_ALLOWED_CHAT_IDS),
    CATALOG_ORIGIN: await secretValue(env.CATALOG_ORIGIN),
    FILE_RELAY_ACCESS_ID: await secretValue(env.FILE_RELAY_ACCESS_ID),
    FILE_RELAY_ACCESS_SECRET: await secretValue(env.FILE_RELAY_ACCESS_SECRET),
  };
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: JsonRecord, status = 200, origin?: string): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...(origin ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}),
    },
  });
}

function constantTimeEqual(supplied: string | null, expected: string): boolean {
  if (!supplied || supplied.length !== expected.length || supplied.length > 256) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  return difference === 0;
}

function allowedChatIds(value: string): Set<string> {
  return new Set(value.split(",").map((id) => id.trim()).filter((id) => /^-?\d+$/.test(id)));
}

function findMessage(update: JsonRecord): JsonRecord | null {
  return [update.message, update.edited_message].find(isRecord) ?? null;
}

function mediaFor(message: JsonRecord): { type: MediaType; fileId: string; coverFileId: string | null; fileName: string | null; mimeType: string | null; byteSize: number | null } | null {
  const document = message.document;
  if (isRecord(document) && typeof document.file_id === "string") {
    const thumbnail = isRecord(document.thumbnail) ? document.thumbnail : isRecord(document.thumb) ? document.thumb : null;
    const fileName = typeof document.file_name === "string" ? document.file_name : null;
    const mimeType = typeof document.mime_type === "string" ? document.mime_type.toLowerCase() : null;
    const isPdf = mimeType ? mimeType === "application/pdf" : Boolean(fileName?.toLowerCase().endsWith(".pdf"));
    if (!isPdf) return null;
    return { type: "document", fileId: document.file_id, coverFileId: thumbnail && typeof thumbnail.file_id === "string" ? thumbnail.file_id : null, fileName, mimeType, byteSize: typeof document.file_size === "number" ? document.file_size : null };
  }
  const photos = message.photo;
  if (Array.isArray(photos)) {
    const photo = photos.filter(isRecord).find((item) => typeof item.file_id === "string");
    if (photo && typeof photo.file_id === "string") return { type: "photo", fileId: photo.file_id, coverFileId: null, fileName: null, mimeType: "image/jpeg", byteSize: typeof photo.file_size === "number" ? photo.file_size : null };
  }
  return null;
}

function wattpadUrlFor(message: JsonRecord): string | null {
  const values: string[] = [];
  for (const key of ["text", "caption"]) if (typeof message[key] === "string") values.push(message[key] as string);
  for (const key of ["entities", "caption_entities"]) {
    const entities = message[key];
    if (Array.isArray(entities)) for (const entity of entities) if (isRecord(entity) && typeof entity.url === "string") values.push(entity.url);
  }
  const match = values.join(" ").match(/https?:\/\/(?:www\.)?wattpad\.com\/story\/\d+(?:[^\s<>]*)?/i);
  if (!match) return null;
  try {
    const url = new URL(match[0]);
    return `https://www.wattpad.com${url.pathname}`;
  } catch { return null; }
}

function wattpadMetadata(message: JsonRecord): { title: string; author: string | null } {
  const text = [message.text, message.caption].find((value) => typeof value === "string") as string | undefined;
  const match = text?.match(/["“](.+?)["”]\s+by\s+\*?([^*\n]+?)(?:\s+on\s+Wattpad|\s+https?:\/\/|$)/i);
  return { title: match?.[1]?.trim().slice(0, 180) || "Wattpad စာအုပ်", author: match?.[2]?.trim().slice(0, 180) || null };
}

function safeFileName(name: string | null, type: MediaType): string {
  const fallback = type === "document" ? "book.pdf" : "cover.jpg";
  const clean = (name ?? fallback).normalize("NFKC").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 120);
  return clean || fallback;
}

function titleFromFile(name: string): string {
  return name.normalize("NFKC").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 180) || "စာအုပ်အသစ်";
}

async function sha256(value: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  const bytes = new Uint8Array(digest);
  let result = "";
  for (let index = 0; index < bytes.length; index += 1) result += bytes[index].toString(16).padStart(2, "0");
  return result;
}

function maxFileBytes(env: Env): number {
  const configured = Number(env.MAX_FILE_BYTES ?? DEFAULT_MAX_FILE_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_FILE_BYTES;
}

async function processIntake(intakeId: string, env: RuntimeEnv): Promise<void> {
  if (!env.BUCKET || !env.TELEGRAM_BOT_TOKEN) return;
  const item = await env.DB.prepare("SELECT * FROM intake_items WHERE id = ? LIMIT 1").bind(intakeId).first<JsonRecord>();
  if (!item || typeof item.telegram_file_id !== "string") return;
  if (item.source_type === "wattpad_link") return;
  const maxBytes = maxFileBytes(env);
  try {
    if (typeof item.byte_size === "number" && item.byte_size > maxBytes) throw new Error("file_too_large");
    const base = (env.TELEGRAM_API_BASE_URL ?? "https://api.telegram.org").replace(/\/$/, "");
    const relayHeaders: HeadersInit = {};
    if (env.FILE_RELAY_ACCESS_ID && env.FILE_RELAY_ACCESS_SECRET) {
      relayHeaders["CF-Access-Client-Id"] = env.FILE_RELAY_ACCESS_ID;
      relayHeaders["CF-Access-Client-Secret"] = env.FILE_RELAY_ACCESS_SECRET;
    }
    const infoResponse = await fetch(`${base}/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(item.telegram_file_id)}`, { headers: relayHeaders });
    const info = await infoResponse.json() as JsonRecord;
    const result = isRecord(info.result) ? info.result : null;
    if (!infoResponse.ok || info.ok !== true || !result || typeof result.file_path !== "string") throw new Error(`telegram_file_lookup_failed_${infoResponse.status}`);
    const fileResponse = await fetch(`${base}/relay/file?path=${encodeURIComponent(result.file_path)}`, { headers: relayHeaders });
    if (!fileResponse.ok) throw new Error(`telegram_file_download_failed_${fileResponse.status}`);
    const contentLength = Number(fileResponse.headers.get("content-length") ?? "0");
    const expectedBytes = contentLength > 0 ? contentLength : (typeof item.byte_size === "number" ? item.byte_size : 0);
    if (expectedBytes > maxBytes) {
      await fileResponse.body?.cancel();
      throw new Error("file_too_large");
    }
    const key = `originals/${intakeId}/${safeFileName(typeof item.original_filename === "string" ? item.original_filename : null, item.media_type === "photo" ? "photo" : "document")}`;
    const httpMetadata = { contentType: typeof item.mime_type === "string" ? item.mime_type : "application/octet-stream" };
    let byteSize = 0;
    let checksum: string | null = null;
    if (contentLength > 0 && contentLength <= DEFAULT_MAX_FILE_BYTES) {
      const bytes = await fileResponse.arrayBuffer();
      if (bytes.byteLength === 0 || bytes.byteLength > maxBytes) throw new Error("file_too_large");
      if (expectedBytes > 0 && bytes.byteLength !== expectedBytes) throw new Error("telegram_file_size_mismatch");
      checksum = await sha256(bytes);
      const stored = await env.BUCKET.put(key, bytes, { httpMetadata, customMetadata: { intakeId, sha256: checksum, visibility: "private" } });
      if (!stored || stored.size !== bytes.byteLength) throw new Error("r2_storage_failed");
      byteSize = stored.size;
    } else {
      if (!fileResponse.body) throw new Error("telegram_file_body_missing");
      if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) {
        await fileResponse.body.cancel();
        throw new Error("file_size_unknown");
      }
      const progress = { bytes: 0 };
      const countedBody = fileResponse.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          progress.bytes += chunk.byteLength;
          if (progress.bytes > maxBytes) throw new Error("file_too_large");
          controller.enqueue(chunk);
        },
        flush() {
          if (progress.bytes === 0) throw new Error("empty_file");
          if (expectedBytes > 0 && progress.bytes !== expectedBytes) throw new Error("telegram_file_size_mismatch");
        },
      }));
      // Pass FixedLengthStream's native readable half directly to R2. Wrapping it
      // in pipeThrough() strips the runtime's known-length marker, so large files fail.
      const fixedLengthStream = new FixedLengthStream(expectedBytes);
      const abortController = new AbortController();
      const uploadPromise = env.BUCKET.put(key, fixedLengthStream.readable, { httpMetadata, customMetadata: { intakeId, visibility: "private" } });
      const streamPromise = countedBody.pipeTo(fixedLengthStream.writable, { signal: abortController.signal });
      let stored: R2Object | null;
      try {
        [stored] = await Promise.all([uploadPromise, streamPromise]);
      } catch (error) {
        abortController.abort();
        await Promise.allSettled([uploadPromise, streamPromise]);
        throw error;
      }
      if (!stored || stored.size === 0 || stored.size > maxBytes) throw new Error("r2_storage_failed");
      byteSize = stored.size;
    }
    let coverKey: string | null = null;
    if (typeof item.cover_telegram_file_id === "string" && item.cover_telegram_file_id) {
      const coverInfoResponse = await fetch(`${base}/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(item.cover_telegram_file_id)}`, { headers: relayHeaders });
      const coverInfo = await coverInfoResponse.json() as JsonRecord;
      const coverResult = isRecord(coverInfo.result) ? coverInfo.result : null;
      if (coverInfoResponse.ok && coverInfo.ok === true && coverResult && typeof coverResult.file_path === "string") {
        const coverResponse = await fetch(`${base}/relay/file?path=${encodeURIComponent(coverResult.file_path)}`, { headers: relayHeaders });
        if (coverResponse.ok) {
          const coverBytes = await coverResponse.arrayBuffer();
          if (coverBytes.byteLength > 0 && coverBytes.byteLength <= 5 * 1024 * 1024) {
            coverKey = `covers/${intakeId}/cover.jpg`;
            await env.BUCKET.put(coverKey, coverBytes, { httpMetadata: { contentType: "image/jpeg" }, customMetadata: { intakeId, visibility: "private" } });
          }
        }
      }
    }
    const now = new Date().toISOString();
    const title = titleFromFile(typeof item.original_filename === "string" ? item.original_filename : "book.pdf");
    const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "book"}-${intakeId.slice(0, 8)}`;
    await env.DB.batch([
      env.DB.prepare("UPDATE intake_items SET status = 'draft', storage_key = ?, sha256 = ?, byte_size = ?, updated_at = ?, failure_code = NULL, failure_message = NULL WHERE id = ?").bind(key, checksum, byteSize, now, intakeId),
      env.DB.prepare("INSERT OR IGNORE INTO book_drafts (id, intake_id, title, slug, summary, metadata_json, publication_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)").bind(crypto.randomUUID(), intakeId, title, slug, "မူကြမ်းအဖြစ် စစ်ဆေးရန် စာအုပ်ဖိုင်ကို လက်ခံထားသည်။", JSON.stringify({ source: "telegram", assetKey: key, rightsStatus: "missing", ...(coverKey ? { public: { coverImage: `/book/${slug}/cover` } } : {}) }), now, now),
      env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'stored_in_r2', ?, ?)").bind(intakeId, JSON.stringify({ storageKey: key, byteSize, checksumComputed: Boolean(checksum) }), now),
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "processing_failed";
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE intake_items SET status = 'failed', failure_code = ?, failure_message = ?, retry_count = retry_count + 1, updated_at = ? WHERE id = ?").bind(message, message, now, intakeId).run();
    await env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'processing_failed', ?, ?)").bind(intakeId, JSON.stringify({ code: message }), now).run();
  }
}

async function processNextQueuedIntake(env: RuntimeEnv): Promise<boolean> {
  if (!env.BUCKET || !env.TELEGRAM_BOT_TOKEN) return false;
  const staleBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const candidate = await env.DB.prepare(`SELECT id FROM intake_items
    WHERE (status = 'received' OR (status = 'downloading' AND updated_at < ?))
      AND NOT EXISTS (SELECT 1 FROM intake_items WHERE status = 'downloading' AND updated_at >= ?)
    ORDER BY created_at ASC LIMIT 1`).bind(staleBefore, staleBefore).first<{ id: string }>();
  if (!candidate?.id) return false;

  const claimedAt = new Date().toISOString();
  const claimed = await env.DB.prepare(`UPDATE intake_items SET status = 'downloading', updated_at = ?
    WHERE id = ? AND (status = 'received' OR (status = 'downloading' AND updated_at < ?))`).bind(claimedAt, candidate.id, staleBefore).run();
  if (claimed.meta.changes !== 1) return false;

  await env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'processing_started', ?, ?)").bind(candidate.id, JSON.stringify({ source: "cron" }), claimedAt).run();
  await processIntake(candidate.id, env);
  return true;
}

async function receive(request: Request, env: RuntimeEnv): Promise<Response> {
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expectedSecret) return json({ ok: false, error: "webhook_not_configured" }, 503);
  if (!constantTimeEqual(request.headers.get("x-telegram-bot-api-secret-token"), expectedSecret)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return json({ ok: false, error: "unsupported_content_type" }, 415);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_UPDATE_BYTES) return json({ ok: false, error: "update_too_large" }, 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_UPDATE_BYTES) return json({ ok: false, error: "update_too_large" }, 413);
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  if (!isRecord(parsed) || !Number.isSafeInteger(parsed.update_id) || (parsed.update_id as number) < 0) return json({ ok: false, error: "invalid_update" }, 400);
  const message = findMessage(parsed);
  const chat = message && isRecord(message.chat) ? message.chat : null;
  const chatId = chat && (typeof chat.id === "number" || typeof chat.id === "string") ? String(chat.id) : null;
  if (!message || !chat || !chatId || (chat.type !== "group" && chat.type !== "supergroup") || !allowedChatIds(env.TELEGRAM_ALLOWED_CHAT_IDS ?? "").has(chatId)) return json({ ok: true, status: "ignored" });
  const wattpadUrl = wattpadUrlFor(message);
  const messageId = message.message_id;
  if (wattpadUrl && Number.isSafeInteger(messageId)) {
    const now = new Date().toISOString();
    const intakeId = crypto.randomUUID();
    const linkKey = `wattpad:${wattpadUrl}`;
    const metadata = wattpadMetadata(message);
    const slugBase = metadata.title.toLowerCase().replace(/[^a-z0-9\u1000-\u109f]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "wattpad-book";
    const slug = `${slugBase}-${intakeId.slice(0, 8)}`;
    const insert = await env.DB.prepare(`INSERT OR IGNORE INTO intake_items (id, telegram_update_id, telegram_file_id, media_type, source_type, source_url, source_chat_id, source_message_id, status, original_filename, mime_type, created_at, updated_at) VALUES (?, ?, ?, 'document', 'wattpad_link', ?, ?, ?, 'draft', ?, 'text/html', ?, ?)`).bind(intakeId, parsed.update_id, linkKey, wattpadUrl, chatId, messageId, metadata.title, now, now).run();
    const persisted = insert.meta.changes > 0 ? { id: intakeId } : await env.DB.prepare("SELECT id FROM intake_items WHERE telegram_update_id = ? OR telegram_file_id = ? LIMIT 1").bind(parsed.update_id, linkKey).first<{ id: string }>();
    if (!persisted?.id) throw new Error("persisted_link_not_found");
    if (insert.meta.changes > 0) await env.DB.batch([
      env.DB.prepare("INSERT INTO rights_records (id, intake_id, rights_status, created_at, updated_at) VALUES (?, ?, 'missing', ?, ?)").bind(crypto.randomUUID(), persisted.id, now, now),
      env.DB.prepare("INSERT INTO book_drafts (id, intake_id, title, slug, author, summary, metadata_json, publication_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)").bind(crypto.randomUUID(), persisted.id, metadata.title, slug, metadata.author, "Wattpad မူရင်းစာမျက်နှာသို့ သွားဖတ်ရန် link card ဖြစ်သည်။", JSON.stringify({ source: "telegram", sourceType: "wattpad_link", sourceUrl: wattpadUrl, public: { sourceType: "wattpad", externalUrl: wattpadUrl } }), now, now),
      env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'wattpad_link_received', ?, ?)").bind(persisted.id, JSON.stringify({ url: wattpadUrl }), now),
    ]);
    return json({ ok: true, status: insert.meta.changes > 0 ? "accepted" : "duplicate", updateId: parsed.update_id, intakeId: persisted.id, sourceType: "wattpad_link" });
  }
  const media = mediaFor(message);
  if (!media || !Number.isSafeInteger(messageId)) return json({ ok: true, status: "ignored" });
  const now = new Date().toISOString();
  const intakeId = crypto.randomUUID();
  const insert = await env.DB.prepare(`INSERT OR IGNORE INTO intake_items (id, telegram_update_id, telegram_file_id, cover_telegram_file_id, media_type, source_chat_id, source_message_id, status, original_filename, mime_type, byte_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?)`).bind(intakeId, parsed.update_id, media.fileId, media.coverFileId, media.type, chatId, messageId, media.fileName, media.mimeType, media.byteSize, now, now).run();
  const isNew = insert.meta.changes > 0;
  const persistedIntake = isNew ? { id: intakeId } : await env.DB.prepare("SELECT id FROM intake_items WHERE telegram_update_id = ? OR telegram_file_id = ? ORDER BY CASE WHEN telegram_update_id = ? THEN 0 ELSE 1 END LIMIT 1").bind(parsed.update_id, media.fileId, parsed.update_id).first<{ id: string }>();
  if (!persistedIntake?.id) throw new Error("persisted_intake_not_found");
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO rights_records (id, intake_id, rights_status, created_at, updated_at) VALUES (?, ?, 'missing', ?, ?)").bind(crypto.randomUUID(), persistedIntake.id, now, now),
    env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) SELECT ?, 'received', '{}', ? WHERE NOT EXISTS (SELECT 1 FROM ingestion_events WHERE intake_id = ? AND event_type = 'received')").bind(persistedIntake.id, now, persistedIntake.id),
  ]);
  return json({ ok: true, status: isNew ? "accepted" : "duplicate", updateId: parsed.update_id, intakeId: persistedIntake.id });
}

async function catalog(request: Request, env: RuntimeEnv): Promise<Response> {
  const origin = env.CATALOG_ORIGIN;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin ?? "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } });
  if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405, origin);
  const statement = env.DB.prepare("SELECT id, title, slug, author, category, year, summary, reading_time, metadata_json, updated_at FROM book_drafts WHERE publication_status = 'published' ORDER BY updated_at DESC");
  const result = statement.all ? await statement.all<JsonRecord>() : { results: [] };
  const books = result.results.map((book) => { let metadata: JsonRecord = {}; try { metadata = JSON.parse(typeof book.metadata_json === "string" ? book.metadata_json : "{}"); } catch {} const publicMeta = isRecord(metadata.public) ? { ...metadata.public } : {}; if (typeof publicMeta.coverImage === "string" && publicMeta.coverImage.startsWith("/")) publicMeta.coverImage = new URL(publicMeta.coverImage, request.url).toString(); return { id: book.id, title: book.title, slug: book.slug, author: book.author, category: book.category, year: book.year, summary: book.summary, readingTime: book.reading_time, pdfUrl: new URL(`/book/${encodeURIComponent(String(book.slug))}/pdf`, request.url).toString(), ...publicMeta }; });
  return json({ ok: true, books }, 200, origin);
}

async function adminDrafts(request: Request, env: RuntimeEnv): Promise<Response> {
  if (!env.ADMIN_TOKEN || !constantTimeEqual(request.headers.get("x-admin-token"), env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
  if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const statement = env.DB.prepare(`SELECT COALESCE(b.id, i.id) AS id, i.id AS intake_id, COALESCE(b.title, i.original_filename, 'စာအုပ်အသစ်') AS title, b.slug, b.author, b.category, b.year, b.summary, b.metadata_json, COALESCE(b.publication_status, i.status) AS publication_status, COALESCE(b.updated_at, i.updated_at) AS updated_at, i.status AS intake_status, i.original_filename, i.storage_key, i.source_type, i.source_url, i.failure_code, i.failure_message, r.rights_status, r.rights_holder, r.evidence_note, r.allowed_uses, r.reviewer, r.reviewed_at FROM intake_items i LEFT JOIN book_drafts b ON b.intake_id = i.id LEFT JOIN rights_records r ON r.intake_id = i.id ORDER BY i.updated_at DESC`);
  const result = statement.all ? await statement.all<JsonRecord>() : { results: [] };
  return json({ ok: true, drafts: result.results });
}

async function retryIntake(request: Request, env: RuntimeEnv, intakeId: string): Promise<Response> {
  if (!env.ADMIN_TOKEN || !constantTimeEqual(request.headers.get("x-admin-token"), env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!/^[0-9a-f-]{36}$/i.test(intakeId)) return json({ ok: false, error: "invalid_intake_id" }, 400);
  if (!env.BUCKET || !env.TELEGRAM_BOT_TOKEN) return json({ ok: false, error: "processor_unavailable" }, 503);
  const item = await env.DB.prepare("SELECT id, status, media_type, mime_type, original_filename, telegram_file_id FROM intake_items WHERE id = ? LIMIT 1").bind(intakeId).first<JsonRecord>();
  if (!item) return json({ ok: false, error: "intake_not_found" }, 404);
  if (item.status !== "failed") return json({ ok: false, error: "intake_not_failed" }, 409);
  const isPdf = item.media_type === "document" && ((typeof item.mime_type === "string" && item.mime_type.toLowerCase() === "application/pdf") || (typeof item.original_filename === "string" && item.original_filename.toLowerCase().endsWith(".pdf")));
  if (!isPdf || typeof item.telegram_file_id !== "string") return json({ ok: false, error: "pdf_retry_unavailable" }, 409);
  const now = new Date().toISOString();
  const queued = await env.DB.prepare("UPDATE intake_items SET status = 'received', failure_code = NULL, failure_message = NULL, updated_at = ? WHERE id = ? AND status = 'failed'").bind(now, intakeId).run();
  if (queued.meta.changes === 0) return json({ ok: false, error: "intake_not_failed" }, 409);
  await env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'retry_queued', '{}', ?)").bind(intakeId, now).run();
  return json({ ok: true, status: "retrying", intakeId }, 202);
}

async function approveAndPublish(request: Request, env: RuntimeEnv, slug: string): Promise<Response> {
  if (!env.ADMIN_TOKEN || !constantTimeEqual(request.headers.get("x-admin-token"), env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
  const book = await env.DB.prepare("SELECT id, intake_id FROM book_drafts WHERE slug = ? LIMIT 1").bind(slug).first<{ id: string; intake_id: string }>();
  if (!book) return json({ ok: false, error: "book_not_found" }, 404);
  let body: JsonRecord = {};
  try { body = await request.json() as JsonRecord; } catch {}
  const evidenceNote = typeof body.evidenceNote === "string" ? body.evidenceNote.slice(0, 500) : "Admin dashboard confirmation";
  const rightsHolder = typeof body.rightsHolder === "string" ? body.rightsHolder.slice(0, 180) : null;
  const allowedUses = typeof body.allowedUses === "string" ? body.allowedUses.slice(0, 180) : "Website catalog reading";
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE rights_records SET rights_status = 'approved', rights_holder = ?, evidence_note = ?, allowed_uses = ?, reviewer = 'admin', reviewed_at = ?, updated_at = ? WHERE intake_id = ?").bind(rightsHolder, evidenceNote, allowedUses, now, now, book.intake_id),
    env.DB.prepare("UPDATE book_drafts SET publication_status = 'published', updated_at = ? WHERE id = ?").bind(now, book.id),
    env.DB.prepare("UPDATE intake_items SET status = 'published', updated_at = ?, failure_code = NULL, failure_message = NULL WHERE id = ?").bind(now, book.intake_id),
    env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'rights_approved', ?, ?)").bind(book.intake_id, JSON.stringify({ reviewer: "admin" }), now),
    env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'published', '{}', ?)").bind(book.intake_id, now),
  ]);
  return json({ ok: true, status: "published", rightsStatus: "approved", slug });
}

async function updateBook(request: Request, env: RuntimeEnv, slug: string): Promise<Response> {
  if (!env.ADMIN_TOKEN || !constantTimeEqual(request.headers.get("x-admin-token"), env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
  let body: JsonRecord;
  try { body = await request.json() as JsonRecord; } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const book = await env.DB.prepare("SELECT id, metadata_json FROM book_drafts WHERE slug = ? LIMIT 1").bind(slug).first<{ id: string; metadata_json: string }>();
  if (!book) return json({ ok: false, error: "book_not_found" }, 404);
  const text = (key: string, max: number) => typeof body[key] === "string" ? String(body[key]).trim().slice(0, max) : null;
  let metadata: JsonRecord = {};
  try { metadata = JSON.parse(book.metadata_json || "{}"); } catch {}
  const publicMeta = isRecord(metadata.public) ? metadata.public : {};
  const coverImage = text("coverImage", 1000);
  const nextPublic = { ...publicMeta, ...(coverImage ? { coverImage } : {}) };
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE book_drafts SET title = COALESCE(?, title), author = COALESCE(?, author), category = COALESCE(?, category), year = COALESCE(?, year), summary = COALESCE(?, summary), metadata_json = ?, updated_at = ? WHERE id = ?").bind(text("title", 180), text("author", 180), text("category", 100), text("year", 20), text("summary", 1000), JSON.stringify({ ...metadata, public: nextPublic }), now, book.id).run();
  return json({ ok: true, status: "updated", slug });
}

async function deleteBook(request: Request, env: RuntimeEnv, slug: string): Promise<Response> {
  if (!env.ADMIN_TOKEN || !constantTimeEqual(request.headers.get("x-admin-token"), env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
  const book = await env.DB.prepare("SELECT id, intake_id FROM book_drafts WHERE slug = ? LIMIT 1").bind(slug).first<{ id: string; intake_id: string }>();
  if (!book) return json({ ok: false, error: "book_not_found" }, 404);
  const item = await env.DB.prepare("SELECT storage_key FROM intake_items WHERE id = ? LIMIT 1").bind(book.intake_id).first<{ storage_key: string | null }>();
  const now = new Date().toISOString();
  if (item?.storage_key && env.BUCKET) await env.BUCKET.delete(item.storage_key);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ingestion_events WHERE intake_id = ?").bind(book.intake_id),
    env.DB.prepare("DELETE FROM rights_records WHERE intake_id = ?").bind(book.intake_id),
    env.DB.prepare("DELETE FROM book_drafts WHERE id = ?").bind(book.id),
    env.DB.prepare("DELETE FROM intake_items WHERE id = ?").bind(book.intake_id),
  ]);
  return json({ ok: true, status: "deleted", slug, deletedAt: now });
}

function publicAssetCorsHeaders(env: RuntimeEnv): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.CATALOG_ORIGIN ?? "*",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Disposition, ETag",
  };
}

function httpEtag(value: string): string {
  const tag = value.trim();
  if ((tag.startsWith('"') || tag.startsWith('W/"')) && tag.endsWith('"')) return tag;
  return `"${tag.replace(/["\r\n]/g, "")}"`;
}

function publicAssetPreflight(env: RuntimeEnv): Response {
  return new Response(null, { status: 204, headers: {
    ...publicAssetCorsHeaders(env),
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, If-Range, If-None-Match, If-Modified-Since",
    "Access-Control-Max-Age": "86400",
  } });
}

async function bookPdf(request: Request, env: RuntimeEnv, slug: string): Promise<Response> {
  if (!env.BUCKET) return json({ ok: false, error: "storage_unavailable" }, 503);
  const book = await env.DB.prepare("SELECT i.storage_key, i.byte_size FROM book_drafts b JOIN intake_items i ON i.id = b.intake_id WHERE b.slug = ? AND b.publication_status = 'published' AND i.status = 'published' LIMIT 1").bind(slug).first<{ storage_key: string | null; byte_size: number | null }>();
  if (!book?.storage_key) return json({ ok: false, error: "book_not_published" }, 404);
  const totalSize = typeof book.byte_size === "number" && book.byte_size > 0 ? book.byte_size : null;
  const requested = request.headers.get("range");
  let range: R2Range | undefined;
  let contentRange: string | undefined;
  if (requested && totalSize) {
    const match = requested.match(/^bytes=(\d*)-(\d*)$/);
    if (match) {
      const start = match[1] ? Number(match[1]) : Math.max(0, totalSize - Number(match[2] || 0));
      const end = match[2] ? Number(match[2]) : totalSize - 1;
      if (Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end >= start && start < totalSize) {
        const boundedEnd = Math.min(end, totalSize - 1);
        range = { offset: start, length: boundedEnd - start + 1 };
        contentRange = `bytes ${start}-${boundedEnd}/${totalSize}`;
      }
    }
  }
  const object = await env.BUCKET.get(book.storage_key, range ? { range } : undefined);
  if (!object) return json({ ok: false, error: "file_not_found" }, 404);
  const headers: Record<string, string> = {
    "Content-Type": object.httpMetadata?.contentType ?? "application/pdf",
    "Content-Disposition": "inline",
    "Cache-Control": "public, max-age=300",
    "Accept-Ranges": "bytes",
    "Content-Length": String(object.size),
    ETag: httpEtag(object.httpEtag),
    ...publicAssetCorsHeaders(env),
  };
  if (contentRange) headers["Content-Range"] = contentRange;
  return new Response(request.method === "HEAD" ? null : object.body, { status: contentRange ? 206 : 200, headers });
}

async function bookCover(request: Request, env: RuntimeEnv, slug: string): Promise<Response> {
  if (!env.BUCKET) return json({ ok: false, error: "storage_unavailable" }, 503);
  const book = await env.DB.prepare("SELECT i.id FROM book_drafts b JOIN intake_items i ON i.id = b.intake_id WHERE b.slug = ? AND b.publication_status = 'published' AND i.status = 'published' LIMIT 1").bind(slug).first<{ id: string }>();
  if (!book) return json({ ok: false, error: "book_not_published" }, 404);
  const object = await env.BUCKET.get(`covers/${book.id}/cover.jpg`);
  if (!object) return json({ ok: false, error: "cover_not_found" }, 404);
  return new Response(request.method === "HEAD" ? null : object.body, { headers: {
    "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg",
    "Cache-Control": "public, max-age=3600",
    "Content-Length": String(object.size),
    ETag: httpEtag(object.httpEtag),
    ...publicAssetCorsHeaders(env),
  } });
}

async function publish(request: Request, env: RuntimeEnv, slug: string): Promise<Response> {
  if (!env.ADMIN_TOKEN || !constantTimeEqual(request.headers.get("x-admin-token"), env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
  const book = await env.DB.prepare("SELECT id, intake_id FROM book_drafts WHERE slug = ? LIMIT 1").bind(slug).first<{ id: string; intake_id: string }>();
  if (!book) return json({ ok: false, error: "book_not_found" }, 404);
  const rights = await env.DB.prepare("SELECT rights_status FROM rights_records WHERE intake_id = ? LIMIT 1").bind(book.intake_id).first<{ rights_status: string }>();
  if (rights?.rights_status !== "approved") return json({ ok: false, error: "rights_not_approved" }, 409);
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE book_drafts SET publication_status = 'published', updated_at = ? WHERE id = ?").bind(now, book.id),
    env.DB.prepare("UPDATE intake_items SET status = 'published', updated_at = ?, failure_code = NULL, failure_message = NULL WHERE id = ?").bind(now, book.intake_id),
    env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'published', '{}', ?)").bind(book.intake_id, now),
  ]);
  return json({ ok: true, status: "published", slug });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const runtimeEnv = await resolveSecrets(env);
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "telegram-ingestion", storage: Boolean(runtimeEnv.BUCKET), processor: Boolean(runtimeEnv.TELEGRAM_BOT_TOKEN) });
    if (request.method === "OPTIONS" && url.pathname.startsWith("/book/") && (url.pathname.endsWith("/pdf") || url.pathname.endsWith("/cover"))) return publicAssetPreflight(runtimeEnv);
    if (url.pathname === "/catalog") return catalog(request, runtimeEnv);
    if (request.method === "POST" && url.pathname === "/telegram/webhook") return receive(request, runtimeEnv);
    if (url.pathname === "/admin/drafts") return adminDrafts(request, runtimeEnv);
    if (url.pathname.startsWith("/admin/retry/")) return retryIntake(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/admin/retry/".length)));
    if (request.method === "POST" && url.pathname.startsWith("/admin/approve-publish/")) return approveAndPublish(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/admin/approve-publish/".length)));
    if (request.method === "PUT" && url.pathname.startsWith("/admin/update/")) return updateBook(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/admin/update/".length)));
    if (request.method === "DELETE" && url.pathname.startsWith("/admin/delete/")) return deleteBook(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/admin/delete/".length)));
    if (request.method === "POST" && url.pathname.startsWith("/admin/publish/")) return publish(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/admin/publish/".length)));
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/book/") && url.pathname.endsWith("/cover")) return bookCover(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/book/".length, -6)));
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/book/") && url.pathname.endsWith("/pdf")) return bookPdf(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/book/".length, -4)));
    return json({ ok: false, error: "not_found" }, 404);
  },
  async scheduled(_controller: { cron: string; scheduledTime: number }, env: Env): Promise<void> {
    const runtimeEnv = await resolveSecrets(env);
    await processNextQueuedIntake(runtimeEnv);
  },
};
