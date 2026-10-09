import test from "node:test";
import assert from "node:assert/strict";
import { audioProgressStorageKey, clearAudioProgress, formatAudioTime, mostRecentListening, readAudioProgress, saveAudioProgress } from "./audio-progress.ts";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const book = (slug, title) => ({ id: slug, slug, title, soundcloud_url: `https://soundcloud.com/artist/${slug}` });

test("audio progress saves and restores position, duration, and recency", () => {
  const storage = memoryStorage();
  const first = book("first", "First book");
  const second = book("second", "Second book");
  saveAudioProgress(first, storage, 45_000, 120_000, 100);
  saveAudioProgress(second, storage, 70_000, 120_000, 200);
  assert.deepEqual(readAudioProgress(second, storage), { positionMs: 70_000, durationMs: 120_000, updatedAt: 200 });
  assert.equal(mostRecentListening([first, second], storage).book.slug, "second");
});

test("legacy position-only progress resumes and is clamped to known duration", () => {
  const storage = memoryStorage();
  const item = book("legacy", "Legacy book");
  const key = audioProgressStorageKey(item);
  storage.setItem(key, "150000");
  storage.setItem(`${key}:duration`, "90000");
  assert.deepEqual(readAudioProgress(item, storage), { positionMs: 90_000, durationMs: 90_000, updatedAt: 0 });
});

test("finished tracks are removed from the recent-listening shelf", () => {
  const storage = memoryStorage();
  const item = book("finished", "Finished book");
  saveAudioProgress(item, storage, 20_000, 60_000, 100);
  clearAudioProgress(item, storage);
  assert.equal(mostRecentListening([item], storage), null);
});

test("audio time formatting is stable for short and long recordings", () => {
  assert.equal(formatAudioTime(0), "0:00");
  assert.equal(formatAudioTime(125_000), "2:05");
  assert.equal(formatAudioTime(3_723_000), "62:03");
});
