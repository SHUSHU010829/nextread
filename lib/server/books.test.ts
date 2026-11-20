import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeISBN, parseImport, planImport, toRow, ValidationError } from "./books.ts";

test("normalizeISBN", () => {
  const cases: Record<string, string> = {
    "978-986-479-290-1": "9789864792901",
    "986 479 290 x": "986479290X",
    "98647X2901": "",
    "12345": "",
    "978986479290X": "",
  };
  for (const [input, want] of Object.entries(cases)) assert.equal(normalizeISBN(input), want, input);
});

test("toRow normalizes input", () => {
  const row = toRow({
    title: "  被討厭的勇氣 ",
    author: "岸見一郎",
    isbn: "978-986-134-233-8",
    categories: ["心理學", " ", "心理學", "哲學"],
    status: "read",
    rating: 1,
    finished_at: "2026-10-01",
  });
  assert.equal(row.title, "被討厭的勇氣");
  assert.equal(row.isbn, "9789861342338");
  assert.deepEqual(row.categories, ["心理學", "哲學"]);

  const d = toRow({ title: "x" });
  assert.equal(d.status, "want");
  assert.equal(d.isbn, null);
  assert.equal(d.rating, null);
  assert.equal(d.finished_at, null);
});

test("toRow rejects invalid input", () => {
  for (const bad of [
    { title: "  " },
    { title: "x", status: "done" },
    { title: "x", rating: 2 },
    { title: "x", isbn: "abc" },
    { title: "x", finished_at: "2026/10/01" },
    { title: "x", finished_at: "2026-13-01" },
    null,
  ]) {
    assert.throws(() => toRow(bad), ValidationError, JSON.stringify(bad));
  }
});

test("import artifact-shaped data", () => {
  const items = parseImport(`[
    {"id":"a1","title":"挪威的森林","author":"村上春樹","status":"read","rating":1,"finishedAt":"2026-09-01","note":"很喜歡","createdAt":"2026-09-02T10:00:00.000Z"},
    {"id":"a2","title":"人類大歷史","author":"哈拉瑞","status":"want","rating":null,"finishedAt":"","note":""},
    {"id":"a3","title":"挪威的森林","author":"村上 春樹","status":"read","rating":0},
    {"id":"a4","title":"","rating":1},
    {"id":"a5","title":"三體","author":"劉慈欣","status":"read","rating":5}
  ]`);
  const plan = planImport(items, [{ title: "人類大歷史", author: "哈拉瑞" }]);
  assert.equal(plan.rows.length, 1);
  const r = plan.rows[0];
  assert.equal(r.title, "挪威的森林");
  assert.equal(r.rating, 1);
  assert.equal(r.finished_at, "2026-09-01");
  assert.equal(r.note, "很喜歡");
  assert.equal(r.created_at, "2026-09-02T10:00:00.000Z");
  assert.equal(plan.skipped.length, 2);
  assert.deepEqual(plan.errors.map((e) => e.index), [3, 4]);
});

test("import wrapped snake_case data", () => {
  const [item] = parseImport(`{"books":[{"title":"x","finished_at":"2026-01-02","rating":"-1"}]}`);
  const plan = planImport([item], []);
  assert.equal(plan.rows[0].rating, -1);
  assert.equal(plan.rows[0].finished_at, "2026-01-02");
  assert.equal(plan.rows[0].status, "read");
  assert.throws(() => parseImport(`{"foo":1}`), ValidationError);
  assert.throws(() => parseImport("  "), ValidationError);
  assert.throws(() => parseImport("not json"), ValidationError);
});
