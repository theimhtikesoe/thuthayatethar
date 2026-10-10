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
  AUTO_PUBLISH_FROM?: string;
  CATALOG_ORIGIN?: string | SecretStoreBinding;
  ADMIN_TOKEN?: string | SecretStoreBinding;
  TELEGRAM_WEBHOOK_SECRET_STORE?: SecretStoreBinding;
  TELEGRAM_BOT_TOKEN_STORE?: SecretStoreBinding;
  ADMIN_TOKEN_STORE?: SecretStoreBinding;
  YOUTUBE_CONVERTER_URL?: string;
  YOUTUBE_CONVERTER_CALLBACK_URL?: string;
  YOUTUBE_CONVERTER_SECRET?: string | SecretStoreBinding;
}

type RuntimeEnv = Omit<Env, "TELEGRAM_WEBHOOK_SECRET" | "TELEGRAM_ALLOWED_CHAT_IDS" | "TELEGRAM_BOT_TOKEN" | "CATALOG_ORIGIN" | "ADMIN_TOKEN" | "FILE_RELAY_ACCESS_ID" | "FILE_RELAY_ACCESS_SECRET"> & {
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ALLOWED_CHAT_IDS?: string;
  TELEGRAM_BOT_TOKEN?: string;
  CATALOG_ORIGIN?: string;
  ADMIN_TOKEN?: string;
  FILE_RELAY_ACCESS_ID?: string;
  FILE_RELAY_ACCESS_SECRET?: string;
  YOUTUBE_CONVERTER_SECRET?: string;
};

type JsonRecord = Record<string, unknown>;
type MediaType = "document" | "photo";
const MAX_UPDATE_BYTES = 256 * 1024;
const DEFAULT_MAX_FILE_BYTES = 20 * 1024 * 1024;
// Telegram PDFs received before this instant stay private drafts. Override with the AUTO_PUBLISH_FROM var.
// This must be a fixed value: a module-scope `new Date()` changes with every isolate start.
const DEFAULT_AUTO_PUBLISH_FROM = "2026-10-09T08:06:29.995077Z"; // first production auto-publish Worker deployment; 2026-10-09 15:06 UTC+7
const MAX_SOUNDCLOUD_PAGE_BYTES = 1024 * 1024;
const MAX_SOUNDCLOUD_COLLECTION_TRACKS = 50;
const SOUNDCLOUD_FETCH_TIMEOUT_MS = 8_000;

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
    YOUTUBE_CONVERTER_SECRET: await secretValue(env.YOUTUBE_CONVERTER_SECRET),
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
  const match = values.join(" ").match(/https?:\/\/(?:www\.)?wattpad\.com\/(?:story\/)?\d+(?:[^\s<>]*)?/i);
  if (!match) return null;
  try {
    const url = new URL(match[0].replace(/[),.!?;:\]]+$/g, ""));
    return `https://www.wattpad.com${url.pathname}`;
  } catch { return null; }
}

function wattpadMetadata(message: JsonRecord, wattpadUrl: string): { title: string; author: string | null } {
  const text = [message.text, message.caption].find((value) => typeof value === "string") as string | undefined;
  const match = text?.match(/["“](.+?)["”]\s+by\s+\*?([^*\n]+?)(?:\s+on\s+Wattpad|\s+https?:\/\/|$)/i);
  let linkedTitle = "";
  try {
    const parts = new URL(wattpadUrl).pathname.split("/").filter(Boolean);
    const chapterPath = parts.length === 1 ? parts[0] : "";
    const storyPath = parts[0] === "story" ? parts[1] ?? "" : "";
    const identifierAndSlug = chapterPath || storyPath;
    const slug = identifierAndSlug.replace(/^\d+-?/, "");
    const part = slug.match(/^part[-_ ]?(\d+)$/i);
    linkedTitle = part ? `Wattpad အပိုင်း ${part[1]}` : decodeURIComponent(slug).replace(/[-_]+/g, " ").trim();
  } catch { /* Keep a generic title when the external URL cannot be decoded. */ }
  return { title: match?.[1]?.trim().slice(0, 180) || linkedTitle.slice(0, 180) || "Wattpad စာအုပ်", author: match?.[2]?.trim().slice(0, 180) || null };
}

function normalizeYouTubeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const id = host === "youtu.be" ? url.pathname.slice(1) : (host === "youtube.com" || host === "m.youtube.com") ? (url.pathname === "/watch" ? url.searchParams.get("v") ?? "" : url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1] ?? "") : "";
    return ["https:", "http:"].includes(url.protocol) && /^[A-Za-z0-9_-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
  } catch { return null; }
}

function youtubeUrlsFor(message: JsonRecord): string[] {
  const values: string[] = [];
  for (const key of ["text", "caption"]) if (typeof message[key] === "string") values.push(message[key] as string);
  for (const key of ["entities", "caption_entities"]) {
    const entities = message[key];
    if (Array.isArray(entities)) for (const entity of entities) if (isRecord(entity) && typeof entity.url === "string") values.push(entity.url);
  }
  const urls: string[] = [];
  for (const value of values) for (const candidate of value.match(/https?:\/\/[^\s<>]+/gi) ?? []) {
    const normalized = normalizeYouTubeUrl(candidate.replace(/[),.!?;:\]]+$/g, ""));
    if (normalized && !urls.includes(normalized)) urls.push(normalized);
    if (urls.length >= 50) return urls;
  }
  return urls;
}

function youtubeMetadata(message: JsonRecord, url: string): { title: string; author: string | null } {
  const text = [message.text, message.caption].find((value) => typeof value === "string") as string | undefined;
  const clean = (text ?? "").replace(/https?:\/\/[^\s<>]+/gi, " ").replace(/\s+/g, " ").trim();
  return { title: clean.slice(0, 180) || `YouTube အသံစာအုပ် ${new URL(url).searchParams.get("v")}`, author: null };
}

function normalizeAudioUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (["youtube.com", "m.youtube.com", "youtu.be", "soundcloud.com", "on.soundcloud.com"].includes(host)) return null;
    return url.toString();
  } catch { return null; }
}
function normalizeSoundCloudUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || (host !== "soundcloud.com" && host !== "on.soundcloud.com")) return null;
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch { return null; }
}

const MAX_SOUNDCLOUD_LINKS_PER_MESSAGE = 10;

function soundcloudUrlsFor(message: JsonRecord): string[] {
  const values: string[] = [];
  for (const key of ["text", "caption"]) if (typeof message[key] === "string") values.push(message[key] as string);
  for (const key of ["entities", "caption_entities"]) {
    const entities = message[key];
    if (Array.isArray(entities)) for (const entity of entities) if (isRecord(entity) && typeof entity.url === "string") values.push(entity.url);
  }
  const urls: string[] = [];
  for (const value of values) {
    const candidates = value.match(/https?:\/\/[^\s<>]+/gi) ?? [];
    for (const candidate of candidates) {
      const normalized = normalizeSoundCloudUrl(candidate.replace(/[),.!?;:\]]+$/g, ""));
      if (normalized && !urls.includes(normalized)) urls.push(normalized);
      if (urls.length >= MAX_SOUNDCLOUD_LINKS_PER_MESSAGE) return urls;
    }
  }
  return urls;
}

function soundcloudMetadata(message: JsonRecord, soundcloudUrl: string, useCaption = true): { title: string; author: string | null } {
  const text = useCaption ? [message.text, message.caption].find((value) => typeof value === "string") as string | undefined : undefined;
  const clean = (text ?? "").replace(/https?:\/\/[^\s<>]+/gi, " ").replace(/\s+/g, " ").trim();
  const match = clean.match(/(.+?)\s+by\s+(.+)/i);
  let trackTitle = "";
  try {
    trackTitle = decodeURIComponent(new URL(soundcloudUrl).pathname.split("/").filter(Boolean).at(-1) ?? "").replace(/[-_]+/g, " ").trim();
  } catch { /* The validated URL parser will provide a generic title if necessary. */ }
  if (trackTitle.toLowerCase() === "xj3aq3cyzsn4" || clean.toLowerCase() === "xj3aq3cyzsn4") {
    return { title: "ဝင်းဖေ ဝတ္ထုတိုများ", author: match?.[2]?.slice(0, 180) || null };
  }
  return { title: (match?.[1] ?? clean).slice(0, 180) || trackTitle.slice(0, 180) || "SoundCloud အသံစာအုပ်", author: match?.[2]?.slice(0, 180) || null };
}

