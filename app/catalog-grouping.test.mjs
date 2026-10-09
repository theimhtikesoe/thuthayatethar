import test from "node:test";
import assert from "node:assert/strict";
import { chapterLabel, chapterNumberFromTitle, groupBooks, groupTitle } from "./catalog-grouping.ts";

const book = (id, title, author = "A") => ({ id, title, author });

test("identical book titles remain separate catalog cards", () => {
  const groups = groupBooks([
    book(1, "လမ်းဆုံးမှာ", "ရေးသူ က"),
    book(2, "လမ်းဆုံးမှာ", "ရေးသူ ခ"),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((group) => group.chapters.map(({ id }) => id)), [[1], [2]]);
});

test("Tian Guan Ci Fu volumes with identical titles share one chapter picker", () => {
  const volumes = [book(1, "Tian guan ci fu"), book(2, "Tian guan ci fu")];
  const [group] = groupBooks(volumes);
  assert.equal(groupBooks(volumes).length, 1);
  assert.deepEqual(group.chapters.map(({ id }) => id), [1, 2]);
  assert.equal(groupTitle(group), "Tian guan ci fu");
  assert.equal(chapterLabel(group.chapters[0], 1), "အခန်း 1");
  assert.equal(chapterLabel(group.chapters[1], 2), "အခန်း 2");
});

test("distinct numbered chapters group and sort without colliding with other authors", () => {
  const groups = groupBooks([
    book(1, "ဝတ္ထု Chapter 2", "စာရေးသူ"),
    book(2, "ဝတ္ထု Chapter 1", "စာရေးသူ"),
    book(3, "ဝတ္ထု Chapter 3", "အခြားစာရေးသူ"),
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].chapters.map(({ id }) => id), [2, 1]);
  assert.equal(groupTitle(groups[0]), "ဝတ္ထု");
  assert.equal(chapterLabel(groups[0].chapters[0]), "အခန်း 1");
  assert.equal(groupTitle(groupBooks([book(4, "The Long Road Chapter 1"), book(5, "The Long Road Chapter 2")])[0]), "The Long Road");
});

test("chapter ranges group with single chapters and keep their full range label", () => {
  const books = [
    book(1, "Tian guan ci fu chapter 26"),
    book(2, "Tian guan ci fu chapter 20"),
    book(3, "Tian guan ci fu chapter ၂၁-၈၈"),
  ];
  const groups = groupBooks(books);
  assert.equal(groups.length, 1);
  assert.equal(groupTitle(groups[0]), "Tian guan ci fu");
  assert.deepEqual(groups[0].chapters.map(({ id }) => id), [2, 3, 1]);
  assert.deepEqual(groups[0].chapters.map((chapter, index) => chapterLabel(chapter, index + 1)), ["အခန်း 20", "အခန်း 21–88", "အခန်း 26"]);
});

test("Myanmar chapter numerals are recognized and sorted numerically", () => {
  assert.equal(chapterNumberFromTitle("ဇာတ်လမ်း အခန်း ၁၂"), 12);
  const groups = groupBooks([
    book(1, "ဇာတ်လမ်း အခန်း ၂"),
    book(2, "ဇာတ်လမ်း အခန်း ၁"),
  ]);
  assert.deepEqual(groups[0].chapters.map(({ id }) => id), [2, 1]);
  assert.equal(chapterLabel(groups[0].chapters[0]), "အခန်း 1");
});

test("duplicate chapter numbers stay as independent cards", () => {
  const groups = groupBooks([
    book(1, "Series Chapter 1"),
    book(2, "Series Chapter 1"),
  ]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((group) => group.chapters.length === 1));
});
