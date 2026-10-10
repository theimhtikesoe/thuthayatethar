import test from "node:test";
import assert from "node:assert/strict";
import { groupAudiobooks } from "./audiobook-grouping.ts";
import { isBedAungThaik } from "./catalog-grouping.ts";

const book = (id, title, coverImage, extra = {}) => ({ id, title, coverImage, ...extra });

test("BED Aung Thaik audiobooks are recognized from author or title metadata", () => {
  assert.equal(isBedAungThaik(book(1, "မြညိုချစ်သောကိုရင်သြ", "", { author: "ဘီအီးဒီအောင်သိုက်" })), true);
  assert.equal(isBedAungThaik(book(2, "မြညိုငိုတဲ့နေ့ – ဘီအီးဒီအောင်သိုက်", "", { author: "ရွှေဇင်ထိုက်" })), true);
  assert.equal(isBedAungThaik(book(3, "အခြားစာအုပ်", "", { author: "အခြားစာရေးသူ" })), false);
});

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

test("trailing-numbered audiobook parts share one selector when the book title matches", () => {
  const title = "မင်းလူ - အချစ်သည်သက်တော်ရာကျော်ရှည်ပါစေသတည်း";
  const groups = groupAudiobooks([
    book(1, `${title} ၇`, "/covers/shared.jpg", { author: "Rodney Sann Lwin" }),
    book(2, `${title} ၆`, "/covers/shared.jpg", { author: "Rodney Sann Lwin" }),
    book(3, `${title} ၅`, "/covers/shared.jpg", { author: "Rodney Sann Lwin" }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].books.map(({ id }) => id), [3, 2, 1]);
});

test("chapter, part, and episode labels for one audiobook share one selector", () => {
  const groups = groupAudiobooks([
    book(1, "Story Part 20", "/covers/shared.jpg"),
    book(2, "Story chapter 21", "/covers/shared.jpg"),
    book(3, "Story အပိုင်း 22", "/covers/shared.jpg"),
    book(4, "Story Episode 23", "/covers/shared.jpg"),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].books.map(({ id }) => id), [1, 2, 3, 4]);
});

test("Tian Guan Ci Fu audio chapters stay together when author metadata differs", () => {
  const groups = groupAudiobooks([
    book(1, "Tian guan ci fu chapter 20", "/covers/one.jpg", { author: "" }),
    book(2, "Tian guan ci fu part 21", "/covers/two.jpg", { author: "Unknown" }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].books.map(({ id }) => id), [1, 2]);
});

test("Shwe U Daung Ratanar Thike uploads with variant titles share one selector", () => {
  const groups = groupAudiobooks([
    book(1, "ရွှေဥဒေါင်း - ရတနာသိုက် အပိုင်း(၁) ဝတ္ထု အသံစာအုပ်.m4a", "/covers/one.jpg", { author: "khaing" }),
    book(2, "ရွှေဥဒါင်း -သိုက်အရစွန့်စားသူ(အပိုင်း၂) ဇာတ်သိမ်းပိုင်း.m4a", "/covers/two.jpg", { author: "khaing" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].books.length, 2);
});

test("future numbered Make It Come True by Phay Myint uploads share one selector", () => {
  const groups = groupAudiobooks([
    book(1, "make it come true - ဖေမြင့် ၁", "/covers/one.jpg", { author: "Aye Pwint Phyu-AP" }),
    book(2, "make it come true - ဖေမြင့် ၂", "/covers/two.jpg", { author: "Aye Pwint Phyu-AP" }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].books.length, 2);
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
