import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { JsonRepo, type BookRepo } from "./book-repo.ts";
import { HttpError } from "./errors.ts";
import { PgRepo, type Sql } from "./pg-repo.ts";
import { FileStore } from "./store.ts";

let repo: BookRepo | null = null;

/** 用 Neon 的 HTTP driver 執行 SQL（適合 Vercel 這類無伺服器環境）。 */
export function neonSql(url: string): Sql {
  const sql = neon(url);
  return {
    query: (text, params = []) => sql.query(text, params) as Promise<Record<string, unknown>[]>,
    transaction: async (statements) => {
      await sql.transaction(statements.map((s) => sql.query(s.text, s.params)));
    },
  };
}

/** 有 DATABASE_URL 就用 Neon；本機開發沒有設定時存在 .data/books.json。 */
export function getRepo(): BookRepo {
  if (repo) return repo;
  const url = process.env.DATABASE_URL;
  if (url) {
    repo = new PgRepo(neonSql(url));
  } else if (process.env.VERCEL) {
    throw new HttpError(500, "尚未設定資料庫：請在 Vercel 的 Environment Variables 加入 Neon 的 DATABASE_URL 後重新部署");
  } else {
    repo = new JsonRepo(new FileStore(path.join(process.cwd(), ".data", "books.json")));
  }
  return repo;
}
