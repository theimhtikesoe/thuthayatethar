import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.ts";

function makeDb({ failFirstBatch = false, catalogItems = [] } = {}) {
  const state = {
    insertCalls: 0,
    batchCalls: 0,
    statements: [],
    failFirstBatch,
    intakeId: null,
    intakeItem: null,
    failureValues: null,
    catalogItems,
    catalogSql: "",
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
                source_url: values[12] ?? null,
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
        async all() {
          state.catalogSql = sql;
          return {
            results: state.catalogItems.filter((item) =>
              item.publication_status === "published" || (item.source_type === "soundcloud_link" && item.soundcloud_url),
            ),
          };
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

function makeSoundCloudDb() {
  const state = { items: new Map(), updateIds: new Set(), rights: new Set(), books: new Map(), events: new Set(), batches: 0 };
  return {
    state,
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async run() {
          if (sql.includes("INSERT OR IGNORE INTO intake_items")) {
            const [id, updateId, fileKey, sourceUrl, chatId, messageId, title, createdAt, updatedAt] = values;
            if (state.items.has(fileKey) || state.updateIds.has(updateId)) return { meta: { changes: 0 } };
            state.items.set(fileKey, { id, updateId, fileKey, sourceUrl, chatId, messageId, title, status: sql.includes("'published'") ? "published" : "draft", createdAt, updatedAt });
            state.updateIds.add(updateId);
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unexpected SoundCloud D1 run query: ${sql}`);
        },
        async first() {
          if (sql.includes("WHERE telegram_file_id = ?")) {
            const item = state.items.get(values[0]);
            return item ? { id: item.id } : null;
          }
          throw new Error(`Unexpected SoundCloud D1 first query: ${sql}`);
        },
        get sql() { return sql; },
        get values() { return values; },
      };
    },
    async batch(statements) {
      state.batches += 1;
      for (const statement of statements) {
        if (statement.sql.includes("INSERT OR IGNORE INTO rights_records")) state.rights.add(statement.values[1]);
        else if (statement.sql.includes("INSERT OR IGNORE INTO book_drafts")) {
          const [id, intakeId, title, slug, author, summary, soundcloudUrl, metadataJson, category, publicationStatus] = statement.values;
          if (!state.books.has(intakeId)) state.books.set(intakeId, { id, intakeId, title, slug, author, category, summary, soundcloudUrl, metadataJson, publicationStatus });
        } else if (statement.sql.includes("INSERT INTO ingestion_events")) state.events.add(statement.values[0]);
        else throw new Error(`Unexpected SoundCloud D1 batch query: ${statement.sql}`);
      }
      return [];
    },
  };
}

function makeRequest(fileSize = 4096, { fileName = "book.pdf", mimeType = "application/pdf", caption = "" } = {}) {
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
        ...(caption ? { caption } : {}),
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

test("accepts standalone SoundCloud URLs as audiobook drafts and rejects unrelated hosts", async () => {
  const DB = makeDb();
  const env = makeEnv(DB);
  const request = new Request("https://worker.test/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "test-secret" },
    body: JSON.stringify({
      update_id: 11,
      message: {
        message_id: 5,
        chat: { id: -12345, type: "supergroup" },
        text: "Book title by Author https://soundcloud.com/artist/track",
      },
    }),
  });
  const response = await worker.fetch(request, env);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.status, "accepted");
  assert.equal(payload.sourceType, "soundcloud_link");
  assert.equal(DB.state.insertCalls, 1);
  assert.equal(DB.state.batchCalls, 1);

  const unsafeDb = makeDb();
  const unsafe = new Request("https://worker.test/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "test-secret" },
    body: JSON.stringify({
      update_id: 12,
      message: {
        message_id: 6,
        chat: { id: -12345, type: "supergroup" },
        text: "https://soundcloud.example/artist/track",
      },
    }),
  });
  const unsafeResponse = await worker.fetch(unsafe, makeEnv(unsafeDb));
  assert.equal((await unsafeResponse.json()).status, "ignored");
  assert.equal(unsafeDb.state.insertCalls, 0);
});

test("lists Telegram SoundCloud drafts in the public catalog but keeps other drafts private", async () => {
  const DB = makeDb({ catalogItems: [
    {
      id: "draft-audio", title: "Hnin Si Mwae Yar", slug: "hnin-si-mwae-yar", author: "Unknown",
      summary: "SoundCloud link", soundcloud_url: "https://soundcloud.com/artist/track",
      metadata_json: JSON.stringify({ public: { sourceType: "soundcloud" } }),
      publication_status: "draft", source_type: "soundcloud_link", storage_key: null,
    },
    {
      id: "draft-pdf", title: "Private PDF", slug: "private-pdf", publication_status: "draft",
      source_type: "telegram_media", soundcloud_url: null, storage_key: null,
    },
    {
      id: "published-audio", title: "Published audio", slug: "published-audio", author: "Author",
      soundcloud_url: "https://soundcloud.com/artist/published", metadata_json: "{}",
      publication_status: "published", source_type: "direct_upload", storage_key: null,
    },
  ] });

  const response = await worker.fetch(new Request("https://worker.test/catalog"), makeEnv(DB));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.books.length, 2);
  assert.deepEqual(payload.books.map((book) => book.id), ["draft-audio", "published-audio"]);
  assert.equal(payload.books[0].submissionSource, "telegram");
  assert.equal(payload.books[0].publicationStatus, "draft");
  assert.equal(payload.books[0].soundcloud_url, "https://soundcloud.com/artist/track");
  assert.match(DB.state.catalogSql, /i\.source_type = 'soundcloud_link'/);
  assert.match(DB.state.catalogSql, /b\.publication_status <> 'unpublished'/);
});

test("retains a SoundCloud URL sent with a PDF until draft creation", async () => {
  const DB = makeDb();
  const response = await worker.fetch(makeRequest(4096, { caption: "https://soundcloud.com/artist/audiobook" }), makeEnv(DB));
  assert.equal(response.status, 200);
  assert.equal(DB.state.intakeItem.source_url, "https://soundcloud.com/artist/audiobook");
});

test("expands a SoundCloud popular-tracks page into separate idempotent review drafts", async () => {
  const channelUrl = "https://soundcloud.com/myanmar-audio-books/popular-tracks";
  const page = `<!doctype html><html><body>
    <article class="audible" itemprop="track"><h2 itemprop="name"><a itemprop="url" href="/myanmar-audio-books/track-one">ပထမ အသံစာအုပ် &amp; အပို</a> by <a href="/myanmar-audio-books">Myanmar Audio Books</a></h2></article>
    <article class="audible" itemprop="track"><h2 itemprop="name"><a itemprop="url" href="/myanmar-audio-books/track-two">ဒုတိယ အသံစာအုပ်</a> by <a href="/myanmar-audio-books">Myanmar Audio Books</a></h2></article>
    <article class="audible" itemprop="track"><h2 itemprop="name"><a itemprop="url" href="/myanmar-audio-books/track-one">ထပ်နေသော track</a> by <a href="/myanmar-audio-books">Myanmar Audio Books</a></h2></article>
  </body></html>`;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async (input) => {
    fetchCalls += 1;
    assert.equal(String(input), channelUrl);
    return new Response(page, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  };
  const DB = makeSoundCloudDb();
  const env = makeEnv(DB);
  const request = () => new Request("https://worker.test/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "test-secret" },
    body: JSON.stringify({
      update_id: 72,
      message: {
        message_id: 18,
        chat: { id: -12345, type: "supergroup" },
        text: channelUrl,
      },
    }),
  });
  try {
    const response = await worker.fetch(request(), env);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(payload, { ok: true, status: "accepted", sourceType: "soundcloud_channel", trackCount: 2, created: 2, duplicates: 0 });
    assert.equal(fetchCalls, 1);
    assert.equal(DB.state.items.size, 2);
    assert.equal(DB.state.books.size, 2);
    assert.equal(DB.state.rights.size, 2);
    assert.equal(DB.state.events.size, 2);
    const books = [...DB.state.books.values()];
    assert.deepEqual(books.map((book) => book.soundcloudUrl).sort(), [
      "https://soundcloud.com/myanmar-audio-books/track-one",
      "https://soundcloud.com/myanmar-audio-books/track-two",
    ]);
    assert.equal(books.find((book) => book.soundcloudUrl.endsWith("track-one")).title, "ပထမ အသံစာအုပ် & အပို");
    assert.ok(books.every((book) => book.category === "အသံစာအုပ်"));

    const replay = await worker.fetch(request(), env);
    assert.deepEqual(await replay.json(), { ok: true, status: "duplicate", sourceType: "soundcloud_channel", trackCount: 2, created: 0, duplicates: 2 });
    assert.equal(DB.state.items.size, 2);
    assert.equal(DB.state.books.size, 2);
    assert.equal(fetchCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("expands a SoundCloud set into individual audiobook tracks with each creator and is idempotent", async () => {
  const setUrl = "https://soundcloud.com/user-343350243/sets/myanmar-audio-book";
  const page = `<!doctype html><html><body><script>window.__sc_hydration = [{"hydratable":"playlist","data":{"track_count":3,"tracks":[
    {"kind":"track","permalink_url":"https://soundcloud.com/myanmar-audio-books/fow7hlpqundt","title":"ဆရာေဇာ္ေဇာ္ေအာင္ ၏ ခင်သန်းနု","artwork_url":"https://i1.sndcdn.com/artworks-track-one-large.jpg","user":{"username":"Myanmar Audio Books"}},
    {"kind":"track","permalink_url":"https://soundcloud.com/akmoe-uk/juu-yellow-train","title":"Juu - Yellow Train","artwork_url":"https://i1.sndcdn.com/artworks-track-two-large.jpg","user":{"username":"A K Moe"}},
    {"kind":"track","permalink_url":"https://soundcloud.com/artist/third-track","title":"တတိယသီချင်း","artwork_url":"https://i1.sndcdn.com/artworks-track-three-large.jpg","user":{"username":"Artist"}}
  ]}}];</script><section class="tracklist"><meta itemprop="numTracks" content="3" />
    <article itemprop="track" itemscope itemtype="http://schema.org/MusicRecording"><h2 itemprop="name"><a itemprop="url" href="/myanmar-audio-books/fow7hlpqundt">ဆရာေဇာ္ေဇာ္ေအာင္ ၏ ခင်သန်းနု</a> by <a href="/myanmar-audio-books">Myanmar Audio Books</a></h2></article>
    <article itemprop="track" itemscope itemtype="http://schema.org/MusicRecording"><h2 itemprop="name"><a itemprop="url" href="/akmoe-uk/juu-yellow-train">Juu - Yellow Train</a> by <a href="/akmoe-uk">A K Moe</a></h2></article>
  </section></body></html>`;
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async (input) => {
    fetchCalls += 1;
    assert.equal(String(input), setUrl);
    return new Response(page, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  };
  const DB = makeSoundCloudDb();
  const env = makeEnv(DB);
  const request = () => new Request("https://worker.test/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "test-secret" },
    body: JSON.stringify({ update_id: 73, message: { message_id: 19, chat: { id: -12345, type: "supergroup" }, text: setUrl } }),
  });
  try {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, status: "accepted", sourceType: "soundcloud_set", trackCount: 3, created: 3, duplicates: 0 });
    const books = [...DB.state.books.values()];
    assert.equal(books.length, 3);
    assert.deepEqual(books.map((book) => book.soundcloudUrl).sort(), [
      "https://soundcloud.com/akmoe-uk/juu-yellow-train",
      "https://soundcloud.com/artist/third-track",
      "https://soundcloud.com/myanmar-audio-books/fow7hlpqundt",
    ]);
    assert.equal(books.find((book) => book.soundcloudUrl.includes("fow7hlpqundt")).author, "Myanmar Audio Books");
    assert.equal(books.find((book) => book.soundcloudUrl.includes("juu-yellow-train")).author, "A K Moe");
    assert.equal(JSON.parse(books.find((book) => book.soundcloudUrl.includes("fow7hlpqundt")).metadataJson).public.coverImage, "https://i1.sndcdn.com/artworks-track-one-large.jpg");
    assert.equal(JSON.parse(books.find((book) => book.soundcloudUrl.includes("third-track")).metadataJson).public.coverImage, "https://i1.sndcdn.com/artworks-track-three-large.jpg");
    assert.ok(books.every((book) => book.category === "အသံစာအုပ်"));
    const replay = await worker.fetch(request(), env);
    assert.deepEqual(await replay.json(), { ok: true, status: "duplicate", sourceType: "soundcloud_set", trackCount: 3, created: 0, duplicates: 3 });
    assert.equal(DB.state.books.size, 3);
    assert.equal(fetchCalls, 2);
  } finally { globalThis.fetch = originalFetch; }
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

async function retryPdfAndGetDb({ createdAt, extraEnv = {} }) {
  const DB = makeDb();
  const env = {
    ...makeEnv(DB),
    ...extraEnv,
    TELEGRAM_BOT_TOKEN: "test-token",
    TELEGRAM_API_BASE_URL: "https://api.telegram.org",
    BUCKET: {
      async put(key, body) {
        const size = body instanceof ArrayBuffer ? body.byteLength : (await new Response(body).arrayBuffer()).byteLength;
        return { key, size, httpEtag: "cutoff-etag" };
      },
      async get() { return null; },
    },
  };
  const accepted = await worker.fetch(makeRequest(1024), env);
  const intakeId = (await accepted.json()).intakeId;
  DB.state.intakeItem.created_at = createdAt;
  DB.state.intakeItem.status = "failed";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => String(input).includes("getFile?")
    ? new Response(JSON.stringify({ ok: true, result: { file_path: "/documents/cutoff.pdf" } }), { headers: { "content-type": "application/json" } })
    : new Response(pdfBytes(1024), { headers: { "content-length": "1024" } });
  try {
    const retry = await worker.fetch(new Request(`https://worker.test/admin/retry/${intakeId}`, { method: "POST", headers: { "x-admin-token": "admin-test-token" } }), env);
    assert.equal(retry.status, 202);
    await worker.scheduled({ cron: "* * * * *", scheduledTime: Date.now() }, env);
  } finally { globalThis.fetch = originalFetch; }
  return DB;
}

async function retryPdfAndGetItem(options) {
  return (await retryPdfAndGetDb(options)).state.intakeItem;
}

test("auto-publish cutoff is a fixed instant, not the time the Worker module loaded", async () => {
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  assert.equal((await retryPdfAndGetItem({ createdAt: anHourAgo })).status, "published");
});

test("AUTO_PUBLISH_FROM controls the cutoff and an invalid value fails closed to draft", async () => {
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  assert.equal((await retryPdfAndGetItem({ createdAt: anHourAgo, extraEnv: { AUTO_PUBLISH_FROM: new Date(Date.now() + 60_000).toISOString() } })).status, "draft");
  assert.equal((await retryPdfAndGetItem({ createdAt: anHourAgo, extraEnv: { AUTO_PUBLISH_FROM: "not-a-date" } })).status, "draft");
  assert.equal((await retryPdfAndGetItem({ createdAt: anHourAgo, extraEnv: { AUTO_PUBLISH_FROM: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() } })).status, "published");
});

const RIGHTS_MARKER_SQL = "UPDATE rights_records SET evidence_note = 'auto_publish_unreviewed'";

test("an auto-published Telegram PDF is marked auto_publish_unreviewed in its rights record, a draft is not", async () => {
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const published = await retryPdfAndGetDb({ createdAt: anHourAgo });
  const marker = published.state.statements.find((statement) => statement.sql.startsWith(RIGHTS_MARKER_SQL));
  assert.ok(marker, "published PDF must record that rights were not reviewed");
  assert.match(marker.sql, /rights_status = 'missing'/);
  assert.equal(marker.values[1], published.state.intakeId);

  const draft = await retryPdfAndGetDb({ createdAt: "2020-01-01T00:00:00.000Z" });
  assert.equal(draft.state.intakeItem.status, "draft");
  assert.ok(!draft.state.statements.some((statement) => statement.sql.startsWith(RIGHTS_MARKER_SQL)));
});

function makeApproveDb(row) {
  const state = { row, batches: [], bookSql: "" };
  return {
    state,
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() {
          if (sql.includes("FROM book_drafts b JOIN intake_items i")) { state.bookSql = sql; return state.row; }
          throw new Error(`Unexpected approve query: ${sql}`);
        },
        get sql() { return sql; },
        get values() { return values; },
      };
    },
    async batch(statements) { state.batches.push(statements.map((statement) => ({ sql: statement.sql, values: statement.values }))); return []; },
  };
}

function approveRequest(slug = "some-book") {
  return new Request(`https://worker.test/admin/approve/${slug}`, { method: "POST", headers: { "x-admin-token": "admin-test-token", "content-type": "application/json" }, body: JSON.stringify({ evidenceNote: "Owner confirmed" }) });
}

test("approve records rights for an auto-published PDF without changing its publication status", async () => {
  const DB = makeApproveDb({ id: "b1", intake_id: "i1", publication_status: "published", intake_status: "published", storage_key: "originals/i1/book.pdf", source_type: "telegram_media", soundcloud_url: null, rights_status: "missing" });
  const response = await worker.fetch(approveRequest(), makeEnv(DB));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, status: "published", rightsStatus: "approved", slug: "some-book" });
  const sqls = DB.state.batches.flat().map((statement) => statement.sql);
  assert.ok(sqls.some((sql) => sql.includes("UPDATE rights_records SET rights_status = 'approved'")));
  assert.ok(!sqls.some((sql) => sql.includes("UPDATE book_drafts") || sql.includes("UPDATE intake_items")));
});

test("approve does not rewrite rights that an admin already approved on a published book", async () => {
  const DB = makeApproveDb({ id: "b1", intake_id: "i1", publication_status: "published", intake_status: "published", storage_key: "originals/i1/book.pdf", source_type: "telegram_media", soundcloud_url: null, rights_status: "approved" });
  const response = await worker.fetch(approveRequest(), makeEnv(DB));
  assert.equal(response.status, 200);
  assert.equal(DB.state.batches.length, 0);
});

test("approve still refuses items that have no stored file or are not draft/published", async () => {
  for (const row of [
    { publication_status: "draft", intake_status: "failed", storage_key: null, source_type: "telegram_media", soundcloud_url: null },
    { publication_status: "draft", intake_status: "received", storage_key: null, source_type: "telegram_media", soundcloud_url: null },
    { publication_status: "published", intake_status: "draft", storage_key: null, source_type: "telegram_media", soundcloud_url: null },
  ]) {
    const DB = makeApproveDb({ id: "b1", intake_id: "i1", rights_status: "missing", ...row });
    const response = await worker.fetch(approveRequest(), makeEnv(DB));
    assert.equal(response.status, 409);
    assert.equal(DB.state.batches.length, 0);
  }
});

test("approve keeps the existing private-draft behaviour: rights approved, still draft", async () => {
  const DB = makeApproveDb({ id: "b1", intake_id: "i1", publication_status: "draft", intake_status: "draft", storage_key: "originals/i1/book.pdf", source_type: "telegram_media", soundcloud_url: null, rights_status: "missing" });
  const response = await worker.fetch(approveRequest(), makeEnv(DB));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "approved");
});