type SoundCloudTrack = { url: string; title: string; author: string | null; artworkUrl: string | null };

type SoundCloudCollectionType = "channel" | "set";

function soundCloudCollectionType(value: string): SoundCloudCollectionType | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase().replace(/^www\./, "") !== "soundcloud.com") return null;
    const parts = url.pathname.split("/").filter(Boolean).map((part) => part.toLowerCase());
    if (parts.length === 1 || (parts.length === 2 && ["popular-tracks", "tracks"].includes(parts[1]))) return "channel";
    if (parts.length === 3 && parts[1] === "sets") return "set";
    return null;
  } catch { return null; }
}

function isSoundCloudCollectionUrl(value: string): boolean {
  return soundCloudCollectionType(value) !== null;
}

function htmlAttribute(tag: string, name: string): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? (match[1] ?? match[2] ?? match[3] ?? null) : null;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|mdash|ndash|rsquo|lsquo|rdquo|ldquo|hellip);/gi, (whole, raw: string) => {
    const entity = raw.toLowerCase();
    if (entity.startsWith("#")) {
      const codePoint = entity.startsWith("#x") ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
      try { return Number.isFinite(codePoint) && codePoint > 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : whole; }
      catch { return whole; }
    }
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };
    return named[entity] ?? whole;
  });
}

function soundCloudArtworkUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "i1.sndcdn.com") return null;
    return url.toString();
  } catch { return null; }
}

function soundCloudTracksFromHydration(html: string, maxTracks: number): SoundCloudTrack[] {
  const match = html.match(/window\.__sc_hydration\s*=\s*(\[[\s\S]*?\])\s*;?\s*<\/script>/i);
  if (!match) return [];
  let payload: unknown;
  try { payload = JSON.parse(match[1]); } catch { return []; }
  if (!Array.isArray(payload)) return [];
  const playlist = payload.find((item) => isRecord(item) && item.hydratable === "playlist" && isRecord(item.data));
  if (!isRecord(playlist) || !isRecord(playlist.data) || !Array.isArray(playlist.data.tracks)) return [];
  const tracks: SoundCloudTrack[] = [];
  const seen = new Set<string>();
  for (const item of playlist.data.tracks) {
    if (!isRecord(item) || typeof item.permalink_url !== "string") continue;
    const url = normalizeSoundCloudUrl(item.permalink_url);
    if (!url) continue;
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase().replace(/^www\./, "") !== "soundcloud.com" || parsed.pathname.split("/").filter(Boolean).length !== 2 || seen.has(url)) continue;
    const user = isRecord(item.user) ? item.user : null;
    const author = typeof user?.username === "string" ? user.username : typeof user?.full_name === "string" ? user.full_name : null;
    const title = typeof item.title === "string" ? item.title.trim().slice(0, 180) : "";
    tracks.push({ url, title: title || decodeURIComponent(parsed.pathname.split("/").filter(Boolean).at(-1) ?? "").replace(/[-_]+/g, " ").slice(0, 180), author, artworkUrl: soundCloudArtworkUrl(item.artwork_url) });
    seen.add(url);
    if (tracks.length >= maxTracks) break;
  }
  return tracks;
}

function soundCloudTracksFromPage(html: string, pageUrl: string, maxTracks = MAX_SOUNDCLOUD_COLLECTION_TRACKS): SoundCloudTrack[] {
  const page = new URL(pageUrl);
  const pageParts = page.pathname.split("/").filter(Boolean).map((part) => part.toLowerCase());
  const collectionType = soundCloudCollectionType(pageUrl);
  const channelSlug = pageParts[0];
  if (!channelSlug || !collectionType) return [];
  const tracks = soundCloudTracksFromHydration(html, maxTracks);
  const seen = new Set(tracks.map((track) => track.url));
  const articlePattern = /<article\b(?=[^>]*\bitemprop\s*=\s*["']track["'])[^>]*>([\s\S]*?)<\/article>/gi;
  let article: RegExpExecArray | null;
  while ((article = articlePattern.exec(html)) !== null) {
    const block = article[1];
    const anchors = block.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) ?? [];
    let track: SoundCloudTrack | null = null;
    let pageAuthor: string | null = null;
    for (const anchor of anchors) {
      const openingTag = anchor.match(/^<a\b[^>]*>/i)?.[0];
      if (!openingTag) continue;
      const href = htmlAttribute(openingTag, "href");
      if (!href) continue;
      const text = decodeHtmlEntities(anchor.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
      if (htmlAttribute(openingTag, "itemprop")?.toLowerCase() === "url") {
        try {
          const target = new URL(decodeHtmlEntities(href), page.origin);
          const parts = target.pathname.split("/").filter(Boolean);
          const canonical = normalizeSoundCloudUrl(target.href);
          if (canonical && target.hostname.toLowerCase().replace(/^www\./, "") === "soundcloud.com" && parts.length === 2 && parts.every(Boolean)) {
            target.search = "";
            target.hash = "";
            const url = `${target.origin}${target.pathname}`;
            if (url !== page.href.replace(/\/$/, "") && !seen.has(url)) track = { url, title: text.slice(0, 180) || "SoundCloud အသံစာအုပ်", author: null, artworkUrl: null };
          }
        } catch { /* Ignore malformed track permalinks. */ }
      } else {
        try {
          const target = new URL(decodeHtmlEntities(href), page.origin);
          const parts = target.pathname.split("/").filter(Boolean);
          if (target.hostname.toLowerCase().replace(/^www\./, "") === "soundcloud.com" && parts.length === 1 && text && (collectionType === "set" || parts[0].toLowerCase() === channelSlug)) pageAuthor = text.slice(0, 180);
        } catch { /* Ignore malformed artist links. */ }
      }
    }
    if (track && !seen.has(track.url)) {
      track.author = pageAuthor;
      seen.add(track.url);
      tracks.push(track);
      if (tracks.length >= maxTracks) break;
    }
  }
  return tracks;
}

async function readSoundCloudHtml(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("soundcloud_page_body_missing");
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) break;
    byteLength += result.value.byteLength;
    if (byteLength > MAX_SOUNDCLOUD_PAGE_BYTES) {
      await reader.cancel("soundcloud_page_too_large");
      throw new Error("soundcloud_page_too_large");
    }
    chunks.push(result.value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function fetchSoundCloudCollectionTracks(channelUrl: string): Promise<SoundCloudTrack[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("soundcloud_fetch_timeout"), SOUNDCLOUD_FETCH_TIMEOUT_MS);
  try {
    let currentUrl = new URL(channelUrl);
    let response: Response | null = null;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      response = await fetch(currentUrl.toString(), { headers: { Accept: "text/html" }, redirect: "manual", signal: controller.signal });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location || redirects === 3) throw new Error("soundcloud_page_redirect_rejected");
      const nextUrl = new URL(location, currentUrl);
      if (nextUrl.protocol !== "https:" || nextUrl.hostname.toLowerCase().replace(/^www\./, "") !== "soundcloud.com") throw new Error("soundcloud_page_redirect_rejected");
      currentUrl = nextUrl;
    }
    if (!response) throw new Error("soundcloud_page_fetch_failed");
    if (!response.ok) throw new Error(`soundcloud_page_http_${response.status}`);
    const finalUrl = response.url ? new URL(response.url) : new URL(channelUrl);
    if (finalUrl.protocol !== "https:" || finalUrl.hostname.toLowerCase().replace(/^www\./, "") !== "soundcloud.com") throw new Error("soundcloud_page_redirect_rejected");
    if (!response.headers.get("content-type")?.toLowerCase().includes("text/html")) throw new Error("soundcloud_page_not_html");
    const html = await readSoundCloudHtml(response);
    return soundCloudTracksFromPage(html, currentUrl.toString());
  } finally { clearTimeout(timeout); }
}

