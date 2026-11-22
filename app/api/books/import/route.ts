import { requireAuth } from "@/lib/server/auth";
import { parseImport, planImport } from "@/lib/server/books";
import { getStore } from "@/lib/server/get-store";
import { handle, HttpError, json } from "@/lib/server/http";
import { importRows } from "@/lib/server/repo";
import { mutate } from "@/lib/server/store";

const MAX_BYTES = 4 << 20; // Vercel 函式 request body 上限約 4.5MB

export const POST = handle(async (req) => {
  requireAuth(req);
  const text = await req.text();
  if (text.length > MAX_BYTES) throw new HttpError(413, "匯入檔案太大（上限 4MB）");
  const items = parseImport(text);
  const result = await mutate(getStore(), (books) => {
    const plan = planImport(items, books);
    const { books: next, result: imported } = importRows(books, plan.rows);
    return { books: next, result: { imported, skipped: plan.skipped, errors: plan.errors } };
  });
  return json(result);
});
