import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_UPDATE_BYTES = 256 * 1024;

type JsonRecord = Record<string, unknown>;
type AcceptedMedia = "document" | "photo";

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonResponse(body: JsonRecord, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function hasValidWebhookSecret(supplied: string | null, expected: string): boolean {
  if (!supplied || supplied.length > 256 || supplied.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(supplied, "utf8"), Buffer.from(expected, "utf8"));
}

async function readBoundedBody(request: Request): Promise<Uint8Array | null> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_UPDATE_BYTES) return null;

  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_UPDATE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function mediaTypeFor(message: JsonRecord): AcceptedMedia | null {
  const document = message.document;
  if (isRecord(document) && typeof document.file_id === "string") {
    return "document";
  }

  const photos = message.photo;
  if (Array.isArray(photos) && photos.some((photo) => isRecord(photo) && typeof photo.file_id === "string")) {
    return "photo";
  }

  return null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const allowedChatIds = new Set(
    (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
      .split(",")
      .map((chatId) => chatId.trim())
      .filter((chatId) => /^-?\d+$/.test(chatId)),
  );

  if (!webhookSecret || allowedChatIds.size === 0) {
    return jsonResponse({ ok: false, error: "webhook_not_configured" }, 503);
  }

  if (!hasValidWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token"), webhookSecret)) {
    return jsonResponse({ ok: false, error: "unauthorized" }, 401);
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonResponse({ ok: false, error: "unsupported_content_type" }, 415);
  }

  const rawBody = await readBoundedBody(request);
  if (!rawBody) return jsonResponse({ ok: false, error: "update_too_large" }, 413);

  let update: unknown;
  try {
    update = JSON.parse(new TextDecoder().decode(rawBody));
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json" }, 400);
  }

  if (!isRecord(update) || !Number.isSafeInteger(update.update_id) || (update.update_id as number) < 0) {
    return jsonResponse({ ok: false, error: "invalid_update" }, 400);
  }

  const message = [update.message, update.edited_message].find(isRecord);
  if (!message || !isRecord(message.chat)) {
    return jsonResponse({ ok: true, status: "ignored" });
  }

  const chat = message.chat;
  if ((chat.type !== "group" && chat.type !== "supergroup") || !allowedChatIds.has(String(chat.id))) {
    return jsonResponse({ ok: true, status: "ignored" });
  }

  const mediaType = mediaTypeFor(message);
  if (!mediaType) return jsonResponse({ ok: true, status: "ignored" });

  // Keep logs free of captions, file IDs, user details, and raw update payloads.
  console.info("telegram_media_update_received", {
    updateId: update.update_id,
    mediaType,
  });

  return jsonResponse({ ok: true, status: "accepted", updateId: update.update_id, mediaType });
}