function soundCloudTrackUpdateId(trackUrl: string): number {
  let first = 2166136261;
  let second = 2246822519;
  const key = `soundcloud:${trackUrl}`;
  for (let index = 0; index < key.length; index += 1) {
    const code = key.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619) >>> 0;
    second = Math.imul(second ^ code, 3266489917) >>> 0;
  }
  const safeHash = first * 2097152 + (second >>> 11);
  return -(safeHash || 1);
}

type LinkIntakeInput = {
  sourceType: "wattpad_link" | "soundcloud_link" | "youtube_link";
  eventType: "wattpad_link_received" | "soundcloud_link_received" | "soundcloud_track_received" | "youtube_link_received";
  url: string;
  linkKey: string;
  updateId: number;
  chatId: string;
  messageId: number;
  title: string;
  author: string | null;
  summary: string;
  category: string | null;
  soundcloudUrl: string | null;
  youtubeUrl?: string | null;
  slugFallback: string;
  metadata: JsonRecord;
  eventDetail: JsonRecord;
};

// Every statement is idempotent, so replaying an update also repairs rows left behind by an interrupted batch.
async function saveLinkIntake(env: RuntimeEnv, input: LinkIntakeInput): Promise<{ intakeId: string; created: boolean }> {
  const now = new Date().toISOString();
  const intakeId = crypto.randomUUID();
  const mimeType = input.sourceType === "wattpad_link" ? "text/html" : "text/uri-list";
  const isAudiobook = input.sourceType === "soundcloud_link" || input.sourceType === "youtube_link";
  const readyStatus = isAudiobook ? "published" : "draft";
  const insert = await env.DB.prepare(`INSERT OR IGNORE INTO intake_items (id, telegram_update_id, telegram_file_id, media_type, source_type, source_url, source_chat_id, source_message_id, status, original_filename, mime_type, created_at, updated_at) VALUES (?, ?, ?, 'document', '${input.sourceType}', ?, ?, ?, '${readyStatus}', ?, '${mimeType}', ?, ?)`).bind(intakeId, input.updateId, input.linkKey, input.url, input.chatId, input.messageId, input.title, now, now).run();
  const persisted = await env.DB.prepare("SELECT id FROM intake_items WHERE telegram_file_id = ? LIMIT 1").bind(input.linkKey).first<{ id: string }>();
  if (!persisted?.id) throw new Error("link_intake_not_persisted");
  const slugBase = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || input.slugFallback;
  const slug = `${slugBase}-${persisted.id.slice(0, 8)}`;
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO rights_records (id, intake_id, rights_status, created_at, updated_at) VALUES (?, ?, 'missing', ?, ?)").bind(crypto.randomUUID(), persisted.id, now, now),
    env.DB.prepare("INSERT OR IGNORE INTO book_drafts (id, intake_id, title, slug, author, summary, soundcloud_url, metadata_json, category, publication_status, created_at, updated_at, youtube_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), persisted.id, input.title, slug, input.author, input.summary, input.soundcloudUrl, JSON.stringify(input.metadata), input.category, readyStatus, now, now, input.youtubeUrl ?? null),
    env.DB.prepare(`INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) SELECT ?, '${input.eventType}', ?, ? WHERE NOT EXISTS (SELECT 1 FROM ingestion_events WHERE intake_id = ? AND event_type = '${input.eventType}')`).bind(persisted.id, JSON.stringify(input.eventDetail), now, persisted.id),
  ]);
  return { intakeId: persisted.id, created: insert.meta.changes > 0 };
}

async function enqueueYoutubeConversion(env: RuntimeEnv, intakeId: string, sourceUrl: string, title: string): Promise<void> {
  if (!env.YOUTUBE_CONVERTER_URL || !env.YOUTUBE_CONVERTER_SECRET) return;
  const now = new Date().toISOString();
  await env.DB.prepare("UPDATE book_drafts SET youtube_audio_status = 'queued', youtube_audio_error = NULL, updated_at = ? WHERE intake_id = ?").bind(now, intakeId).run();
  logWorkerEvent("youtube_conversion_queued", { intakeId });
}

async function youtubeAudioJobs(request: Request, env: RuntimeEnv): Promise<Response> {
  if (!env.YOUTUBE_CONVERTER_SECRET || !constantTimeEqual(request.headers.get("x-converter-secret"), env.YOUTUBE_CONVERTER_SECRET)) return json({ ok: false, error: "unauthorized" }, 401);
  const row = await env.DB.prepare("SELECT b.intake_id, b.title, b.youtube_url FROM book_drafts b WHERE b.youtube_audio_status = 'queued' AND b.youtube_url IS NOT NULL ORDER BY b.updated_at ASC LIMIT 1").bind().first<{ intake_id: string; title: string; youtube_url: string }>();
  if (!row) return json({ ok: true, job: null });
  await env.DB.prepare("UPDATE book_drafts SET youtube_audio_status = 'running', updated_at = ? WHERE intake_id = ? AND youtube_audio_status = 'queued'").bind(new Date().toISOString(), row.intake_id).run();
  return json({ ok: true, job: { intakeId: row.intake_id, title: row.title, sourceUrl: row.youtube_url } });
}

async function youtubeAudioCallback(request: Request, env: RuntimeEnv): Promise<Response> {
  if (!env.YOUTUBE_CONVERTER_SECRET || !constantTimeEqual(request.headers.get("x-converter-secret"), env.YOUTUBE_CONVERTER_SECRET)) return json({ ok: false, error: "unauthorized" }, 401);
  const intakeId = request.headers.get("x-intake-id")?.trim();
  if (!intakeId) return json({ ok: false, error: "intake_id_required" }, 400);
  const book = await env.DB.prepare("SELECT id, slug FROM book_drafts WHERE intake_id = ? LIMIT 1").bind(intakeId).first<{ id: string; slug: string }>();
  if (!book) return json({ ok: false, error: "book_not_found" }, 404);
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  const now = new Date().toISOString();
  if (contentType.includes("application/json")) {
    let payload: JsonRecord = {};
    try { payload = await request.json() as JsonRecord; } catch { /* Keep a generic failure. */ }
    const error = typeof payload.error === "string" ? payload.error.slice(0, 500) : "youtube_conversion_failed";
    await env.DB.prepare("UPDATE book_drafts SET youtube_audio_status = 'failed', youtube_audio_error = ?, updated_at = ? WHERE id = ?").bind(error, now, book.id).run();
    return json({ ok: true, status: "failed", intakeId });
  }
  if (!env.BUCKET || !contentType.startsWith("audio/")) return json({ ok: false, error: "audio_body_required" }, 415);
  const data = await request.arrayBuffer();
  if (!data.byteLength || data.byteLength > 100 * 1024 * 1024) return json({ ok: false, error: "audio_size_limit_exceeded" }, 413);
  const key = `audio/youtube/${intakeId}.mp3`;
  await env.BUCKET.put(key, data, { httpMetadata: { contentType: "audio/mpeg" }, customMetadata: { intakeId, source: "youtube_converter" } });
  await env.DB.batch([
    env.DB.prepare("UPDATE book_drafts SET audio_storage_key = ?, audio_mime_type = 'audio/mpeg', audio_byte_size = ?, youtube_audio_status = 'completed', youtube_audio_error = NULL, updated_at = ? WHERE id = ?").bind(key, data.byteLength, now, book.id),
    env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'youtube_audio_converted', ?, ?)").bind(intakeId, JSON.stringify({ key, byteSize: data.byteLength }), now),
  ]);
  return json({ ok: true, status: "completed", intakeId, slug: book.slug, byteSize: data.byteLength });
}

