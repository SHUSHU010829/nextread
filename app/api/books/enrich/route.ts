import { requireAuth } from "@/lib/server/auth";
import type { Patch } from "@/lib/server/book-repo";
import { enrichBooks } from "@/lib/server/enrich";
import { getRepo } from "@/lib/server/get-repo";
import { handle, json } from "@/lib/server/http";
import { defaultProviders } from "@/lib/server/lookup";

export const maxDuration = 60;
// 留時間寫回資料庫：查詢最多跑 40 秒（單次查詢上限 8 秒）
const LOOKUP_BUDGET_MS = 40_000;

export const POST = handle(async (req) => {
  requireAuth(req);
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? new Set(body.ids.filter((x): x is string => typeof x === "string")) : null;

  const repo = getRepo();
  const books = await repo.list();
  const targets = ids?.size ? books.filter((b) => ids.has(b.id)) : books;

  // 查詢期間只在記憶體記下要改的欄位，最後一次寫回
  const patches = new Map<string, Patch>();
  const taken = new Set(books.map((b) => b.isbn).filter(Boolean));
  const result = await enrichBooks(targets, defaultProviders(), async (id, fields) => {
    if (fields.isbn && taken.has(fields.isbn)) return { code: "23505" };
    if (fields.isbn) taken.add(fields.isbn);
    patches.set(id, fields);
    return null;
  }, { deadline: Date.now() + LOOKUP_BUDGET_MS });
  if (patches.size) await repo.applyPatches(patches);
  return json(result);
});
