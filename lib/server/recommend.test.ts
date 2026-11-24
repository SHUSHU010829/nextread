import { test } from "node:test";
import assert from "node:assert/strict";
import type { Book } from "../types.ts";
import { clampScore, dropOwned, MIN_RATED, ratedCount, recommendEnabled, shelfPrompt } from "./recommend.ts";

function book(p: Partial<Book>): Book {
  return {
    id: "x", title: "x", author: "", isbn: null, cover_url: "", description: "", categories: [],
    status: "read", rating: null, finished_at: null, note: "", created_at: "", updated_at: "", ...p,
  };
}

test("enabled only when more than MIN_RATED books are rated", () => {
  const rated = (n: number) => Array.from({ length: n }, (_, i) => book({ id: String(i), rating: (i % 3) - 1 as 1 | 0 | -1 }));
  const unrated = [book({ status: "want" }), book({ status: "want" })];
  assert.equal(ratedCount([...rated(MIN_RATED), ...unrated]), MIN_RATED);
  assert.equal(recommendEnabled([...rated(MIN_RATED), ...unrated]), false);
  assert.equal(recommendEnabled(rated(MIN_RATED + 1)), true);
});

test("shelfPrompt groups by rating with notes and categories", () => {
  const p = shelfPrompt([
    book({ title: "挪威的森林", author: "村上春樹", rating: 1, categories: ["小說"], note: "  很喜歡\n氣氛 " }),
    book({ title: "原子習慣", rating: -1, note: "x".repeat(400) }),
    book({ title: "人類大歷史", rating: 0 }),
    book({ title: "三體", status: "want" }),
  ]);
  assert.match(p, /【喜歡】\n- 《挪威的森林》 \/ 村上春樹 \/ 分類：小說\n  心得：很喜歡 氣氛/);
  assert.match(p, /【沒想法】.*\n- 《人類大歷史》/);
  assert.match(p, /【不喜歡】\n- 《原子習慣》\n  心得：x{300}…/);
  assert.match(p, /尚未評價的書】\n《三體》/);
});

test("dropOwned removes shelf books and duplicates", () => {
  const shelf = [book({ title: "三體", author: "劉慈欣" })];
  const items = [
    { title: "三體", author: "Liu Cixin" },
    { title: "球狀閃電", author: "劉慈欣" },
    { title: "球狀閃電", author: "劉慈欣" },
    { title: "流浪地球", author: "劉慈欣" },
  ];
  assert.deepEqual(dropOwned(items, shelf).map((i) => i.title), ["球狀閃電", "流浪地球"]);
});

test("clampScore", () => {
  assert.equal(clampScore(72.6), 73);
  assert.equal(clampScore(140), 100);
  assert.equal(clampScore(-5), 0);
  assert.equal(clampScore(NaN), 0);
});
