import test from "node:test";
import assert from "node:assert/strict";
import { adjacentPage, visiblePages } from "./reader-navigation.mjs";

test("desktop navigation goes cover, complete spreads, then back without skipping", () => {
  assert.deepEqual(visiblePages(0, 6, false), [1]);
  assert.equal(adjacentPage(0, 6, false, 1), 1);
  assert.deepEqual(visiblePages(1, 6, false), [2, 3]);
  assert.equal(adjacentPage(1, 6, false, 1), 3);
  assert.equal(adjacentPage(3, 6, false, -1), 1);
  assert.equal(adjacentPage(1, 6, false, -1), 0);
});
test("the right page of the final spread is already the last visible page", () => {
  assert.deepEqual(visiblePages(3, 5, false), [4, 5]);
  assert.equal(adjacentPage(3, 5, false, 1), 4);
  assert.deepEqual(visiblePages(4, 5, false), [4, 5]);
  assert.equal(adjacentPage(4, 5, false, -1), 1);
});
test("mobile navigation moves exactly one page and stays within the book", () => {
  assert.equal(adjacentPage(2, 5, true, 1), 3);
  assert.equal(adjacentPage(2, 5, true, -1), 1);
  assert.equal(adjacentPage(0, 5, true, -1), 0);
  assert.equal(adjacentPage(4, 5, true, 1), 4);
  assert.deepEqual(visiblePages(4, 5, true), [5]);
});
test("single-page and empty books have no out-of-range target", () => {
  assert.equal(adjacentPage(0, 1, false, 1), 0);
  assert.deepEqual(visiblePages(0, 0, false), []);
  assert.equal(adjacentPage(0, 0, false, 1), 0);
});