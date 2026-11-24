// Postgres 版的書櫃（Neon）。每本書一列；ISBN 唯一性交給資料庫的 UNIQUE 約束。
import type { Book, Status } from "../types.ts";
import type { BookRow } from "./books.ts";
import type { BookRepo, Patch } from "./book-repo.ts";
import { duplicateIsbn, notFound } from "./errors.ts";

/** 執行 SQL 的最小介面：正式環境接 Neon，測試接 PGlite。 */
export interface Sql {
  query(text: string, params?: unknown[]): Promise<Record<string, unknown>[]>;
  /** 在同一個交易裡依序執行，任何一句失敗就全部撤銷。 */
  transaction(statements: { text: string; params: unknown[] }[]): Promise<void>;
}

export const SCHEMA = `CREATE TABLE IF NOT EXISTS books (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL CHECK (length(btrim(title)) > 0),
  author      text NOT NULL DEFAULT '',
  isbn        text UNIQUE,
  cover_url   text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  categories  text[] NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'want' CHECK (status IN ('want', 'reading', 'read')),
  rating      smallint CHECK (rating IN (-1, 0, 1)),
  finished_at date,
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
)`;

// 日期以文字取出，避免時區轉換把日期變成前一天
const COLUMNS = `id::text AS id, title, author, isbn, cover_url, description, categories, status, rating,
  finished_at::text AS finished_at, created_at, updated_at`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function iso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
}

function toBook(r: Record<string, unknown>): Book {
  return {
    id: String(r.id),
    title: String(r.title),
    author: String(r.author ?? ""),
    isbn: (r.isbn as string | null) ?? null,
    cover_url: String(r.cover_url ?? ""),
    description: String(r.description ?? ""),
    categories: (r.categories as string[] | null) ?? [],
    status: r.status as Status,
    rating: r.rating === null || r.rating === undefined ? null : (Number(r.rating) as Book["rating"]),
    finished_at: (r.finished_at as string | null) ?? null,
    note: String(r.note ?? ""),
    created_at: iso(r.created_at),
    updated_at: iso(r.updated_at),
  };
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "23505";

const insertSql = `INSERT INTO books (title, author, isbn, cover_url, description, categories, status, rating, finished_at, note, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11::timestamptz, now()))`;

function insertParams(r: BookRow): unknown[] {
  return [r.title, r.author, r.isbn, r.cover_url, r.description, r.categories, r.status, r.rating, r.finished_at, r.note, r.created_at ?? null];
}

export class PgRepo implements BookRepo {
  private sql: Sql;
  private ready: Promise<void> | null = null;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  /** 第一次使用時建立資料表（之後是 no-op）。失敗時下次再試。 */
  private ensureSchema(): Promise<void> {
    this.ready ??= this.sql.query(SCHEMA).then(
      () => undefined,
      (e) => {
        this.ready = null;
        throw e;
      },
    );
    return this.ready;
  }

  async list(): Promise<Book[]> {
    await this.ensureSchema();
    const rows = await this.sql.query(`SELECT ${COLUMNS}, note FROM books ORDER BY created_at`);
    return rows.map(toBook);
  }

  async create(row: BookRow): Promise<Book> {
    await this.ensureSchema();
    try {
      const [r] = await this.sql.query(`${insertSql} RETURNING ${COLUMNS}, note`, insertParams(row));
      return toBook(r);
    } catch (e) {
      if (isUniqueViolation(e)) throw duplicateIsbn();
      throw e;
    }
  }

  async update(id: string, row: BookRow): Promise<Book> {
    if (!UUID_RE.test(id)) throw notFound();
    await this.ensureSchema();
    try {
      const rows = await this.sql.query(
        `UPDATE books SET title = $1, author = $2, isbn = $3, cover_url = $4, description = $5, categories = $6,
           status = $7, rating = $8, finished_at = $9, note = $10, updated_at = now()
         WHERE id = $11 RETURNING ${COLUMNS}, note`,
        [row.title, row.author, row.isbn, row.cover_url, row.description, row.categories, row.status, row.rating, row.finished_at, row.note, id],
      );
      if (!rows.length) throw notFound();
      return toBook(rows[0]);
    } catch (e) {
      if (isUniqueViolation(e)) throw duplicateIsbn();
      throw e;
    }
  }

  async delete(id: string): Promise<void> {
    if (!UUID_RE.test(id)) throw notFound();
    await this.ensureSchema();
    const rows = await this.sql.query(`DELETE FROM books WHERE id = $1 RETURNING id`, [id]);
    if (!rows.length) throw notFound();
  }

  async importRows(rows: BookRow[]): Promise<number> {
    if (!rows.length) return 0;
    await this.ensureSchema();
    const existing = await this.sql.query(`SELECT isbn FROM books WHERE isbn IS NOT NULL`);
    const isbns = new Set(existing.map((r) => r.isbn as string));
    const statements = rows.map((row) => {
      const r = row.isbn && isbns.has(row.isbn) ? { ...row, isbn: null } : row;
      if (r.isbn) isbns.add(r.isbn);
      return { text: insertSql, params: insertParams(r) };
    });
    await this.sql.transaction(statements);
    return statements.length;
  }

  async applyPatches(patches: Map<string, Patch>): Promise<void> {
    await this.ensureSchema();
    const allowed = ["description", "cover_url", "categories", "isbn", "author"] as const;
    for (const [id, patch] of patches) {
      if (!UUID_RE.test(id)) continue;
      const write = async (fields: Patch) => {
        const keys = allowed.filter((k) => fields[k] !== undefined);
        if (!keys.length) return;
        const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
        await this.sql.query(`UPDATE books SET ${sets}, updated_at = now() WHERE id = $${keys.length + 1}`, [
          ...keys.map((k) => fields[k]),
          id,
        ]);
      };
      try {
        await write(patch);
      } catch (e) {
        // ISBN 已被別本書使用：不填 ISBN 再寫一次
        if (!isUniqueViolation(e) || !patch.isbn) throw e;
        const { isbn: _skip, ...rest } = patch;
        await write(rest);
      }
    }
  }
}
