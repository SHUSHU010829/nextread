import path from "node:path";
import { BlobStore } from "./blob-store.ts";
import { HttpError } from "./errors.ts";
import { FileStore, type BookStore } from "./store.ts";

let store: BookStore | null = null;

/** 有 BLOB_READ_WRITE_TOKEN 就用 Vercel Blob；本機開發沒有設定時存在 .data/books.json。 */
export function getStore(): BookStore {
  if (store) return store;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    store = new BlobStore();
  } else if (process.env.VERCEL) {
    throw new HttpError(500, "尚未連接 Vercel Blob：請在 Vercel 專案的 Storage 建立 Blob store");
  } else {
    store = new FileStore(path.join(process.cwd(), ".data", "books.json"));
  }
  return store;
}
