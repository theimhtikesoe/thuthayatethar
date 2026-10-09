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
                media_type: values[4],
                original_filename: values[7],
                mime_type: values[8],
                byte_size: values[9],
                created_at: values[10],
                status: "received",
                source_type: "telegram_media",
                updated_at: values[11],
              };
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          if (sql.includes("UPDATE intake_items SET status = 'downloading'")) {
            const isReceived = state.intakeItem?.status === "received";
            const isStale = state.intakeItem?.status === "downloading" && state.intakeItem.updated_at < values[2];
            if (!isReceived && !isStale) return { meta: { changes: 0 } };
            state.intakeItem.status = "downloading";
            state.intakeItem.updated_at = values[0];
            return { meta: { changes: 1 } };
          }
          if (sql.includes("UPDATE intake_items SET status = 'failed'")) {
            state.failureValues = values;
            if (state.intakeItem) state.intakeItem.status = "failed";
            return { meta: { changes: 1 } };
          }
          if (sql.includes("UPDATE intake_items SET status = 'received'")) {
            if (state.intakeItem?.status !== "failed") return { meta: { changes: 0 } };
            state.intakeItem.status = "received";
            state.intakeItem.failure_code = null;
            state.intakeItem.failure_message = null;
            return { meta: { changes: 1 } };
          }
          if (sql.includes("'retry_queued'") || sql.includes("'processing_started'")) return { meta: { changes: 1 } };
          if (sql.includes("'processing_failed'")) return { meta: { changes: 1 } };
          throw new Error(`Unexpected D1 run query: ${sql}`);
        },
        async first() {
          if (sql.includes("ORDER BY created_at ASC LIMIT 1")) {
            const item = state.intakeItem;
            if (!item) return null;
            const staleBefore = values[0];
            const activeCutoff = values[1];
            const hasActiveDownload = item.status === "downloading" && item.updated_at >= activeCutoff;
            if (hasActiveDownload) return null;
            const eligible = item.status === "received" || (item.status === "downloading" && item.updated_at < staleBefore);
            return eligible ? { id: item.id } : null;
          }
          if (sql.includes("SELECT * FROM intake_items")) return state.intakeItem;
          if (sql.includes("FROM intake_items")) return state.intakeItem;
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
      const intakeStatusUpdate = statements.find((statement) => statement.sql.includes("UPDATE intake_items SET status = ?"));
      if (state.intakeItem && intakeStatusUpdate) state.intakeItem.status = intakeStatusUpdate.values[0];
      return [];
    },
  };
}

function makeEnv(DB) {
  return {
    DB,
    TELEGRAM_WEBHOOK_SECRET: "test-secret",
    TELEGRAM_ALLOWED_CHAT_IDS: "-12345",
    ADMIN_TOKEN: "admin-test-token",
  };
}

function makeRequest(fileSize = 4096, { fileName = "book.pdf", mimeType = "application/pdf" } = {}) {
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
          file_name: fileName,
          mime_type: mimeType,
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
      const chunk = new Uint8Array(nextSize);
      if (sent === 0) chunk.set(new TextEncoder().encode("%PDF-"));
      controller.enqueue(chunk);
      sent += nextSize;
    },
  });
}

function pdfBytes(size) {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("%PDF-"));
  return bytes;
}

const fixedLengthStreamCalls = [];
const fixedLengthReadables = new WeakSet();
globalThis.FixedLengthStream = class extends TransformStream {
  constructor(length) {
    fixedLengthStreamCalls.push(length);
    let bytesWritten = 0;
    super({
      transform(chunk, controller) {
        bytesWritten += chunk.byteLength;
        if (bytesWritten > length) throw new Error("fixed_length_overflow");
        controller.enqueue(chunk);
      },
      flush() {
        if (bytesWritten !== length) throw new Error("fixed_length_mismatch");
      },
    });
    fixedLengthReadables.add(this.readable);
  }
};

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