test("Wattpad external-link drafts can receive rights approval without an R2 file", async () => {
  const DB = makeApproveDb({ id: "b1", intake_id: "i1", publication_status: "draft", intake_status: "draft", storage_key: null, source_type: "wattpad_link", soundcloud_url: null, rights_status: "missing" });
  const response = await worker.fetch(approveRequest(), makeEnv(DB));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "approved");
  assert.ok(DB.state.batches.flat().some((statement) => statement.sql.includes("UPDATE rights_records SET rights_status = 'approved'")));
});

test("admin delete removes the book, intake and stored cover and returns success", async () => {
  const statements = [];
  const deletedKeys = [];
  const DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() {
          if (sql.includes("SELECT id, intake_id FROM book_drafts")) return { id: "book-1", intake_id: "intake-1" };
          if (sql.includes("SELECT storage_key FROM intake_items")) return { storage_key: null };
          throw new Error(`Unexpected delete query: ${sql}`);
        },
        get sql() { return sql; },
        get values() { return values; },
      };
    },
    async batch(batch) { statements.push(...batch.map(({ sql }) => sql)); return []; },
  };
  const env = { ...makeEnv(DB), BUCKET: { async delete(key) { deletedKeys.push(key); } } };
  const legacySlug = "သီချင်း-၁၂၃-abcdef12";
  const response = await worker.fetch(new Request(`https://worker.test/admin/delete/${encodeURIComponent(legacySlug)}`, { method: "DELETE", headers: { "x-admin-token": "admin-test-token" } }), env);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "deleted");
  assert.equal(payload.slug, legacySlug);
  assert.deepEqual(deletedKeys, ["covers/intake-1/cover.jpg"]);
  assert.ok(statements.some((sql) => sql.includes("DELETE FROM book_drafts")));
  assert.ok(statements.some((sql) => sql.includes("DELETE FROM intake_items")));
});

