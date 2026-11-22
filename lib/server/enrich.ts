// 批次補資料：替缺簡介或封面的書查詢資料，只填原本空白的欄位。
import type { Book, EnrichResult, LookupResult } from "../types.ts";
import { cleanCategories, normalizeISBN } from "./books.ts";
import { best, searchAll, type Provider } from "./lookup.ts";

export function needsEnrich(b: Pick<Book, "description" | "cover_url">): boolean {
  return !b.description.trim() || !b.cover_url.trim();
}

/** 只填原本空白的欄位，不覆蓋使用者手動輸入的內容。 */
export function enrichFields(b: Book, r: LookupResult): Partial<Book> {
  const f: Partial<Book> = {};
  if (!b.description.trim() && r.description) f.description = r.description;
  if (!b.cover_url.trim() && r.cover_url) f.cover_url = r.cover_url;
  if (!b.categories?.length && r.categories.length) f.categories = cleanCategories(r.categories);
  if (!b.isbn && r.isbn) {
    const isbn = normalizeISBN(r.isbn);
    if (isbn) f.isbn = isbn;
  }
  if (!b.author.trim() && r.authors.length) f.author = r.authors.join("、");
  return f;
}

/** 寫入欄位；回傳 {code: "23505"} 代表 ISBN 跟別本書重複，成功時回傳 null。 */
export type Updater = (id: string, fields: Partial<Book>) => Promise<{ code?: string } | null>;

async function enrichOne(b: Book, providers: Provider[], update: Updater): Promise<EnrichResult["results"][number]> {
  const out = { id: b.id, title: b.title };
  let match: LookupResult | null = null;
  if (b.isbn) {
    try {
      match = (await searchAll(providers, { isbn: b.isbn }))[0] ?? null;
    } catch {
      /* 改用書名查 */
    }
  }
  if (!match) {
    try {
      match = best(await searchAll(providers, { title: b.title, author: b.author }), b.title);
    } catch {
      return { ...out, status: "error" };
    }
  }
  if (!match) return { ...out, status: "not_found" };

  const fields = enrichFields(b, match);
  if (!Object.keys(fields).length) return { ...out, status: "not_found" };
  let err = await update(b.id, fields);
  // ISBN 跟書櫃裡別本書重複時，不填 ISBN 再試一次
  if (err?.code === "23505" && fields.isbn) {
    delete fields.isbn;
    err = Object.keys(fields).length ? await update(b.id, fields) : null;
  }
  if (err) return { ...out, status: "error" };
  return { ...out, status: "updated", source: match.source };
}

/**
 * 替缺資料的書查詢資料。過了 deadline（毫秒時間戳）就不再開始查新的書，
 * 讓呼叫端在函式逾時前把已完成的部分存起來；沒處理到的書計入 remaining。
 */
export async function enrichBooks(
  books: Book[],
  providers: Provider[],
  update: Updater,
  opts: { concurrency?: number; deadline?: number; now?: () => number } = {},
): Promise<EnrichResult> {
  const { concurrency = 4, deadline = Infinity, now = Date.now } = opts;
  const todo = books.filter(needsEnrich);
  const results: EnrichResult["results"] = [];
  let next = 0;
  const worker = async () => {
    while (next < todo.length && now() < deadline) {
      const b = todo[next++];
      results.push(await enrichOne(b, providers, update));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return {
    updated: results.filter((r) => r.status === "updated").length,
    remaining: todo.length - results.length,
    results,
  };
}