test("ignores documents that are not PDFs", async () => {
  const DB = makeDb();
  const response = await worker.fetch(makeRequest(4096, { fileName: "cover.png", mimeType: "image/png" }), makeEnv(DB));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "ignored");
  assert.equal(DB.state.insertCalls, 0);
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

test("streams large Telegram PDFs to R2 and automatically publishes them after successful storage", async () => {
  const fileSize = 129 * 1024 * 1024;
  fixedLengthStreamCalls.length = 0;
  const DB = makeDb();
  const uploads = [];
  const env = {
    ...makeEnv(DB),
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_API_BASE_URL: "https://pdf-relay.rz99systems.com",
    FILE_RELAY_ACCESS_ID: "relay-client-id",
    FILE_RELAY_ACCESS_SECRET: "relay-client-secret",
    MAX_FILE_BYTES: String(160 * 1024 * 1024),
    BUCKET: {
      async put(key, body, options) {
        let size = 0;
        if (body instanceof ArrayBuffer) {
          size = body.byteLength;
        } else {
          assert.ok(fixedLengthReadables.has(body), "R2 must receive FixedLengthStream.readable directly");
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
      async get() { return null; },
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(init?.headers?.["CF-Access-Client-Id"], "relay-client-id");
    assert.equal(init?.headers?.["CF-Access-Client-Secret"], "relay-client-secret");
    if (String(input).includes("getFile?")) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "/var/lib/telegram-bot-api/bot-123/documents/large.pdf" } }), {
        headers: { "content-type": "application/json" },
      });
    }
    assert.match(String(input), /\/relay\/file\?path=/);
    return new Response(streamOfSize(fileSize), {
      headers: { "content-length": String(fileSize), "content-type": "application/pdf" },
    });
  };

  try {
    const response = await worker.fetch(makeRequest(fileSize), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "accepted");
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].size, fileSize);
  assert.deepEqual(fixedLengthStreamCalls, [fileSize]);
  assert.equal(uploads[0].options.customMetadata.sha256, undefined);
  const stored = DB.state.statements.find((statement) => statement.sql.includes("UPDATE intake_items SET status = ?"));
  assert.ok(stored);
  assert.equal(stored.values[0], "published");
  assert.equal(stored.values[2], null);
  assert.equal(stored.values[3], fileSize);
  const publishedBook = DB.state.statements.find((statement) => statement.sql.includes("INSERT OR IGNORE INTO book_drafts"));
  assert.ok(publishedBook);
  assert.equal(publishedBook.values[6], "published");
  assert.ok(DB.state.statements.some((statement) => statement.sql.includes("INSERT INTO ingestion_events") && statement.sql.includes("'published'")));
  const rights = DB.state.statements.find((statement) => statement.sql.includes("INSERT OR IGNORE INTO rights_records"));
  assert.ok(rights, "rights record remains present for later review");
  assert.equal(rights.values.length, 4);
});

test("admin retry processes a failed Telegram PDF and automatically publishes it after storage", async () => {
  const DB = makeDb();
  const uploads = [];
  const env = {
    ...makeEnv(DB),
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_API_BASE_URL: "https://api.telegram.org",
    BUCKET: {
      async put(key, body, options) {
        const size = body instanceof ArrayBuffer ? body.byteLength : (await new Response(body).arrayBuffer()).byteLength;
        uploads.push({ key, size, options });
        return { key, size, httpEtag: "retry-etag" };
      },
      async get() { return null; },
    },
  };
  const accepted = await worker.fetch(makeRequest(1024), env);
  const intakeId = (await accepted.json()).intakeId;
  DB.state.intakeItem.status = "failed";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes("getFile?")) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "/documents/retry.pdf" } }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(pdfBytes(1024), { headers: { "content-length": "1024" } });
  };

  try {
    const response = await worker.fetch(new Request(`https://worker.test/admin/retry/${intakeId}`, {
      method: "POST",
      headers: { "x-admin-token": "admin-test-token" },
    }), env);
    assert.equal(response.status, 202);
    assert.equal((await response.json()).status, "retrying");
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(uploads.length, 1);
  assert.equal(DB.state.intakeItem.status, "published");
  assert.ok(DB.state.statements.some((statement) => statement.sql.includes("INSERT OR IGNORE INTO book_drafts") && statement.values[6] === "published"));
});

