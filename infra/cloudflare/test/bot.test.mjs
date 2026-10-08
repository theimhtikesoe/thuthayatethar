import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";

function makeRequest(text) {
  return new Request("https://worker.test/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "test-secret" },
    body: JSON.stringify({ update_id: 91, message: { message_id: 7, chat: { id: -12345, type: "supergroup" }, from: { id: 42 }, text } }),
  });
}

test("handles /search in the allowlisted group and returns inline book buttons", async () => {
  const DB = { prepare(sql) {
    return { bind() { return this; }, async all() { return { results: [{ id: "book-1", title: "မိုးရေထဲက လမ်းလျှောက်သူ", author: "မေမြို့မင်း", slug: "rain-book" }] }; } };
  } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => { if (String(input).endsWith("/sendMessage")) { return new Response(JSON.stringify({ ok: true })); } return new Response(JSON.stringify({ ok: true })); };
  try {
    const response = await worker.fetch(makeRequest("/search မိုးရေ"), { DB, TELEGRAM_WEBHOOK_SECRET: "test-secret", TELEGRAM_ALLOWED_CHAT_IDS: "-12345", TELEGRAM_BOT_TOKEN: "test-token" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "bot_handled");
  } finally { globalThis.fetch = originalFetch; }
});
