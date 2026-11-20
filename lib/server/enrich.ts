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

/** update 回傳 Supabase 的錯誤碼（23505 代表 ISBN 重複），成功時回傳 null。 */
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

export async function enrichBooks(
  books: Book[],
  providers: Provider[],
  update: Updater,
  concurrency = 4,
): Promise<EnrichResult> {
  const todo = books.filter(needsEnrich);
  const results: EnrichResult["results"] = new Array(todo.length);
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const i = next++;
      results[i] = await enrichOne(todo[i], providers, update);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, worker));
  return { updated: results.filter((r) => r.status === "updated").length, results };
}
