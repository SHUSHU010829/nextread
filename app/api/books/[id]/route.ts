import { requireAuth } from "@/lib/server/auth";
import { toRow } from "@/lib/server/books";
import { getRepo } from "@/lib/server/get-repo";
import { handle, json, readJSON } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = handle(async (req, { params }: Ctx) => {
  requireAuth(req);
  const { id } = await params;
  const row = toRow(await readJSON(req));
  return json(await getRepo().update(id, row));
});

export const DELETE = handle(async (req, { params }: Ctx) => {
  requireAuth(req);
  const { id } = await params;
  await getRepo().delete(id);
  return new Response(null, { status: 204 });
});
