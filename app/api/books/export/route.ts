import { requireAuth } from "@/lib/server/auth";
import { getRepo } from "@/lib/server/get-repo";
import { handle } from "@/lib/server/http";

/** 下載整個書櫃；格式可以直接用「匯入」匯回來。 */
export const GET = handle(async (req) => {
  requireAuth(req);
  const books = await getRepo().list();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify({ exported_at: new Date().toISOString(), books }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="nextread-${date}.json"`,
    },
  });
});
