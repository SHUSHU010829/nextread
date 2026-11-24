import { test } from "node:test";
import assert from "node:assert/strict";
import { hiResCover } from "./cover.ts";

test("hiResCover upgrades Google Books thumbnails", () => {
  const out = new URL(hiResCover("http://books.google.com/books/content?id=abc&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api"));
  assert.equal(out.protocol, "https:");
  assert.equal(out.searchParams.get("edge"), null);
  assert.equal(out.searchParams.get("fife"), "w800-h1200");
  assert.equal(out.searchParams.get("id"), "abc");
  assert.match(hiResCover("https://books.google.com.tw/books/content?id=x&img=1"), /fife=w800-h1200/);
});

test("hiResCover upgrades Open Library and leaves others alone", () => {
  assert.equal(hiResCover("https://covers.openlibrary.org/b/id/42-M.jpg"), "https://covers.openlibrary.org/b/id/42-L.jpg");
  assert.equal(hiResCover("https://example.com/a.jpg"), "https://example.com/a.jpg");
  assert.equal(hiResCover("not a url"), "not a url");
  assert.equal(hiResCover(""), "");
});
