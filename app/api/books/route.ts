import { requireAuth } from "@/lib/server/auth";
import { toRow } from "@/lib/server/books";
import { getRepo } from "@/lib/server/get-repo";
import { handle, json, readJSON } from "@/lib/server/http";

export const GET = handle(async (req) => {
  requireAuth(req);
  return json(await getRepo().list());
});

export const POST = handle(async (req) => {
  requireAuth(req);
  const row = toRow(await readJSON(req));
  return json(await getRepo().create(row), 201);
});
