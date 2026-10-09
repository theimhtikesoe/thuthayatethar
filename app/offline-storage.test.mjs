import test from "node:test";
import assert from "node:assert/strict";
import { OFFLINE_SELECTION_STORAGE_KEY, readOfflineSelection, requestPersistentStorage, writeOfflineSelection } from "./offline-storage.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("offline download selections survive a reload and are de-duplicated", () => {
  const storage = memoryStorage();
  writeOfflineSelection(storage, ["book-a", "book-b", "book-a"]);
  assert.equal(storage.getItem(OFFLINE_SELECTION_STORAGE_KEY), '["book-a","book-b"]');
  assert.deepEqual(readOfflineSelection(storage), ["book-a", "book-b"]);
});

test("invalid offline selection data is ignored safely", () => {
  const storage = memoryStorage();
  storage.setItem(OFFLINE_SELECTION_STORAGE_KEY, "not-json");
  assert.deepEqual(readOfflineSelection(storage), []);
});

test("persistent storage is requested only when it is not already durable", async () => {
  let requestCount = 0;
  assert.equal(await requestPersistentStorage({
    async persisted() { return false; },
    async persist() { requestCount += 1; return true; },
  }), true);
  assert.equal(requestCount, 1);

  assert.equal(await requestPersistentStorage({
    async persisted() { return true; },
    async persist() { requestCount += 1; return false; },
  }), true);
  assert.equal(requestCount, 1);
});

test("storage durability gracefully falls back when unsupported or denied", async () => {
  assert.equal(await requestPersistentStorage(undefined), false);
  assert.equal(await requestPersistentStorage({ async persist() { return false; } }), false);
  assert.equal(await requestPersistentStorage({ async persist() { throw new Error("denied"); } }), false);
});
