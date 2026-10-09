import test from "node:test";
import assert from "node:assert/strict";
import { groupAudiobooks } from "./audiobook-grouping.ts";

const book = (id, title, coverImage, extra = {}) => ({ id, title, coverImage, ...extra });

test("audiobooks with the same cover share one group and sort numbered chapters", () => {
  const groups = groupAudiobooks([
    book(1, "Novel Chapter 3", "/covers/novel.jpg"),
    book(2, "Novel Chapter 1", "/covers/novel.jpg"),
    book(3, "Novel Chapter 2", "/covers/novel.jpg"),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, "Novel");
  assert.deepEqual(groups[0].books.map(({ id }) => id), [2, 3, 1]);
});

test("different covers and missing covers stay in separate audiobook groups", () => {
  const groups = groupAudiobooks([
    book(1, "Same title", "/covers/one.jpg"),
    book(2, "Same title", "/covers/two.jpg"),
    book(3, "No cover", undefined),
    book(4, "No cover", undefined),
  ]);
  assert.equal(groups.length, 4);
});

test("SoundCloud proxy covers group by resolved artwork identity", () => {
  const books = [
    book(1, "Chapter 1", "/api/soundcloud/cover?url=https%3A%2F%2Fsoundcloud.com%2Fa%2F1", { slug: "one" }),
    book(2, "Chapter 2", "/api/soundcloud/cover?url=https%3A%2F%2Fsoundcloud.com%2Fa%2F2", { slug: "two" }),
  ];
  const groups = groupAudiobooks(books, {
    one: "https://i1.sndcdn.com/artworks-shared-large.jpg",
    two: "https://i2.sndcdn.com/artworks-shared-t500x500.jpg",
  });
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].books.map(({ slug }) => slug), ["one", "two"]);
});