test("does not publish a Telegram document with a PDF filename but invalid PDF bytes", async () => {
  const DB = makeDb();
  const env = {
    ...makeEnv(DB),
    TELEGRAM_BOT_TOKEN: "test-token",
    BUCKET: { async put() { assert.fail("invalid PDF must not reach R2"); }, async get() { return null; } },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).includes("getFile?")
    ? new Response(JSON.stringify({ ok: true, result: { file_path: "/documents/not-really-a-pdf.pdf" } }), { headers: { "content-type": "application/json" } })
    : new Response(new Uint8Array(32), { headers: { "content-length": "32" } });
  try {
    await worker.fetch(makeRequest(32), env);
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(DB.state.intakeItem.status, "failed");
  assert.equal(DB.state.failureValues[0], "invalid_pdf_header");
  assert.ok(!DB.state.statements.some((statement) => statement.values[6] === "published"));
});

test("keeps Telegram PDFs already queued before deployment as drafts", async () => {
  const DB = makeDb();
  const env = {
    ...makeEnv(DB),
    TELEGRAM_BOT_TOKEN: "test-token",
    BUCKET: {
      async put(key, body) {
        const size = body instanceof ArrayBuffer ? body.byteLength : (await new Response(body).arrayBuffer()).byteLength;
        return { key, size, httpEtag: "pre-cutover-etag" };
      },
      async get() { return null; },
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).includes("getFile?")
    ? new Response(JSON.stringify({ ok: true, result: { file_path: "/documents/pre-cutover.pdf" } }), { headers: { "content-type": "application/json" } })
    : new Response(pdfBytes(1024), { headers: { "content-length": "1024" } });
  try {
    await worker.fetch(makeRequest(1024), env);
    DB.state.intakeItem.created_at = "2020-01-01T00:00:00.000Z";
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(DB.state.intakeItem.status, "draft");
  assert.ok(DB.state.statements.some((statement) => statement.sql.includes("INSERT OR IGNORE INTO book_drafts") && statement.values[6] === "draft"));
});

test("scheduled processor skips a live download and recovers a stale one", async () => {
  const DB = makeDb();
  const uploads = [];
  const env = {
    ...makeEnv(DB),
    TELEGRAM_BOT_TOKEN: "test-token",
    BUCKET: {
      async put(key, body, options) {
        const size = body instanceof ArrayBuffer ? body.byteLength : (await new Response(body).arrayBuffer()).byteLength;
        uploads.push({ key, size, options });
        return { key, size, httpEtag: "scheduled-etag" };
      },
      async get() { return null; },
    },
  };
  await worker.fetch(makeRequest(1024), env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes("getFile?")) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "/documents/scheduled.pdf" } }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(pdfBytes(1024), { headers: { "content-length": "1024" } });
  };

  try {
    DB.state.intakeItem.status = "downloading";
    DB.state.intakeItem.updated_at = new Date().toISOString();
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env);
    assert.equal(uploads.length, 0, "an active lease must not start a second transfer");

    DB.state.intakeItem.updated_at = new Date(Date.now() - 21 * 60 * 1000).toISOString();
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(uploads.length, 1);
  assert.equal(DB.state.intakeItem.status, "published");
});

test("does not send a streamed upload to R2 when the total file size is unknown", async () => {
  const DB = makeDb();
  const env = {
    ...makeEnv(DB),
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_API_BASE_URL: "https://pdf-relay.rz99systems.com",
    MAX_FILE_BYTES: String(160 * 1024 * 1024),
    BUCKET: {
      async put() { assert.fail("R2 must not receive a stream without a known length"); },
      async get() { return null; },
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes("getFile?")) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "/var/lib/telegram-bot-api/bot-123/documents/unknown-size.pdf" } }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(streamOfSize(1024), { headers: { "content-type": "application/pdf" } });
  };

  try {
    await worker.fetch(makeRequest(0), env);
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(DB.state.failureValues[0], "file_size_unknown");
});

