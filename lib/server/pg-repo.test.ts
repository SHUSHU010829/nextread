// 用 PGlite（在 Node 裡執行的真 Postgres）測試 PgRepo 的 SQL。
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { toRow } from "./books.ts";
import { HttpError } from "./errors.ts";
import { PgRepo, type Sql } from "./pg-repo.ts";

function pgliteSql(db: PGlite): Sql {
  return {
    query: async (text, params = []) => (await db.query<Record<string, unknown>>(text, params)).rows,
    transaction: async (statements) => {
      await db.transaction(async (tx) => {
        for (const s of statements) await tx.query(s.text, s.params);
      });
    },
  };
}

const status = (code: number) => (e: unknown) => e instanceof HttpError && e.status === code;

test("PgRepo against real Postgres", async () => {
  const db = new PGlite();
  const repo = new PgRepo(pgliteSql(db));
  try {
    assert.deepEqual(await repo.list(), []); // 自動建表

    const a = await repo.create(toRow({
      title: "挪威的森林", author: "村上春樹", isbn: "978-957-13-3082-5", status: "read", rating: 1,
      finished_at: "2026-09-01", categories: ["小說", "日本"], note: "很喜歡",
    }));
    assert.match(a.id, /^[0-9a-f-]{36}$/);
    assert.equal(a.finished_at, "2026-09-01"); // 日期不受時區影響
    assert.deepEqual(a.categories, ["小說", "日本"]);
    assert.equal(a.rating, 1);
    assert.match(a.created_at, /^\d{4}-\d{2}-\d{2}T.*Z$/);

    await assert.rejects(repo.create(toRow({ title: "別本", isbn: "9789571330825" })), status(409));

    const u = await repo.update(a.id, toRow({ title: "挪威的森林", status: "read", rating: null, note: "重讀" }));
    assert.equal(u.rating, null);
    assert.equal(u.isbn, null);
    assert.equal(u.note, "重讀");
    assert.equal(u.created_at, a.created_at);
    await assert.rejects(repo.update("not-a-uuid", toRow({ title: "x" })), status(404));
    await assert.rejects(repo.update("00000000-0000-0000-0000-000000000000", toRow({ title: "x" })), status(404));

    // 匯入：保留 created_at；ISBN 跟現有書重複的清掉 ISBN
    const b = await repo.create(toRow({ title: "三體", isbn: "9789573327059" }));
    const n = await repo.importRows([
      { ...toRow({ title: "三體 平裝版", isbn: "9789573327059" }) },
      { ...toRow({ title: "人類大歷史", status: "read", rating: 0 }), created_at: "2026-07-01T08:00:00.000Z" },
    ]);
    assert.equal(n, 2);
    const list = await repo.list();
    assert.equal(list.length, 4);
    assert.equal(list.find((x) => x.title === "三體 平裝版")?.isbn, null);
    assert.equal(list.find((x) => x.title === "人類大歷史")?.created_at, "2026-07-01T08:00:00.000Z");

    // 補資料：ISBN 已被使用時只略過 ISBN
    await repo.applyPatches(new Map([
      [a.id, { description: "簡介", cover_url: "https://c", categories: ["Fiction"], isbn: "9789573327059" }],
    ]));
    const patched = (await repo.list()).find((x) => x.id === a.id)!;
    assert.equal(patched.description, "簡介");
    assert.deepEqual(patched.categories, ["Fiction"]);
    assert.equal(patched.isbn, null);

    await repo.delete(b.id);
    await assert.rejects(repo.delete(b.id), status(404));
    assert.equal((await repo.list()).length, 3);
  } finally {
    await db.close();
  }
});

test("importRows is all-or-nothing", async () => {
  const db = new PGlite();
  const repo = new PgRepo(pgliteSql(db));
  try {
    await repo.list();
    // 第二列違反 CHECK（標題空白）：整批撤銷
    const bad = { ...toRow({ title: "x" }), title: " " };
    await assert.rejects(repo.importRows([toRow({ title: "好書" }), bad]));
    assert.equal((await repo.list()).length, 0);
  } finally {
    await db.close();
  }
});