async function saveSoundCloudCollectionTracks(
  tracks: SoundCloudTrack[], collectionUrl: string, collectionType: SoundCloudCollectionType, updateId: number, chatId: string, messageId: number, env: RuntimeEnv,
): Promise<{ created: number; duplicates: number }> {
  let created = 0;
  let duplicates = 0;
  for (const track of tracks) {
    const saved = await saveLinkIntake(env, {
      sourceType: "soundcloud_link", eventType: "soundcloud_track_received", url: track.url, linkKey: `soundcloud:${track.url}`,
      updateId: soundCloudTrackUpdateId(track.url), chatId, messageId, title: track.title, author: track.author,
      summary: `SoundCloud ${collectionType === "set" ? "playlist" : "channel"} မှ တစ်ပုဒ်ချင်း ခွဲသိမ်းထားသော အသံစာအုပ် track ဖြစ်သည်။`, category: "အသံစာအုပ်", soundcloudUrl: track.url, slugFallback: "soundcloud-track",
      metadata: { source: "telegram", sourceType: "soundcloud_track", sourceUrl: track.url, collectionType, collectionUrl, ...(collectionType === "channel" ? { channelUrl: collectionUrl } : {}), telegramUpdateId: updateId, public: { sourceType: "soundcloud", ...(track.artworkUrl ? { coverImage: track.artworkUrl } : {}) } },
      eventDetail: { collectionUrl, collectionType, trackUrl: track.url },
    });
    if (saved.created) created += 1;
    else duplicates += 1;
  }
  return { created, duplicates };
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

function logWorkerEvent(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ component: "telegram-ingestion", event, ...fields }));
}

async function processIntake(intakeId: string, env: RuntimeEnv): Promise<void> {
  if (!env.BUCKET || !env.TELEGRAM_BOT_TOKEN) return;
  const item = await env.DB.prepare("SELECT * FROM intake_items WHERE id = ? LIMIT 1").bind(intakeId).first<JsonRecord>();
  if (!item || typeof item.telegram_file_id !== "string") return;
  if (item.source_type === "wattpad_link") return;
  const maxBytes = maxFileBytes(env);
  const createdAt = typeof item.created_at === "string" ? Date.parse(item.created_at) : Number.NaN;
  const autoPublishFrom = Date.parse(env.AUTO_PUBLISH_FROM ?? DEFAULT_AUTO_PUBLISH_FROM); // NaN (bad config) fails closed to draft
  const isTelegramPdf = Number.isFinite(createdAt) && createdAt >= autoPublishFrom && item.source_type === "telegram_media" && item.media_type === "document" &&
    ((typeof item.mime_type === "string" && item.mime_type.toLowerCase() === "application/pdf") ||
      (typeof item.original_filename === "string" && item.original_filename.toLowerCase().endsWith(".pdf")));
  logWorkerEvent("file_processing_started", { intakeId, mediaType: item.media_type, announcedBytes: typeof item.byte_size === "number" ? item.byte_size : null, autoPublish: isTelegramPdf });
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
      if (isTelegramPdf && new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength))) !== "%PDF-") throw new Error("invalid_pdf_header");
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
      const signature: number[] = [];
      const countedBody = fileResponse.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          progress.bytes += chunk.byteLength;
          if (progress.bytes > maxBytes) throw new Error("file_too_large");
          if (signature.length < 5) signature.push(...Array.from(chunk.slice(0, 5 - signature.length)));
          controller.enqueue(chunk);
        },
        flush() {
          if (progress.bytes === 0) throw new Error("empty_file");
          if (expectedBytes > 0 && progress.bytes !== expectedBytes) throw new Error("telegram_file_size_mismatch");
          if (isTelegramPdf && String.fromCharCode(...signature) !== "%PDF-") throw new Error("invalid_pdf_header");
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
    const publicationStatus = isTelegramPdf ? "published" : "draft";
    await env.DB.batch([
      env.DB.prepare("UPDATE intake_items SET status = ?, storage_key = ?, sha256 = ?, byte_size = ?, updated_at = ?, failure_code = NULL, failure_message = NULL WHERE id = ?").bind(publicationStatus, key, checksum, byteSize, now, intakeId),
      env.DB.prepare("INSERT OR IGNORE INTO book_drafts (id, intake_id, title, slug, summary, metadata_json, publication_status, created_at, updated_at, soundcloud_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(crypto.randomUUID(), intakeId, title, slug, "Telegram မှ ရောက်ရှိလာသော PDF ဖြစ်သည်။", JSON.stringify({ source: "telegram", assetKey: key, rightsStatus: "missing", ...(coverKey ? { public: { coverImage: `/book/${slug}/cover` } } : {}) }), publicationStatus, now, now, normalizeSoundCloudUrl(item.source_url)),
      env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'stored_in_r2', ?, ?)").bind(intakeId, JSON.stringify({ storageKey: key, byteSize, checksumComputed: Boolean(checksum) }), now),
      ...(isTelegramPdf ? [
        env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'published', ?, ?)").bind(intakeId, JSON.stringify({ source: "telegram_auto_publish", rightsReview: "not_performed" }), now),
        env.DB.prepare("UPDATE rights_records SET evidence_note = 'auto_publish_unreviewed', updated_at = ? WHERE intake_id = ? AND rights_status = 'missing'").bind(now, intakeId),
      ] : []),
    ]);
    logWorkerEvent(isTelegramPdf ? "telegram_pdf_published" : "file_saved_as_draft", { intakeId, slug, byteSize, rightsReview: isTelegramPdf ? "not_performed" : "required" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "processing_failed";
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE intake_items SET status = 'failed', failure_code = ?, failure_message = ?, retry_count = retry_count + 1, updated_at = ? WHERE id = ?").bind(message, message, now, intakeId).run();
    await env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'processing_failed', ?, ?)").bind(intakeId, JSON.stringify({ code: message }), now).run();
    logWorkerEvent("file_processing_failed", { intakeId, errorCode: message });
  }
}