// ---- Link intake (F5–F8) -------------------------------------------------------------------------------------------
function makeLinkDb({ failOnAnyQuery = false, legacyItems = [] } = {}) {
  const state = { items: new Map(), updateIds: new Set(), books: new Map(), rights: new Set(), events: [] };
  for (const item of legacyItems) { state.items.set(item.fileKey, item); state.updateIds.add(item.updateId); }
  return {
    state,
    prepare(sql) {
      if (failOnAnyQuery) throw new Error(`unexpected D1 access: ${sql}`);
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async run() {
          if (!sql.includes("INSERT OR IGNORE INTO intake_items")) throw new Error(`Unexpected run query: ${sql}`);
          const [id, updateId, fileKey, sourceUrl, chatId, messageId, title] = values;
          if (state.items.has(fileKey) || state.updateIds.has(updateId)) return { meta: { changes: 0 } };
          state.items.set(fileKey, { id, updateId, fileKey, sourceUrl, chatId, messageId, title, status: sql.includes("'published'") ? "published" : "draft", sourceType: /'(wattpad_link|soundcloud_link)'/.exec(sql)?.[1] });
          state.updateIds.add(updateId);
          return { meta: { changes: 1 } };
        },
        async first() {
          if (!sql.includes("WHERE telegram_file_id = ?")) throw new Error(`Unexpected first query: ${sql}`);
          const item = state.items.get(values[0]);
          return item ? { id: item.id } : null;
        },
        get sql() { return sql; },
        get values() { return values; },
      };
    },
    async batch(statements) {
      for (const statement of statements) {
        if (statement.sql.includes("INSERT OR IGNORE INTO rights_records")) state.rights.add(statement.values[1]);
        else if (statement.sql.includes("INSERT OR IGNORE INTO book_drafts")) {
          const [id, intakeId, title, slug, author, summary, soundcloudUrl, metadataJson, category, publicationStatus] = statement.values;
          if (!state.books.has(intakeId)) state.books.set(intakeId, { id, intakeId, title, slug, author, summary, soundcloudUrl, metadata: JSON.parse(metadataJson), category, publicationStatus });
        } else if (statement.sql.includes("INSERT INTO ingestion_events")) state.events.push(statement.values[0]);
        else throw new Error(`Unexpected batch query: ${statement.sql}`);
      }
      return [];
    },
  };
}

