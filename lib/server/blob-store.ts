// Vercel Blob：書櫃存成一個私有的 JSON 檔，用 etag 做條件式寫入。
import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import type { Book } from "../types.ts";
import { decodeShelf, encodeShelf, StoreConflictError, type BookStore, type Snapshot } from "./store.ts";

export class BlobStore implements BookStore {
  private pathname: string;
  constructor(pathname = "nextread/books.json") {
    this.pathname = pathname;
  }

  async read(): Promise<Snapshot> {
    // useCache: false 直接讀來源，確保拿到最新版本
    const res = await get(this.pathname, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) return { books: [], etag: null };
    const text = await new Response(res.stream).text();
    return { books: decodeShelf(text), etag: res.blob.etag };
  }

  async write(books: Book[], etag: string | null): Promise<void> {
    try {
      await put(this.pathname, encodeShelf(books), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        // 第一次建立時不允許覆蓋；之後只在 etag 相同時才寫入
        ...(etag ? { ifMatch: etag } : { allowOverwrite: false }),
      });
    } catch (e) {
      if (e instanceof BlobPreconditionFailedError) throw new StoreConflictError();
      if (!etag && e instanceof Error && /already exists/i.test(e.message)) throw new StoreConflictError();
      throw e;
    }
  }
}