async function processNextQueuedIntake(env: RuntimeEnv): Promise<boolean> {
  if (!env.BUCKET || !env.TELEGRAM_BOT_TOKEN) {
    logWorkerEvent("queue_skipped_missing_binding", { storageAvailable: Boolean(env.BUCKET), processorAvailable: Boolean(env.TELEGRAM_BOT_TOKEN) });
    return false;
  }
  const staleBefore = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const candidate = await env.DB.prepare(`SELECT id FROM intake_items
    WHERE (status = 'received' OR (status = 'downloading' AND updated_at < ?))
      AND NOT EXISTS (SELECT 1 FROM intake_items WHERE status = 'downloading' AND updated_at >= ?)
    ORDER BY created_at ASC LIMIT 1`).bind(staleBefore, staleBefore).first<{ id: string }>();
  if (!candidate?.id) {
    logWorkerEvent("queue_no_eligible_candidate");
    return false;
  }

  const claimedAt = new Date().toISOString();
  logWorkerEvent("queue_candidate_found", { intakeId: candidate.id });
  const claimed = await env.DB.prepare(`UPDATE intake_items SET status = 'downloading', updated_at = ?
    WHERE id = ? AND (status = 'received' OR (status = 'downloading' AND updated_at < ?))`).bind(claimedAt, candidate.id, staleBefore).run();
  if (claimed.meta.changes !== 1) {
    logWorkerEvent("queue_claim_lost", { intakeId: candidate.id });
    return false;
  }

  logWorkerEvent("queue_claimed", { intakeId: candidate.id, claimedAt });
  await env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'processing_started', ?, ?)").bind(candidate.id, JSON.stringify({ source: "cron" }), claimedAt).run();
  logWorkerEvent("intake_processing_started", { intakeId: candidate.id });
  await processIntake(candidate.id, env);
  const finalState = await env.DB.prepare("SELECT status FROM intake_items WHERE id = ? LIMIT 1").bind(candidate.id).first<{ status?: string }>();
  logWorkerEvent("intake_processing_finished", { intakeId: candidate.id, status: finalState?.status ?? "unknown" });
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
  const media = mediaFor(message);
  const hasPdf = media?.type === "document";
  const wattpadUrl = wattpadUrlFor(message);
  const soundcloudUrls = soundcloudUrlsFor(message);
  const youtubeUrls = youtubeUrlsFor(message);
  const messageId = message.message_id;
  // A PDF always wins over links in its caption. Photos carry links but are never stored themselves.
  if (!hasPdf && Number.isSafeInteger(messageId) && (wattpadUrl || soundcloudUrls.length || youtubeUrls.length)) {
    const collectionType = soundcloudUrls.length === 1 ? soundCloudCollectionType(soundcloudUrls[0]) : null;
    if (!wattpadUrl && collectionType) {
      const collectionUrl = soundcloudUrls[0];
      const sourceType = collectionType === "set" ? "soundcloud_set" : "soundcloud_channel";
      try {
        const tracks = await fetchSoundCloudCollectionTracks(collectionUrl);
        if (!tracks.length) {
          logWorkerEvent("soundcloud_collection_no_tracks", { collectionUrl, collectionType });
          return json({ ok: false, error: "soundcloud_collection_tracks_not_found" }, 502);
        }
        const saved = await saveSoundCloudCollectionTracks(tracks, collectionUrl, collectionType, parsed.update_id as number, chatId, messageId as number, env);
        logWorkerEvent("soundcloud_collection_imported", { collectionUrl, collectionType, trackCount: tracks.length, created: saved.created, duplicates: saved.duplicates });
        return json({ ok: true, status: saved.created ? "accepted" : "duplicate", sourceType, trackCount: tracks.length, ...saved });
      } catch (error) {
        logWorkerEvent("soundcloud_collection_import_failed", { collectionUrl, collectionType, error: error instanceof Error ? error.message.slice(0, 120) : "unknown_error" });
        return json({ ok: false, error: "soundcloud_collection_import_failed" }, 502);
      }
    }
    const saved: { intakeId: string; created: boolean; sourceType: "wattpad_link" | "soundcloud_link" | "youtube_link" }[] = [];
    if (wattpadUrl) {
      const metadata = wattpadMetadata(message, wattpadUrl);
      const result = await saveLinkIntake(env, {
        sourceType: "wattpad_link", eventType: "wattpad_link_received", url: wattpadUrl, linkKey: `wattpad:${wattpadUrl}`,
        updateId: parsed.update_id as number, chatId, messageId: messageId as number, title: metadata.title, author: metadata.author,
        summary: "Wattpad မူရင်းစာမျက်နှာသို့ သွားဖတ်ရန် link card ဖြစ်သည်။", category: null, soundcloudUrl: null, slugFallback: "wattpad-book",
        metadata: { source: "telegram", sourceType: "wattpad_link", sourceUrl: wattpadUrl, public: { sourceType: "wattpad", externalUrl: wattpadUrl } },
        eventDetail: { url: wattpadUrl },
      });
      saved.push({ ...result, sourceType: "wattpad_link" });
    }
    let skippedChannelUrls = 0;
    for (const url of soundcloudUrls) {
      // Collection pages need a page fetch and up to 50 inserts, so they are only expanded when sent alone.
      if (isSoundCloudCollectionUrl(url)) { skippedChannelUrls += 1; continue; }
      const metadata = soundcloudMetadata(message, url, soundcloudUrls.length === 1 && !wattpadUrl);
      const result = await saveLinkIntake(env, {
        sourceType: "soundcloud_link", eventType: "soundcloud_link_received", url, linkKey: `soundcloud:${url}`,
        // Synthetic per-URL update id: several links can share one real Telegram update, and telegram_update_id is UNIQUE.
        updateId: soundCloudTrackUpdateId(url), chatId, messageId: messageId as number, title: metadata.title, author: metadata.author,
        summary: "SoundCloud အသံစာအုပ်ကို နားဆင်ရန် link card ဖြစ်သည်။", category: null, soundcloudUrl: url, slugFallback: "soundcloud-audiobook",
        metadata: { source: "telegram", sourceType: "soundcloud_link", public: { sourceType: "soundcloud" } },
        eventDetail: { url },
      });
      saved.push({ ...result, sourceType: "soundcloud_link" });
    }
    if (skippedChannelUrls) logWorkerEvent("soundcloud_collection_skipped_in_multi_link_message", { skippedChannelUrls, saved: saved.length });
    for (const url of youtubeUrls) {
      const metadata = youtubeMetadata(message, url);
      const result = await saveLinkIntake(env, {
        sourceType: "youtube_link", eventType: "youtube_link_received", url, linkKey: `youtube:${url}`,
        updateId: soundCloudTrackUpdateId(url), chatId, messageId: messageId as number, title: metadata.title, author: metadata.author,
        summary: "YouTube မှ အသံဇာတ်လမ်းကို နားဆင်ရန် link card ဖြစ်သည်။", category: "အသံစာအုပ်", soundcloudUrl: null, youtubeUrl: url, slugFallback: "youtube-audiobook",
        metadata: { source: "telegram", sourceType: "youtube_link", sourceUrl: url, public: { sourceType: "youtube" } }, eventDetail: { url },
      });
      saved.push({ ...result, sourceType: "youtube_link" });
      if (result.created) await enqueueYoutubeConversion(env, result.intakeId, url, metadata.title);
    }
    if (!saved.length) return json({ ok: true, status: "ignored", skippedChannelUrls });
    const created = saved.filter((item) => item.created).length;
    const status = created ? "accepted" : "duplicate";
    if (saved.length === 1 && !skippedChannelUrls) return json({ ok: true, status, updateId: parsed.update_id, intakeId: saved[0].intakeId, sourceType: saved[0].sourceType });
    return json({ ok: true, status, updateId: parsed.update_id, sourceType: "links", count: saved.length, created, duplicates: saved.length - created, intakeIds: saved.map((item) => item.intakeId), ...(skippedChannelUrls ? { skippedChannelUrls } : {}) });
  }
  if (media?.type === "photo") return json({ ok: true, status: "ignored" });
  if (!media || !Number.isSafeInteger(messageId)) return json({ ok: true, status: "ignored" });
  const now = new Date().toISOString();
  const intakeId = crypto.randomUUID();
  const insert = await env.DB.prepare(`INSERT OR IGNORE INTO intake_items (id, telegram_update_id, telegram_file_id, cover_telegram_file_id, media_type, source_chat_id, source_message_id, status, original_filename, mime_type, byte_size, created_at, updated_at, source_url) VALUES (?, ?, ?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?)`).bind(intakeId, parsed.update_id, media.fileId, media.coverFileId, media.type, chatId, messageId, media.fileName, media.mimeType, media.byteSize, now, now, soundcloudUrls[0] ?? null).run();
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
  const statement = env.DB.prepare("SELECT b.id, b.title, b.slug, b.author, b.category, b.year, b.summary, b.reading_time, b.soundcloud_url, b.youtube_url, b.audio_storage_key, b.audio_mime_type, b.audio_byte_size, b.metadata_json, b.publication_status, b.updated_at, i.storage_key, i.source_type FROM book_drafts b JOIN intake_items i ON i.id = b.intake_id WHERE b.publication_status = 'published' OR ((i.source_type = 'soundcloud_link' OR i.source_type = 'youtube_link') AND (b.soundcloud_url IS NOT NULL OR b.youtube_url IS NOT NULL) AND b.publication_status <> 'unpublished') ORDER BY b.updated_at DESC");
  const result = statement.all ? await statement.all<JsonRecord>() : { results: [] };
  const books = result.results.map((book) => { let metadata: JsonRecord = {}; try { metadata = JSON.parse(typeof book.metadata_json === "string" ? book.metadata_json : "{}"); } catch {} const publicMeta = isRecord(metadata.public) ? { ...metadata.public } : {}; if (typeof publicMeta.coverImage === "string" && publicMeta.coverImage.startsWith("/")) publicMeta.coverImage = new URL(publicMeta.coverImage, request.url).toString(); return { id: book.id, title: book.title, slug: book.slug, author: book.author, category: book.category, year: book.year, summary: book.summary, readingTime: book.reading_time, ...(typeof book.storage_key === "string" && book.storage_key ? { pdfUrl: new URL(`/book/${encodeURIComponent(String(book.slug))}/pdf`, request.url).toString() } : {}), ...(typeof book.soundcloud_url === "string" && book.soundcloud_url ? { soundcloud_url: book.soundcloud_url } : {}), ...(typeof book.youtube_url === "string" && book.youtube_url ? { youtube_url: book.youtube_url } : {}), ...(typeof book.audio_storage_key === "string" && book.audio_storage_key ? { audio_url: new URL(`/book/${encodeURIComponent(String(book.slug))}/audio`, request.url).toString() } : {}), ...(typeof publicMeta.audioUrl === "string" && publicMeta.audioUrl ? { audio_url: publicMeta.audioUrl } : {}), ...publicMeta, ...(typeof book.publication_status === "string" ? { publicationStatus: book.publication_status } : {}), ...(book.source_type === "soundcloud_link" || book.source_type === "youtube_link" ? { submissionSource: "telegram" } : {}) }; });
  return json({ ok: true, books }, 200, origin);
}