async function postMessage(env, updateId, message) {
  const response = await worker.fetch(new Request("https://worker.test/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "test-secret" },
    body: JSON.stringify({ update_id: updateId, message: { message_id: updateId, chat: { id: -12345, type: "supergroup" }, ...message } }),
  }), env);
  assert.equal(response.status, 200);
  return response.json();
}

const wattpadLink = "https://www.wattpad.com/story/123456789-sample-story";

test("a photo is ignored without touching the database, even with a plain caption (F5)", async () => {
  const env = makeEnv(makeLinkDb({ failOnAnyQuery: true }));
  assert.equal((await postMessage(env, 301, { photo: [{ file_id: "p1", file_size: 100 }] })).status, "ignored");
  assert.equal((await postMessage(env, 302, { photo: [{ file_id: "p2", file_size: 100 }], caption: "ဒီနေ့ စာအုပ်" })).status, "ignored");
});

test("a SoundCloud link in a photo caption becomes an audiobook link and the photo is not stored (F6)", async () => {
  const DB = makeLinkDb();
  const payload = await postMessage(makeEnv(DB), 303, { photo: [{ file_id: "p3", file_size: 100 }], caption: "Night Stories by Narrator https://soundcloud.com/narrator/night-stories" });
  assert.equal(payload.status, "accepted");
  assert.equal(payload.sourceType, "soundcloud_link");
  assert.equal(DB.state.items.size, 1);
  const [item] = DB.state.items.values();
  assert.equal(item.sourceType, "soundcloud_link");
  const [book] = DB.state.books.values();
  assert.equal(book.soundcloudUrl, "https://soundcloud.com/narrator/night-stories");
  assert.equal(book.title, "Night Stories");
  assert.equal(book.author, "Narrator");
  assert.equal(item.status, "published");
  assert.equal(book.publicationStatus, "published");
});

