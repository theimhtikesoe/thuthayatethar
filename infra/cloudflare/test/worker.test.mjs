import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";

function makeDb({ failFirstBatch = false } = {}) {
  const state = {
    insertCalls: 0,
    batchCalls: 0,
    statements: [],
    failFirstBatch,
    intakeId: null,
    intakeItem: null,
    failureValues: null,
  };

  return {
    state,
    prepare(sql) {
      let values = [];
      return {
        bind(...args) {
          values = args;
          return this;
        },
        async run() {
          if (sql.includes("INSERT OR IGNORE INTO intake_items")) {
            state.insertCalls += 1;
            if (state.insertCalls === 1) {
              state.intakeId = values[0];
              state.intakeItem = {
                id: values[0],
                telegram_file_id: values[2],
                media_type: values[3],
                original_filename: values[6],
                mime_type: values[7],
                byte_size: values[8],
              };
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          if (sql.includes("UPDATE intake_items SET status = 'failed'")) {
            state.failureValues = values;
            return { meta: { changes: 1 } };
          }
          if (sql.includes("'processing_failed'")) return { meta: { changes: 1 } };
          throw new Error(`Unexpected D1 run query: ${sql}`);
        },
        async first() {
          if (sql.includes("SELECT * FROM intake_items")) return state.intakeItem;
          return state.intakeId ? { id: state.intakeId } : null;
        },
        get sql() {
          return sql;
        },
        get values() {
          return values;
        },
      };
    },
    async batch(statements) {
      state.batchCalls += 1;
      if (state.failFirstBatch && state.batchCalls === 1) {
        throw new Error("simulated D1 batch failure");
      }
      state.statements.push(...statements.map((statement) => ({
        sql: statement.sql,
        values: statement.values,
      })));
      return [];
    },
  };
}

function makeEnv(DB) {
  return {
    DB,
    TELEGRAM_WEBHOOK_SECRET: "test-secret",
    TELEGRAM_ALLOWED_CHAT_IDS: "-12345",
  };
}

function makeRequest(fileSize = 4096) {
  return new Request("https://worker.test/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "test-secret",
    },
    body: JSON.stringify({
      update_id: 10,
      message: {
        message_id: 4,
        chat: { id: -12345, type: "supergroup" },
        document: {
          file_id: "file-abc",
          file_name: "book.pdf",
          mime_type: "application/pdf",
          file_size: fileSize,
        },
      },
    }),
  });
}

function streamOfSize(totalBytes, chunkSize = 1024 * 1024) {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) return controller.close();
      const nextSize = Math.min(chunkSize, totalBytes - sent);
      controller.enqueue(new Uint8Array(nextSize));
      sent += nextSize;
    },
  });
}

test("fails closed when the webhook secret is not configured", async () => {
  const env = makeEnv(makeDb());
  delete env.TELEGRAM_WEBHOOK_SECRET;

  const response = await worker.fetch(makeRequest(), env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: "webhook_not_configured" });
});

test("accepts an intake and returns the same record on duplicate delivery", async () => {
  const DB = makeDb();
  const env = makeEnv(DB);

  const first = await worker.fetch(makeRequest(), env);
  assert.equal(first.status, 200);
  const accepted = await first.json();
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.intakeId, DB.state.intakeId);

  const replay = await worker.fetch(makeRequest(), env);
  assert.equal(replay.status, 200);
  const duplicate = await replay.json();
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.intakeId, accepted.intakeId);
  assert.equal(DB.state.batchCalls, 2);
});

test("repairs rights and received-event rows after an interrupted D1 batch", async () => {
  const DB = makeDb({ failFirstBatch: true });
  const env = makeEnv(DB);

  await assert.rejects(
    () => worker.fetch(makeRequest(), env),
    /simulated D1 batch failure/,
  );

  const retry = await worker.fetch(makeRequest(), env);
  assert.equal(retry.status, 200);
  const duplicate = await retry.json();
  assert.equal(duplicate.status, "duplicate");
  assert.equal(duplicate.intakeId, DB.state.intakeId);
  assert.equal(DB.state.batchCalls, 2);
  assert.equal(DB.state.statements.filter((statement) => statement.sql.includes("rights_records")).length, 1);
  assert.equal(DB.state.statements.filter((statement) => statement.sql.includes("ingestion_events")).length, 1);
});

test("streams files larger than 20 MiB into private R2 and records their size", async () => {
  const fileSize = 129 * 1024 * 1024;
  const DB = makeDb();
  const uploads = [];
  const env = {
    ...makeEnv(DB),
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_API_BASE_URL: "https://local-api.test",
    MAX_FILE_BYTES: String(140 * 1024 * 1024),
    BUCKET: {
      async put(key, body, options) {
        let size = 0;
        if (body instanceof ArrayBuffer) {
          size = body.byteLength;
        } else {
          const reader = body.getReader();
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.byteLength;
          }
        }
        uploads.push({ key, size, options });
        return { key, size, httpEtag: "test-etag" };
      },
    },
  };
  const pending = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes("getFile?")) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "documents/large.pdf" } }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(streamOfSize(fileSize), {
      headers: { "content-length": String(fileSize), "content-type": "application/pdf" },
    });
  };

  try {
    const response = await worker.fetch(makeRequest(fileSize), env, { waitUntil(promise) { pending.push(promise); } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "accepted");
    await Promise.all(pending);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].size, fileSize);
  assert.equal(uploads[0].options.customMetadata.sha256, undefined);
  const stored = DB.state.statements.find((statement) => statement.sql.includes("UPDATE intake_items SET status = 'draft'"));
  assert.ok(stored);
  assert.equal(stored.values[1], null);
  assert.equal(stored.values[2], fileSize);
});

test("fails a stream that exceeds MAX_FILE_BYTES even without a content-length header", async () => {
  const DB = makeDb();
  const uploads = [];
  const env = {
    ...makeEnv(DB),
    TELEGRAM_BOT_TOKEN: "test-token",
    MAX_FILE_BYTES: "1024",
    BUCKET: {
      async put(key, body) {
        const reader = body.getReader();
        let size = 0;
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
        }
        uploads.push({ key, size });
        return { key, size, httpEtag: "test-etag" };
      },
    },
  };
  const pending = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes("getFile?")) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "documents/too-large.pdf" } }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(streamOfSize(1025, 256), { headers: { "content-type": "application/pdf" } });
  };

  try {
    await worker.fetch(makeRequest(1), env, { waitUntil(promise) { pending.push(promise); } });
    await Promise.all(pending);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(uploads.length, 0);
  assert.equal(DB.state.failureValues[0], "file_too_large");
});