async function adminDrafts(request: Request, env: RuntimeEnv): Promise<Response> {
  if (!env.ADMIN_TOKEN || !constantTimeEqual(request.headers.get("x-admin-token"), env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
  if (request.method !== "GET") return json({ ok: false, error: "method_not_allowed" }, 405);
  const statement = env.DB.prepare(`SELECT COALESCE(b.id, i.id) AS id, i.id AS intake_id, COALESCE(b.title, i.original_filename, 'စာအုပ်အသစ်') AS title, b.slug, b.author, b.category, b.year, b.summary, b.soundcloud_url, b.youtube_url, b.audio_storage_key, b.audio_mime_type, b.audio_byte_size, b.metadata_json, COALESCE(b.publication_status, i.status) AS publication_status, COALESCE(b.updated_at, i.updated_at) AS updated_at, i.status AS intake_status, i.original_filename, i.storage_key, i.source_type, i.source_url, i.failure_code, i.failure_message, r.rights_status, r.rights_holder, r.evidence_note, r.allowed_uses, r.reviewer, r.reviewed_at FROM intake_items i LEFT JOIN book_drafts b ON b.intake_id = i.id LEFT JOIN rights_records r ON r.intake_id = i.id ORDER BY i.updated_at DESC`);
  const result = statement.all ? await statement.all<JsonRecord>() : { results: [] };
  const drafts = result.results.map((row) => {
    let metadata: JsonRecord = {};
    try { metadata = JSON.parse(typeof row.metadata_json === "string" ? row.metadata_json : "{}"); } catch {}
    const publicMeta = isRecord(metadata.public) ? metadata.public : {};
    return { ...row, audio_url: typeof row.audio_storage_key === "string" && row.audio_storage_key && row.slug ? new URL(`/book/${encodeURIComponent(String(row.slug))}/audio`, request.url).toString() : (typeof publicMeta.audioUrl === "string" ? publicMeta.audioUrl : null) };
  });
  return json({ ok: true, drafts });
}

const AUDIO_MIME_TYPES = new Set(["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/ogg", "audio/wav", "audio/x-wav", "audio/webm"]);
function audioExtension(name: string): boolean {
  return /\.(mp3|m4a|mp4|ogg|wav|webm)$/i.test(name);
}
async function adminAudioUpload(request: Request, env: RuntimeEnv): Promise<Response> {
  if (!env.ADMIN_TOKEN || !constantTimeEqual(request.headers.get("x-admin-token"), env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!env.BUCKET) return json({ ok: false, error: "storage_unavailable" }, 503);
  let form: FormData;
  try { form = await request.formData(); } catch { return json({ ok: false, error: "invalid_multipart" }, 400); }
  const value = form.get("file");
  if (!(value instanceof File)) return json({ ok: false, error: "audio_file_required" }, 400);
  const fileName = value.name.trim().slice(0, 180) || "audio.mp3";
  const mimeType = (value.type || "application/octet-stream").toLowerCase();
  const maxBytes = maxFileBytes(env);
  if (!AUDIO_MIME_TYPES.has(mimeType) && !audioExtension(fileName)) return json({ ok: false, error: "audio_format_required" }, 415);
  if (!Number.isSafeInteger(value.size) || value.size <= 0) return json({ ok: false, error: "audio_empty" }, 400);
  if (value.size > maxBytes) return json({ ok: false, error: "file_too_large" }, 413);
  const slugValue = typeof form.get("slug") === "string" ? String(form.get("slug")) : "";
  const existing = slugValue ? await env.DB.prepare("SELECT b.id, b.intake_id, b.audio_storage_key FROM book_drafts b WHERE b.slug = ? LIMIT 1").bind(slugValue).first<{ id: string; intake_id: string; audio_storage_key: string | null }>() : null;
  const intakeId = existing?.intake_id ?? crypto.randomUUID();
  const safeName = safeFileName(fileName, "document");
  const key = `audio/${intakeId}/${safeName}`;
  const now = new Date().toISOString();
  const bytes = await value.arrayBuffer();
  const stored = await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: AUDIO_MIME_TYPES.has(mimeType) ? mimeType : "application/octet-stream" }, customMetadata: { intakeId, source: "admin_audio_upload", visibility: "private" } });
  if (!stored || stored.size !== value.size) return json({ ok: false, error: "r2_storage_failed" }, 502);
  if (existing) {
    if (existing.audio_storage_key && existing.audio_storage_key !== key) await env.BUCKET.delete(existing.audio_storage_key);
    await env.DB.batch([
      env.DB.prepare("UPDATE book_drafts SET audio_storage_key = ?, audio_mime_type = ?, audio_byte_size = ?, updated_at = ? WHERE id = ?").bind(key, mimeType, value.size, now, existing.id),
      env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'audio_uploaded', ?, ?)").bind(existing.intake_id, JSON.stringify({ storageKey: key, byteSize: value.size, source: "admin" }), now),
    ]);
    return json({ ok: true, status: "updated", slug: slugValue, audioUrl: `/book/${encodeURIComponent(slugValue)}/audio` });
  }
  const title = typeof form.get("title") === "string" ? String(form.get("title")).trim().slice(0, 180) : "";
  if (!title) { await env.BUCKET.delete(key); return json({ ok: false, error: "title_required" }, 400); }
  const author = typeof form.get("author") === "string" ? String(form.get("author")).trim().slice(0, 180) : null;
  const category = typeof form.get("category") === "string" ? String(form.get("category")).trim().slice(0, 100) : "အသံစာအုပ်";
  const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "audiobook"}-${intakeId.slice(0, 8)}`;
  const syntheticUpdateId = -Math.floor(Date.now() * 1000 + Math.random() * 1000);
  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO intake_items (id, telegram_update_id, telegram_file_id, media_type, source_type, source_chat_id, source_message_id, status, original_filename, mime_type, byte_size, created_at, updated_at) VALUES (?, ?, ?, 'document', 'direct_audio', 'admin', 0, 'draft', ?, ?, ?, ?, ?)").bind(intakeId, syntheticUpdateId, `direct-audio:${intakeId}`, fileName, mimeType, value.size, now, now),
      env.DB.prepare("INSERT INTO rights_records (id, intake_id, rights_status, created_at, updated_at) VALUES (?, ?, 'missing', ?, ?)").bind(crypto.randomUUID(), intakeId, now, now),
      env.DB.prepare("INSERT INTO book_drafts (id, intake_id, title, slug, author, category, summary, audio_storage_key, audio_mime_type, audio_byte_size, metadata_json, publication_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)").bind(crypto.randomUUID(), intakeId, title, slug, author, category, "Admin မှ တိုက်ရိုက်တင်ထားသော အသံစာအုပ်ဖြစ်သည်။", key, mimeType, value.size, JSON.stringify({ source: "admin_audio_upload", public: { sourceType: "audio" } }), now, now),
      env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'audio_uploaded', ?, ?)").bind(intakeId, JSON.stringify({ storageKey: key, byteSize: value.size, source: "admin" }), now),
    ]);
  } catch (error) {
    await env.BUCKET.delete(key);
    throw error;
  }
  return json({ ok: true, status: "draft", intakeId, slug, audioUrl: `/book/${encodeURIComponent(slug)}/audio` }, 201);
}
async function directUpload(request: Request, env: RuntimeEnv): Promise<Response> {
  if (!env.ADMIN_TOKEN || !constantTimeEqual(request.headers.get("x-admin-token"), env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!env.BUCKET) return json({ ok: false, error: "storage_unavailable" }, 503);
  const fileName = (request.headers.get("x-file-name") ?? "book.pdf").trim().slice(0, 180) || "book.pdf";
  const mimeType = (request.headers.get("content-type") ?? "application/pdf").split(";", 1)[0].trim().toLowerCase();
  if (mimeType !== "application/pdf" && !fileName.toLowerCase().endsWith(".pdf")) return json({ ok: false, error: "pdf_required" }, 415);
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  const maxBytes = maxFileBytes(env);
  if (!Number.isSafeInteger(contentLength) || contentLength <= 0) return json({ ok: false, error: "content_length_required" }, 411);
  if (contentLength > maxBytes) return json({ ok: false, error: "file_too_large" }, 413);
  if (!request.body) return json({ ok: false, error: "file_body_missing" }, 400);

  const intakeId = crypto.randomUUID();
  const syntheticUpdateId = -Math.floor(Date.now() * 1000 + Math.random() * 1000);
  const directFileId = `direct:${intakeId}`;
  const now = new Date().toISOString();
  const safeName = safeFileName(fileName, "document");
  const key = `originals/${intakeId}/${safeName}`;
  const title = titleFromFile(fileName);
  const slug = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70) || "book"}-${intakeId.slice(0, 8)}`;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO intake_items (id, telegram_update_id, telegram_file_id, media_type, source_type, source_chat_id, source_message_id, status, original_filename, mime_type, byte_size, created_at, updated_at) VALUES (?, ?, ?, 'document', 'direct_upload', 'admin', 0, 'downloading', ?, ?, ?, ?, ?)").bind(intakeId, syntheticUpdateId, directFileId, fileName, mimeType, contentLength, now, now),
    env.DB.prepare("INSERT INTO rights_records (id, intake_id, rights_status, created_at, updated_at) VALUES (?, ?, 'missing', ?, ?)").bind(crypto.randomUUID(), intakeId, now, now),
    env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'direct_upload_started', ?, ?)").bind(intakeId, JSON.stringify({ fileName, byteSize: contentLength }), now),
  ]);

  let progress = 0;
  const signature: number[] = [];
  const countedBody = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      progress += chunk.byteLength;
      if (progress > contentLength || progress > maxBytes) throw new Error("file_too_large");
      if (signature.length < 5) signature.push(...Array.from(chunk.slice(0, 5 - signature.length)));
      controller.enqueue(chunk);
    },
    flush() {
      if (progress !== contentLength) throw new Error("file_size_mismatch");
      if (String.fromCharCode(...signature) !== "%PDF-") throw new Error("invalid_pdf_header");
    },
  }));
  try {
    const fixedLengthStream = new FixedLengthStream(contentLength);
    const abortController = new AbortController();
    const uploadPromise = env.BUCKET.put(key, fixedLengthStream.readable, { httpMetadata: { contentType: "application/pdf" }, customMetadata: { intakeId, source: "direct_upload", visibility: "private" } });
    const streamPromise = countedBody.pipeTo(fixedLengthStream.writable, { signal: abortController.signal });
    let stored: R2Object | null;
    try {
      [stored] = await Promise.all([uploadPromise, streamPromise]);
    } catch (error) {
      abortController.abort();
      await Promise.allSettled([uploadPromise, streamPromise]);
      throw error;
    }
    if (!stored || stored.size !== contentLength) throw new Error("r2_storage_failed");
    const storedAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE intake_items SET status = 'draft', storage_key = ?, byte_size = ?, updated_at = ?, failure_code = NULL, failure_message = NULL WHERE id = ?").bind(key, stored.size, storedAt, intakeId),
      env.DB.prepare("INSERT INTO book_drafts (id, intake_id, title, slug, summary, metadata_json, publication_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)").bind(crypto.randomUUID(), intakeId, title, slug, "မူကြမ်းအဖြစ် စစ်ဆေးရန် စာအုပ်ဖိုင်ကို တိုက်ရိုက်တင်ထားသည်။", JSON.stringify({ source: "direct_upload", assetKey: key, rightsStatus: "missing" }), storedAt, storedAt),
      env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'stored_in_r2', ?, ?)").bind(intakeId, JSON.stringify({ storageKey: key, byteSize: stored.size, source: "direct_upload" }), storedAt),
    ]);
    return json({ ok: true, status: "draft", intakeId, slug }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "direct_upload_failed";
    const failedAt = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE intake_items SET status = 'failed', failure_code = ?, failure_message = ?, updated_at = ? WHERE id = ?").bind(message, message, failedAt, intakeId),
      env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'processing_failed', ?, ?)").bind(intakeId, JSON.stringify({ code: message, source: "direct_upload" }), failedAt),
    ]);
    return json({ ok: false, status: "failed", intakeId, error: message }, 422);
  }
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