test("a SoundCloud link named with the opaque ID uses the reviewed cover title", async () => {
  const DB = makeLinkDb();
  await postMessage(makeEnv(DB), 304, { text: "xj3aq3cyzsn4 https://soundcloud.com/artist/xj3aq3cyzsn4" });
  const [book] = DB.state.books.values();
  assert.equal(book.title, "ဝင်းဖေ ဝတ္ထုတိုများ");
  assert.equal(book.publicationStatus, "published");
});

test("a PDF whose caption contains a Wattpad link is stored as a PDF, not as a link card (F7)", async () => {
  const DB = makeDb();
  const response = await worker.fetch(makeRequest(2048, { caption: `Sample Story ${wattpadLink}` }), makeEnv(DB));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.status, "accepted");
  assert.notEqual(payload.sourceType, "wattpad_link");
  assert.equal(DB.state.intakeItem.telegram_file_id, "file-abc");
  assert.equal(DB.state.intakeItem.original_filename, "book.pdf");
  assert.equal(DB.state.intakeItem.status, "received");
});

test("a Wattpad link without a PDF still becomes a link card with no SoundCloud URL attached (F7)", async () => {
  const DB = makeLinkDb();
  const payload = await postMessage(makeEnv(DB), 304, { text: `"Sample Story" by Writer on Wattpad ${wattpadLink}` });
  assert.equal(payload.sourceType, "wattpad_link");
  const [item] = DB.state.items.values();
  assert.equal(item.sourceType, "wattpad_link");
  const [book] = DB.state.books.values();
  assert.equal(book.soundcloudUrl, null);
  assert.equal(book.metadata.public.externalUrl, "https://www.wattpad.com/story/123456789-sample-story");
});

