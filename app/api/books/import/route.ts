import { parseImport, planImport } from "@/lib/server/books";
import { authed, dbError, handle, HttpError, json } from "@/lib/server/http";

const MAX_BYTES = 4 << 20; // Vercel 函式 request body 上限約 4.5MB

export const POST = handle(async (req) => {
  const { db } = await authed(req);
  const text = await req.text();
  if (text.length > MAX_BYTES) throw new HttpError(413, "匯入檔案太大（上限 4MB）");
  const items = parseImport(text);

  const { data: existing, error: listErr } = await db.from("books").select("title, author");
  if (listErr) throw dbError(listErr);
  const plan = planImport(items, existing ?? []);

  let imported = 0;
  if (plan.rows.length) {
    // 有些列帶 created_at、有些沒有；defaultToNull: false 讓沒給的欄位用資料庫預設值
    const { data, error } = await db.from("books").insert(plan.rows, { defaultToNull: false }).select("id");
    if (error) throw dbError(error);
    imported = data?.length ?? 0;
  }
  return json({ imported, skipped: plan.skipped, errors: plan.errors });
});
