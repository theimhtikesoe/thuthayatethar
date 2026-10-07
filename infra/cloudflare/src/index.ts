type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  run: () => Promise<{ meta: { changes: number } }>;
};

type D1Database = {
  prepare: (query: string) => D1Statement;
  batch: (statements: D1Statement[]) => Promise<unknown>;
};

export interface Env {
  DB: D1Database;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_ALLOWED_CHAT_IDS: string;
}

type JsonRecord = Record<string, unknown>;
type MediaType = "document" | "photo";
const MAX_UPDATE_BYTES = 256 * 1024;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function json(body: JsonRecord, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function constantTimeEqual(supplied: string | null, expected: string): boolean {
  if (!supplied || supplied.length !== expected.length || supplied.length > 256) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= supplied.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

function allowedChatIds(value: string): Set<string> {
  return new Set(value.split(",").map((id) => id.trim()).filter((id) => /^-?\d+$/.test(id)));
}

function findMessage(update: JsonRecord): JsonRecord | null {
  const candidate = [update.message, update.edited_message].find(isRecord);
  return candidate ?? null;
}

function mediaFor(message: JsonRecord): { type: MediaType; fileId: string; fileName: string | null; mimeType: string | null; byteSize: number | null } | null {
  const document = message.document;
  if (isRecord(document) && typeof document.file_id === "string") {
    return {
      type: "document",
      fileId: document.file_id,
      fileName: typeof document.file_name === "string" ? document.file_name : null,
      mimeType: typeof document.mime_type === "string" ? document.mime_type : null,
      byteSize: typeof document.file_size === "number" ? document.file_size : null,
    };
  }
  const photos = message.photo;
  if (Array.isArray(photos)) {
    const photo = photos.filter(isRecord).find((item) => typeof item.file_id === "string");
    if (photo && typeof photo.file_id === "string") {
      return {
        type: "photo",
        fileId: photo.file_id,
        fileName: null,
        mimeType: "image/jpeg",
        byteSize: typeof photo.file_size === "number" ? photo.file_size : null,
      };
    }
  }
  return null;
}

async function receive(request: Request, env: Env): Promise<Response> {
  if (!constantTimeEqual(request.headers.get("x-telegram-bot-api-secret-token"), env.TELEGRAM_WEBHOOK_SECRET)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ ok: false, error: "unsupported_content_type" }, 415);
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_UPDATE_BYTES) return json({ ok: false, error: "update_too_large" }, 413);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_UPDATE_BYTES) return json({ ok: false, error: "update_too_large" }, 413);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  if (!isRecord(parsed) || !Number.isSafeInteger(parsed.update_id) || (parsed.update_id as number) < 0) {
    return json({ ok: false, error: "invalid_update" }, 400);
  }

  const message = findMessage(parsed);
  const chat = message && isRecord(message.chat) ? message.chat : null;
  const chatId = chat && (typeof chat.id === "number" || typeof chat.id === "string") ? String(chat.id) : null;
  if (!message || !chat || !chatId || (chat.type !== "group" && chat.type !== "supergroup") || !allowedChatIds(env.TELEGRAM_ALLOWED_CHAT_IDS).has(chatId)) {
    return json({ ok: true, status: "ignored" });
  }

  const media = mediaFor(message);
  const messageId = message.message_id;
  if (!media || !Number.isSafeInteger(messageId)) return json({ ok: true, status: "ignored" });

  const now = new Date().toISOString();
  const intakeId = crypto.randomUUID();
  const insert = await env.DB.prepare(`
    INSERT OR IGNORE INTO intake_items
      (id, telegram_update_id, telegram_file_id, media_type, source_chat_id, source_message_id,
       status, original_filename, mime_type, byte_size, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?)
  `).bind(
    intakeId,
    parsed.update_id,
    media.fileId,
    media.type,
    chatId,
    messageId,
    media.fileName,
    media.mimeType,
    media.byteSize,
    now,
    now,
  ).run();

  if (insert.meta.changes > 0) {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO rights_records (id, intake_id, rights_status, created_at, updated_at) VALUES (?, ?, 'missing', ?, ?)`)
        .bind(crypto.randomUUID(), intakeId, now, now),
      env.DB.prepare(`INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'received', '{}', ?)`)
        .bind(intakeId, now),
    ]);
    return json({ ok: true, status: "accepted", updateId: parsed.update_id, intakeId });
  }

  // Duplicate update/file: acknowledge safely without creating a second job.
  return json({ ok: true, status: "duplicate", updateId: parsed.update_id });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "telegram-ingestion" });
    if (request.method === "POST" && url.pathname === "/telegram/webhook") return receive(request, env);
    return json({ ok: false, error: "not_found" }, 404);
  },
};