test("a Wattpad chapter URL is accepted and receives a useful part title", async () => {
  const DB = makeLinkDb();
  const chapterLink = "https://www.wattpad.com/1327143584-part-1";
  const payload = await postMessage(makeEnv(DB), 309, { text: `${chapterLink}.` });
  assert.equal(payload.sourceType, "wattpad_link");
  const [book] = DB.state.books.values();
  assert.equal(book.metadata.public.externalUrl, chapterLink);
  assert.equal(book.title, "Wattpad အပိုင်း 1");
});

test("a Wattpad story URL with an encoded Burmese slug is accepted and named", async () => {
  const DB = makeLinkDb();
  const storyLink = "https://www.wattpad.com/story/337587564-%E1%80%90%E1%80%AD%E1%80%99%E1%80%BA%E1%80%90%E1%80%AD%E1%80%AF%E1%80%80%E1%80%BA%E1%80%9C%E1%80%84%E1%80%BA%E1%80%B8%E1%80%8A%E1%80%AD%E1%80%AF-%E1%80%A1%E1%80%AD%E1%80%99%E1%80%BA%E1%80%B7%E1%80%82%E1%80%BB%E1%80%B0%E1%80%B8-%E1%80%99%E1%80%AD%E1%80%AF%E1%80%B8%E1%80%9E%E1%80%8A%E1%80%BA%E1%80%B8%E1%80%9E%E1%80%8A%E1%80%BA%E1%80%B8";
  const payload = await postMessage(makeEnv(DB), 310, { text: storyLink });
  assert.equal(payload.sourceType, "wattpad_link");
  const [book] = DB.state.books.values();
  assert.equal(book.metadata.public.externalUrl, storyLink);
  assert.match(book.title, /တိမ်တိုက်လင်းညို/);
  assert.notEqual(book.title, "Wattpad စာအုပ်");
  assert.match(book.slug, /^[a-z0-9][a-z0-9-]*$/);
});