async function approve(request: Request, env: RuntimeEnv, slug: string): Promise<Response> {
  if (!env.ADMIN_TOKEN || !constantTimeEqual(request.headers.get("x-admin-token"), env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const book = await env.DB.prepare("SELECT b.id, b.intake_id, b.publication_status, i.status AS intake_status, i.storage_key, i.source_type, b.soundcloud_url, b.youtube_url, b.audio_storage_key, (SELECT r.rights_status FROM rights_records r WHERE r.intake_id = b.intake_id LIMIT 1) AS rights_status FROM book_drafts b JOIN intake_items i ON i.id = b.intake_id WHERE b.slug = ? LIMIT 1").bind(slug).first<{ id: string; intake_id: string; publication_status: string; intake_status: string; storage_key: string | null; source_type: string; soundcloud_url: string | null; youtube_url: string | null; audio_storage_key: string | null; rights_status: string | null }>();
  if (!book) return json({ ok: false, error: "book_not_found" }, 404);
  // An auto-published Telegram PDF has intake status 'published'. It may still receive a rights record afterwards; approve never changes its publication status.
  const alreadyPublished = book.publication_status === "published" && book.intake_status === "published";
  const externalLinkWithoutFile = book.source_type === "wattpad_link" || ((book.source_type === "soundcloud_link" || book.source_type === "youtube_link") && (book.soundcloud_url || book.youtube_url)) || (book.source_type === "direct_audio" && book.audio_storage_key);
  if ((!book.storage_key && !externalLinkWithoutFile) || (book.intake_status !== "draft" && !alreadyPublished)) return json({ ok: false, error: "private_draft_not_ready" }, 409);
  if (book.publication_status === "published" && book.rights_status === "approved") return json({ ok: true, status: "published", rightsStatus: "approved", slug });
  let body: JsonRecord = {};
  try { body = await request.json() as JsonRecord; } catch {}
  const evidenceNote = typeof body.evidenceNote === "string" ? body.evidenceNote.slice(0, 500) : "Admin dashboard confirmation";
  const rightsHolder = typeof body.rightsHolder === "string" ? body.rightsHolder.slice(0, 180) : null;
  const allowedUses = typeof body.allowedUses === "string" ? body.allowedUses.slice(0, 180) : "Website catalog reading";
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO rights_records (id, intake_id, rights_status, created_at, updated_at) VALUES (?, ?, 'missing', ?, ?)").bind(crypto.randomUUID(), book.intake_id, now, now),
    env.DB.prepare("UPDATE rights_records SET rights_status = 'approved', rights_holder = ?, evidence_note = ?, allowed_uses = ?, reviewer = 'admin', reviewed_at = ?, updated_at = ? WHERE intake_id = ?").bind(rightsHolder, evidenceNote, allowedUses, now, now, book.intake_id),
    env.DB.prepare("INSERT INTO ingestion_events (intake_id, event_type, detail_json, created_at) VALUES (?, 'rights_approved', ?, ?)").bind(book.intake_id, JSON.stringify({ reviewer: "admin" }), now),
  ]);
  return json({ ok: true, status: book.publication_status === "published" ? "published" : "approved", rightsStatus: "approved", slug });
}

