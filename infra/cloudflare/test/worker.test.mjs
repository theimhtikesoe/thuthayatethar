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
    insertValues: null,
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
          if (!sql.includes("INSERT OR IGNORE INTO intake_items")) {
            throw new Error(`Unexpected D1 run query: ${sql}`);
          }
          state.insertCalls += 1;
          state.insertValues = values;
          if (state.insertCalls === 1) {
            state.intakeId = values[0];
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
        async first() {
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

function makeRequest(update = {
  update_id: 10,
  message: {
    message_id: 4,
    chat: { id: -12345, type: "supergroup" },
    document: {
      file_id: "file-abc",
      file_name: "book.pdf",
      mime_type: "application/pdf",
      file_size: 4096,
    },
  },
}) {
  return new Request("https://worker.test/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "test-secret",
    },
    body: JSON.stringify(update),
  });
}

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

test("persists a SoundCloud message as a link intake without tracking parameters", async () => {
  const DB = makeDb();
  const env = makeEnv(DB);
  const request = makeRequest({
    update_id: 11,
    message: {
      message_id: 5,
      chat: { id: -12345, type: "supergroup" },
      text: "https://soundcloud.com/user-482056960/hnin-si-mwae-yar-01-khan-dar-nhint-arr-yone?si=aec1743b5ed44e089234e98cd73e9f98&utm_source=email&utm_medium=email&utm_campaign=social_sharing",
    },
  });

  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "accepted");
  assert.equal(DB.state.insertValues[2], null, "link intake has no Telegram file ID");
  assert.equal(DB.state.insertValues[3], "soundcloud_link");
  assert.equal(DB.state.insertValues[6], "https://soundcloud.com/user-482056960/hnin-si-mwae-yar-01-khan-dar-nhint-arr-yone");
});

test("ignores non-SoundCloud links", async () => {
  const DB = makeDb();
  const response = await worker.fetch(makeRequest({
    update_id: 12,
    message: {
      message_id: 6,
      chat: { id: -12345, type: "supergroup" },
      text: "https://example.com/audio",
    },
  }), makeEnv(DB));

  assert.equal((await response.json()).status, "ignored");
  assert.equal(DB.state.insertCalls, 0);
});
