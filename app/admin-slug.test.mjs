import test from "node:test";
import assert from "node:assert/strict";
import { isValidAdminSlug } from "./api/admin/slug.ts";

test("accepts ASCII and legacy Burmese slugs used by existing Wattpad links", () => {
  assert.equal(isValidAdminSlug("wattpad-book-1a2b3c4d"), true);
  assert.equal(isValidAdminSlug("အချစ်သည်သက်တော်ရာကျော်ရှည်ပါစေသတည်း-၁၂၃၄abcd"), true);
});

test("rejects empty, oversized, path-like, and punctuation-only slugs", () => {
  for (const slug of ["", "../book", "book/part", "book title", "💚", "a".repeat(121)]) {
    assert.equal(isValidAdminSlug(slug), false, `rejected ${slug}`);
  }
  assert.equal(isValidAdminSlug(null), false);
});