async function updateBook(request: Request, env: RuntimeEnv, slug: string): Promise<Response> {
  if (!env.ADMIN_TOKEN || !constantTimeEqual(request.headers.get("x-admin-token"), env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
  let body: JsonRecord;
  try { body = await request.json() as JsonRecord; } catch { return json({ ok: false, error: "invalid_json" }, 400); }
  const book = await env.DB.prepare("SELECT id, metadata_json FROM book_drafts WHERE slug = ? LIMIT 1").bind(slug).first<{ id: string; metadata_json: string }>();
  if (!book) return json({ ok: false, error: "book_not_found" }, 404);
  const text = (key: string, max: number) => typeof body[key] === "string" ? String(body[key]).trim().slice(0, max) : null;
  const hasAudioUrl = Object.prototype.hasOwnProperty.call(body, "audio_url");
  const hasSoundCloudUrl = Object.prototype.hasOwnProperty.call(body, "soundcloud_url");
  const hasYouTubeUrl = Object.prototype.hasOwnProperty.call(body, "youtube_url");
  const rawAudioUrl = typeof body.audio_url === "string" ? body.audio_url.trim() : "";
  const rawSoundCloudUrl = typeof body.soundcloud_url === "string" ? body.soundcloud_url.trim() : "";
  const rawYouTubeUrl = typeof body.youtube_url === "string" ? body.youtube_url.trim() : "";
  const audioUrl = hasAudioUrl ? normalizeAudioUrl(rawAudioUrl) : null;
  const soundcloudUrl = hasSoundCloudUrl ? normalizeSoundCloudUrl(rawSoundCloudUrl) : null;
  const youtubeUrl = hasYouTubeUrl ? normalizeYouTubeUrl(rawYouTubeUrl) : null;
  if (hasAudioUrl && rawAudioUrl && !audioUrl) return json({ ok: false, error: "invalid_audio_url" }, 400);
  if (hasSoundCloudUrl && rawSoundCloudUrl && !soundcloudUrl) return json({ ok: false, error: "invalid_soundcloud_url" }, 400);
  if (hasYouTubeUrl && rawYouTubeUrl && !youtubeUrl) return json({ ok: false, error: "invalid_youtube_url" }, 400);
  let metadata: JsonRecord = {};
  try { metadata = JSON.parse(book.metadata_json || "{}"); } catch {}
  const publicMeta = isRecord(metadata.public) ? metadata.public : {};
  const coverImage = text("coverImage", 1000);
  const nextPublic = { ...publicMeta, ...(coverImage ? { coverImage } : {}), ...(hasAudioUrl ? { audioUrl: audioUrl || null } : {}) };
  const now = new Date().toISOString();
  const soundcloudAssignment = hasSoundCloudUrl ? "soundcloud_url = ?, " : "";
  const youtubeAssignment = hasYouTubeUrl ? "youtube_url = ?, " : "";
  const values: unknown[] = [text("title", 180), text("author", 180), text("category", 100), text("year", 20), text("summary", 1000)];
  if (hasSoundCloudUrl) values.push(soundcloudUrl);
  if (hasYouTubeUrl) values.push(youtubeUrl);
  values.push(JSON.stringify({ ...metadata, public: nextPublic }), now, book.id);
  await env.DB.prepare(`UPDATE book_drafts SET title = COALESCE(?, title), author = COALESCE(?, author), category = COALESCE(?, category), year = COALESCE(?, year), summary = COALESCE(?, summary), ${soundcloudAssignment}${youtubeAssignment}metadata_json = ?, updated_at = ? WHERE id = ?`).bind(...values).run();
  return json({ ok: true, status: "updated", slug });
}

async function deleteBook(request: Request, env: RuntimeEnv, slug: string): Promise<Response> {
  if (!env.ADMIN_TOKEN || !constantTimeEqual(request.headers.get("x-admin-token"), env.ADMIN_TOKEN)) return json({ ok: false, error: "unauthorized" }, 401);
  const book = await env.DB.prepare("SELECT id, intake_id FROM book_drafts WHERE slug = ? LIMIT 1").bind(slug).first<{ id: string; intake_id: string }>();
  if (!book) return json({ ok: false, error: "book_not_found" }, 404);
  const item = await env.DB.prepare("SELECT storage_key FROM intake_items WHERE id = ? LIMIT 1").bind(book.intake_id).first<{ storage_key: string | null }>();
  const now = new Date().toISOString();
  if (env.BUCKET) {
    if (item?.storage_key) await env.BUCKET.delete(item.storage_key);
    await env.BUCKET.delete(`covers/${book.intake_id}/cover.jpg`);
  }
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

async function bookAudio(request: Request, env: RuntimeEnv, slug: string): Promise<Response> {
  if (!env.BUCKET) return json({ ok: false, error: "storage_unavailable" }, 503);
  const book = await env.DB.prepare("SELECT b.audio_storage_key, b.audio_mime_type, b.audio_byte_size FROM book_drafts b JOIN intake_items i ON i.id = b.intake_id WHERE b.slug = ? AND b.publication_status = 'published' AND i.status = 'published' LIMIT 1").bind(slug).first<{ audio_storage_key: string | null; audio_mime_type: string | null; audio_byte_size: number | null }>();
  if (!book?.audio_storage_key) return json({ ok: false, error: "audio_not_published" }, 404);
  const totalSize = typeof book.audio_byte_size === "number" && book.audio_byte_size > 0 ? book.audio_byte_size : null;
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
  const object = await env.BUCKET.get(book.audio_storage_key, range ? { range } : undefined);
  if (!object) return json({ ok: false, error: "audio_file_not_found" }, 404);
  const headers: Record<string, string> = { "Content-Type": book.audio_mime_type || object.httpMetadata?.contentType || "audio/mpeg", "Content-Disposition": "inline", "Cache-Control": "public, max-age=300", "Accept-Ranges": "bytes", "Content-Length": String(object.size), ETag: httpEtag(object.httpEtag), ...publicAssetCorsHeaders(env) };
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
    if (request.method === "OPTIONS" && url.pathname.startsWith("/book/") && (url.pathname.endsWith("/pdf") || url.pathname.endsWith("/audio") || url.pathname.endsWith("/cover"))) return publicAssetPreflight(runtimeEnv);
    if (url.pathname === "/catalog") return catalog(request, runtimeEnv);
    if (request.method === "GET" && url.pathname === "/internal/youtube-audio-jobs") return youtubeAudioJobs(request, runtimeEnv);
    if (request.method === "POST" && url.pathname === "/internal/youtube-audio-callback") return youtubeAudioCallback(request, runtimeEnv);
    if (request.method === "POST" && url.pathname === "/telegram/webhook") return receive(request, runtimeEnv);
    if (url.pathname === "/admin/drafts") return adminDrafts(request, runtimeEnv);
    if (url.pathname === "/admin/upload") return directUpload(request, runtimeEnv);
    if (url.pathname === "/admin/audio-upload") return adminAudioUpload(request, runtimeEnv);
    if (url.pathname.startsWith("/admin/retry/")) return retryIntake(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/admin/retry/".length)));
    if (url.pathname.startsWith("/admin/approve/")) return approve(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/admin/approve/".length)));
    if (request.method === "POST" && url.pathname.startsWith("/admin/approve-publish/")) return approveAndPublish(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/admin/approve-publish/".length)));
    if (request.method === "PUT" && url.pathname.startsWith("/admin/update/")) return updateBook(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/admin/update/".length)));
    if (request.method === "DELETE" && url.pathname.startsWith("/admin/delete/")) return deleteBook(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/admin/delete/".length)));
    if (request.method === "POST" && url.pathname.startsWith("/admin/publish/")) return publish(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/admin/publish/".length)));
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/book/") && url.pathname.endsWith("/audio")) return bookAudio(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/book/".length, -6)));
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/book/") && url.pathname.endsWith("/cover")) return bookCover(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/book/".length, -6)));
    if ((request.method === "GET" || request.method === "HEAD") && url.pathname.startsWith("/book/") && url.pathname.endsWith("/pdf")) return bookPdf(request, runtimeEnv, decodeURIComponent(url.pathname.slice("/book/".length, -4)));
    return json({ ok: false, error: "not_found" }, 404);
  },
  async scheduled(controller: { cron: string; scheduledTime: number }, env: Env): Promise<void> {
    const startedAt = Date.now();
    logWorkerEvent("cron_tick_started", { cron: controller.cron, scheduledTime: controller.scheduledTime });
    try {
      const runtimeEnv = await resolveSecrets(env);
      const processed = await processNextQueuedIntake(runtimeEnv);
      logWorkerEvent("cron_tick_finished", { cron: controller.cron, processed, durationMs: Date.now() - startedAt });
    } catch (error) {
      logWorkerEvent("cron_tick_failed", { cron: controller.cron, durationMs: Date.now() - startedAt, errorType: error instanceof Error ? error.name : "unknown" });
      throw error;
    }
  },
};
