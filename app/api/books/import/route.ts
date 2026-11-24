import { requireAuth } from "@/lib/server/auth";
import { parseImport, planImport } from "@/lib/server/books";
import { getRepo } from "@/lib/server/get-repo";
import { handle, HttpError, json } from "@/lib/server/http";

const MAX_BYTES = 4 << 20; // Vercel 函式 request body 上限約 4.5MB

export const POST = handle(async (req) => {
  requireAuth(req);
  const text = await req.text();
  if (text.length > MAX_BYTES) throw new HttpError(413, "匯入檔案太大（上限 4MB）");
  const items = parseImport(text);
  const repo = getRepo();
  const plan = planImport(items, await repo.list());
  const imported = await repo.importRows(plan.rows);
  return json({ imported, skipped: plan.skipped, errors: plan.errors });
});
