// 書櫃儲存：整個書櫃是一個 JSON 檔。
// 寫入時帶上讀取當時的 etag，檔案在這之間被別的裝置改過就會衝突，mutate() 會重讀再套用一次。
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Book } from "../types.ts";
import { HttpError } from "./errors.ts";

export interface Snapshot {
  books: Book[];
  /** null 代表檔案還不存在。 */
  etag: string | null;
}

export interface BookStore {
  read(): Promise<Snapshot>;
  /** etag 跟目前檔案不同時丟出 StoreConflictError。 */
  write(books: Book[], etag: string | null): Promise<void>;
}

export class StoreConflictError extends Error {
  constructor() {
    super("書櫃在其他地方被修改了");
  }
}

interface ShelfFile {
  version: 1;
  books: Book[];
}

export function encodeShelf(books: Book[]): string {
  const file: ShelfFile = { version: 1, books };
  return JSON.stringify(file);
}

export function decodeShelf(text: string): Book[] {
  const data = JSON.parse(text) as Partial<ShelfFile>;
  if (!Array.isArray(data.books)) throw new Error("書櫃檔案格式錯誤");
  return data.books;
}

/**
 * 讀取書櫃、套用修改、寫回去。寫入衝突時重試，最多三次。
 * fn 可能被呼叫多次，必須是純函式（只根據傳入的 books 計算結果）。
 */
export async function mutate<T>(store: BookStore, fn: (books: Book[]) => { books: Book[]; result: T }): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const snap = await store.read();
    const { books, result } = fn(snap.books);
    try {
      await store.write(books, snap.etag);
      return result;
    } catch (e) {
      if (e instanceof StoreConflictError && attempt < 2) continue;
      if (e instanceof StoreConflictError) throw new HttpError(409, "書櫃正在其他地方更新，請重新整理後再試");
      throw e;
    }
  }
}

/** 測試用。 */
export class MemoryStore implements BookStore {
  private books: Book[] = [];
  private version = 0;

  constructor(books: Book[] = []) {
    if (books.length) {
      this.books = structuredClone(books);
      this.version = 1;
    }
  }

  async read(): Promise<Snapshot> {
    return { books: structuredClone(this.books), etag: this.version ? String(this.version) : null };
  }

  async write(books: Book[], etag: string | null): Promise<void> {
    const current = this.version ? String(this.version) : null;
    if (etag !== current) throw new StoreConflictError();
    this.books = structuredClone(books);
    this.version++;
  }
}

/** 本機開發用：存在專案的 .data/books.json。 */
export class FileStore implements BookStore {
  private file: string;
  constructor(file: string) {
    this.file = file;
  }

  private static etagOf(text: string): string {
    return createHash("sha256").update(text).digest("hex");
  }

  private async readText(): Promise<string | null> {
    try {
      return await readFile(this.file, "utf8");
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }

  async read(): Promise<Snapshot> {
    const text = await this.readText();
    if (text === null) return { books: [], etag: null };
    return { books: decodeShelf(text), etag: FileStore.etagOf(text) };
  }

  async write(books: Book[], etag: string | null): Promise<void> {
    const text = await this.readText();
    const current = text === null ? null : FileStore.etagOf(text);
    if (current !== etag) throw new StoreConflictError();
    await mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, encodeShelf(books));
    await rename(tmp, this.file);
  }
}