test("every SoundCloud link in one message becomes its own audiobook and a replay creates nothing new (F8)", async () => {
  const DB = makeLinkDb();
  const env = makeEnv(DB);
  const text = "https://soundcloud.com/a/track-one https://soundcloud.com/a/track-two, https://soundcloud.com/a/track-three https://soundcloud.com/a/track-one";
  const payload = await postMessage(env, 305, { text });
  assert.equal(payload.status, "accepted");
  assert.equal(payload.sourceType, "links");
  assert.equal(payload.count, 3);
  assert.equal(payload.created, 3);
  assert.equal(DB.state.items.size, 3);
  assert.equal(DB.state.updateIds.size, 3, "each link needs its own telegram_update_id");
  assert.equal(DB.state.books.size, 3);
  assert.equal(DB.state.rights.size, 3);
  assert.deepEqual([...DB.state.books.values()].map((book) => book.title).sort(), ["track one", "track three", "track two"]);

  const replay = await postMessage(env, 305, { text });
  assert.equal(replay.status, "duplicate");
  assert.equal(replay.created, 0);
  assert.equal(replay.duplicates, 3);
  assert.equal(DB.state.items.size, 3);
  assert.equal(DB.state.books.size, 3);
});

test("a message is capped at 10 SoundCloud links", async () => {
  const DB = makeLinkDb();
  const text = Array.from({ length: 12 }, (_, index) => `https://soundcloud.com/a/track-${index + 1}`).join(" ");
  const payload = await postMessage(makeEnv(DB), 306, { text });
  assert.equal(payload.count, 10);
  assert.equal(DB.state.items.size, 10);
});

