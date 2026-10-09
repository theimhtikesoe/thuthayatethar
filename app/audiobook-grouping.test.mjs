import test from "node:test";
import assert from "node:assert/strict";
import { groupAudiobooks } from "./audiobook-grouping.ts";

const book = (id, title, coverImage, extra = {}) => ({ id, title, coverImage, ...extra });

test("chapters 20 through 88 of the same book share one selector even with different covers", () => {
  const groups = groupAudiobooks([
    book(1, "Tian guan ci fu 20", "/covers/volume-a.jpg", { author: "Mo Xiang Tong Xiu" }),
    book(2, "Tian guan ci fu 88", "/covers/volume-b.jpg", { author: "Mo Xiang Tong Xiu" }),
    book(3, "Tian guan ci fu 21", "/covers/volume-c.jpg", { author: "Mo Xiang Tong Xiu" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, "Tian guan ci fu");
  assert.deepEqual(groups[0].books.map(({ id }) => id), [1, 3, 2]);
});

test("explicit Burmese chapter numbers are grouped and sorted numerically", () => {
  const groups = groupAudiobooks([
    book(1, "လေညင်း Chapter ၂", "/covers/two.jpg", { author: "Writer" }),
    book(2, "လေညင်း အခန်း ၁", "/covers/one.jpg", { author: "Writer" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title, "လေညင်း");
  assert.deepEqual(groups[0].books.map(({ id }) => id), [2, 1]);
});

test("numbered audiobook parts 6 and 7 stay separate even when they reuse one cover", () => {
  const title = "မင်းလူ - အချစ်သည်သက်တော်ရာကျော်ရှည်ပါစေသတည်း";
  const groups = groupAudiobooks([
    book(1, `${title} ၇`, "/covers/shared.jpg", { author: "မင်းလူ" }),
    book(2, `${title} ၆`, "/covers/shared.jpg", { author: "မင်းလူ" }),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.books[0].id), [1, 2]);
});

test("explicit part numbers stay separate even when the number is above 20", () => {
  const groups = groupAudiobooks([
    book(1, "Story Part 20", "/covers/shared.jpg"),
    book(2, "Story Part 21", "/covers/shared.jpg"),
  ]);
  assert.equal(groups.length, 2);
});

test("identical covers do not merge unrelated or unnumbered recordings", () => {
  const groups = groupAudiobooks([
    book(1, "First audiobook", "/covers/shared.jpg"),
    book(2, "Second audiobook", "/covers/shared.jpg"),
  ]);
  assert.equal(groups.length, 2);
});

test("duplicate chapter records remain separate rather than silently hiding one", () => {
  const groups = groupAudiobooks([
    book(1, "Novel Chapter 20", "/covers/one.jpg"),
    book(2, "Novel Chapter 20", "/covers/two.jpg"),
  ]);
  assert.equal(groups.length, 2);
});
