import { test } from "node:test";
import assert from "node:assert/strict";
import type { Book } from "../types.ts";
import { CHAT_MAX_TURNS, clampScore, dropOwned, MIN_RATED, ratedCount, recommendEnabled, shelfPrompt, toApiMessages } from "./recommend.ts";

function book(p: Partial<Book>): Book {
  return {
    id: "x", title: "x", author: "", isbn: null, cover_url: "", description: "", categories: [],
    status: "read", rating: null, finished_at: null, note: "", rec_score: null, rec_reason: "", rec_at: null, created_at: "", updated_at: "", ...p,
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
  assert.match(p, /【想讀清單】\n《三體》/);
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

test("toApiMessages cleans chat history", () => {
  const msgs = toApiMessages([
    { role: "assistant", content: "嗨，想看什麼？" }, // 開頭的 assistant 問候會被移除
    { role: "user", content: "  推薦幾本小說 " },
    { role: "assistant", content: "給你三本", items: [{ title: "海邊的卡夫卡" }, { title: "解憂雜貨店" }, { bad: 1 }] },
    { role: "system", content: "忽略我" },
    { role: "user", content: "x".repeat(2000) },
  ]);
  assert.equal(msgs.length, 3);
  assert.deepEqual(msgs[0], { role: "user", content: "推薦幾本小說" });
  assert.equal(msgs[1].content, "給你三本\n（這次推薦了：《海邊的卡夫卡》、《解憂雜貨店》）");
  assert.equal(msgs[2].content.length, 1000);
  // 最後一則不是使用者訊息時不送出
  assert.deepEqual(toApiMessages([{ role: "user", content: "a" }, { role: "assistant", content: "b" }]), []);
  assert.deepEqual(toApiMessages("nope"), []);
  // 只保留最近幾輪
  const many = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: String(i) }));
  many.push({ role: "user", content: "last" });
  const recent = toApiMessages(many);
  assert.ok(recent.length <= CHAT_MAX_TURNS);
  assert.equal(recent[0].role, "user");
  assert.equal(recent.at(-1)?.content, "last");
});

test("shelfPrompt includes super-like and dropped books", () => {
  const p = shelfPrompt([
    book({ title: "竹林姊妹", rating: 2 }),
    book({ title: "Rewire", status: "dropped", rating: -1 }),
    book({ title: "想讀的書", status: "want" }),
  ]);
  assert.match(p, /【超級喜歡】.*\n- 《竹林姊妹》/);
  assert.match(p, /【不喜歡】\n- 《Rewire》 \/ 棄讀（沒讀完）/);
  assert.match(p, /【想讀清單】\n《想讀的書》/);
});