test("a channel URL is only expanded when sent alone; among other links it is skipped and reported", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("channel pages must not be fetched for multi-link messages"); };
  try {
    const DB = makeLinkDb();
    const payload = await postMessage(makeEnv(DB), 307, { text: "https://soundcloud.com/a/track-one https://soundcloud.com/some-channel" });
    assert.equal(payload.count, 1);
    assert.equal(payload.skippedChannelUrls, 1);
    assert.equal(DB.state.items.size, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test("a Wattpad link and a SoundCloud link in one message are saved as two separate intakes (F7/F8)", async () => {
  const DB = makeLinkDb();
  const payload = await postMessage(makeEnv(DB), 308, { text: `${wattpadLink} https://soundcloud.com/a/audio-version` });
  assert.equal(payload.sourceType, "links");
  assert.equal(payload.count, 2);
  const books = [...DB.state.books.values()];
  assert.equal(books.length, 2);
  assert.equal(books.filter((book) => book.soundcloudUrl).length, 1);
  assert.equal(books.find((book) => book.metadata.sourceType === "wattpad_link").soundcloudUrl, null);
});

test("re-delivery of a single SoundCloud link stored before this change deduplicates on its link key", async () => {
  const url = "https://soundcloud.com/artist/legacy-track";
  const DB = makeLinkDb({ legacyItems: [{ id: "legacy-id", updateId: 311, fileKey: `soundcloud:${url}`, sourceUrl: url }] });
  const payload = await postMessage(makeEnv(DB), 311, { text: url });
  assert.equal(payload.status, "duplicate");
  assert.equal(payload.intakeId, "legacy-id");
  assert.equal(DB.state.items.size, 1);
});

test("accepts the user’s SoundCloud share URL and strips its tracking query", async () => {
  const DB = makeLinkDb();
  const url = "https://soundcloud.com/user-482056960/hnin-si-mwae-yar-01-khan-dar-nhint-arr-yone?si=aec1743b5ed44e089234e98cd73e9f98&utm_source=email&utm_medium=email&utm_campaign=social_sharing";
  const payload = await postMessage(makeEnv(DB), 312, { text: url });
  assert.equal(payload.status, "accepted");
  assert.equal(payload.sourceType, "soundcloud_link");
  const [book] = DB.state.books.values();
  assert.equal(book.soundcloudUrl, "https://soundcloud.com/user-482056960/hnin-si-mwae-yar-01-khan-dar-nhint-arr-yone");
});

test("PDFs received before the first production auto-publish deployment remain drafts on retry", async () => {
  for (const createdAt of ["2026-10-09T07:50:37.382Z", "2026-10-09T07:51:03.432Z"]) {
    assert.equal((await retryPdfAndGetItem({ createdAt })).status, "draft");
  }
});

test("an auto-published PDF gets a Burmese summary and no Mongolian text (F3)", async () => {
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const DB = await retryPdfAndGetDb({ createdAt: anHourAgo });
  const draft = DB.state.statements.find((statement) => statement.sql.startsWith("INSERT OR IGNORE INTO book_drafts"));
  assert.ok(draft);
  assert.equal(draft.values[4], "Telegram မှ ရောက်ရှိလာသော PDF ဖြစ်သည်။");
  assert.ok(!/[\u0400-\u04FF]/.test(JSON.stringify(draft.values)));
});