test("fails a stream that exceeds MAX_FILE_BYTES even without a content-length header", async () => {
  const DB = makeDb();
  const uploads = [];
  const env = {
    ...makeEnv(DB),
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_API_BASE_URL: "https://pdf-relay.rz99systems.com",
    FILE_RELAY_ACCESS_ID: "relay-client-id",
    FILE_RELAY_ACCESS_SECRET: "relay-client-secret",
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
      async get() { return null; },
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes("getFile?")) {
      return new Response(JSON.stringify({ ok: true, result: { file_path: "/var/lib/telegram-bot-api/bot-123/documents/too-large.pdf" } }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(streamOfSize(1025, 2048), { headers: { "content-type": "application/pdf" } });
  };

  try {
    await worker.fetch(makeRequest(1), env);
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(uploads.length, 0);
  assert.equal(DB.state.failureValues[0], "file_too_large");
});

test("serves a published PDF inline from private object storage", async () => {
  const DB = {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() {
          assert.match(sql, /publication_status = 'published'/);
          return { storage_key: "originals/intake/book.pdf", original_filename: "book.pdf" };
        },
      };
    },
  };
  const env = {
    ...makeEnv(DB),
    CATALOG_ORIGIN: "https://library.example",
    BUCKET: { async put() { return null; }, async get(key) {
      assert.equal(key, "originals/intake/book.pdf");
      return { body: new Response("%PDF-1.7 test").body, size: 13, httpEtag: "abc123" };
    } },
  };
  const response = await worker.fetch(new Request("https://worker.test/book/book-123/pdf"), env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.equal(response.headers.get("content-disposition"), "inline");
  assert.equal(response.headers.get("access-control-allow-origin"), "https://library.example");
  assert.match(response.headers.get("access-control-expose-headers"), /Content-Range/);
  assert.equal(response.headers.get("etag"), '"abc123"');
  assert.equal(await response.text(), "%PDF-1.7 test");
});

test("supports cross-origin PDF range requests from PDF.js", async () => {
  const DB = {
    prepare() {
      return {
        bind() { return this; },
        async first() { return { storage_key: "originals/intake/book.pdf", byte_size: 13 }; },
      };
    },
  };
  let requestedRange;
  const env = {
    ...makeEnv(DB),
    CATALOG_ORIGIN: "https://library.example",
    BUCKET: { async put() { return null; }, async get(_key, options) {
      requestedRange = options?.range;
      const bytes = new TextEncoder().encode("%PDF-1.7 test").slice(options?.range?.offset ?? 0, (options?.range?.offset ?? 0) + (options?.range?.length ?? 13));
      return { body: new Response(bytes).body, size: bytes.byteLength, httpEtag: '"abc123"' };
    } },
  };
  const url = "https://worker.test/book/book-123/pdf";
  const preflight = await worker.fetch(new Request(url, { method: "OPTIONS", headers: {
    Origin: "https://library.example",
    "Access-Control-Request-Method": "GET",
    "Access-Control-Request-Headers": "range, if-range",
  } }), env);
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), "https://library.example");
  assert.match(preflight.headers.get("access-control-allow-headers"), /If-Range/);

  const response = await worker.fetch(new Request(url, { headers: {
    Origin: "https://library.example",
    Range: "bytes=0-4",
  } }), env);
  assert.equal(response.status, 206);
  assert.deepEqual(requestedRange, { offset: 0, length: 5 });
  assert.equal(response.headers.get("content-range"), "bytes 0-4/13");
  assert.equal(response.headers.get("access-control-allow-origin"), "https://library.example");
  assert.equal(await response.text(), "%PDF-");
});

test("logs Cron ticks and idle queue decisions without exposing binding values", async () => {
  const DB = makeDb();
  const env = {
    ...makeEnv(DB),
    TELEGRAM_BOT_TOKEN: "test-token-must-not-appear-in-logs",
    BUCKET: { async put() { return null; }, async get() { return null; } },
  };
  const entries = [];
  const originalLog = console.log;
  console.log = (line) => entries.push(JSON.parse(line));

  try {
    await worker.scheduled({ cron: "* * * * *", scheduledTime: 1234567890 }, env);
  } finally {
    console.log = originalLog;
  }

  assert.deepEqual(entries.map((entry) => entry.event), ["cron_tick_started", "queue_no_eligible_candidate", "cron_tick_finished"]);
  assert.equal(entries[0].scheduledTime, 1234567890);
  assert.equal(entries[2].processed, false);
  assert.doesNotMatch(JSON.stringify(entries), /test-token-must-not-appear-in-logs|admin-test-token/);
});
