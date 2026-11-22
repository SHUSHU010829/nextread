import type { Book } from "@/lib/types";
import { requireAuth } from "@/lib/server/auth";
import { enrichBooks } from "@/lib/server/enrich";
import { getStore } from "@/lib/server/get-store";
import { handle, json } from "@/lib/server/http";
import { defaultProviders } from "@/lib/server/lookup";
import { applyPatches } from "@/lib/server/repo";
import { mutate } from "@/lib/server/store";

export const maxDuration = 60;
// 留時間寫回檔案：查詢最多跑 40 秒（單次查詢上限 8 秒）
const LOOKUP_BUDGET_MS = 40_000;

export const POST = handle(async (req) => {
  requireAuth(req);
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? new Set(body.ids.filter((x): x is string => typeof x === "string")) : null;

  const store = getStore();
  const { books } = await store.read();
  const targets = ids?.size ? books.filter((b) => ids.has(b.id)) : books;

  // 查詢期間只在記憶體記下要改的欄位，最後一次寫回，避免多次寫入互相覆蓋
  const patches = new Map<string, Partial<Book>>();
  const taken = new Set(books.map((b) => b.isbn).filter(Boolean));
  const result = await enrichBooks(targets, defaultProviders(), async (id, fields) => {
    if (fields.isbn && taken.has(fields.isbn)) return { code: "23505" };
    if (fields.isbn) taken.add(fields.isbn);
    patches.set(id, fields);
    return null;
  }, { deadline: Date.now() + LOOKUP_BUDGET_MS });
  if (patches.size) await mutate(store, (current) => applyPatches(current, patches));
  return json(result);
});
