import path from "node:path";
import { BlobStore, type BlobAuth } from "./blob-store.ts";
import { HttpError } from "./errors.ts";
import { FileStore, type BookStore } from "./store.ts";

let store: BookStore | null = null;

/**
 * 找出 Vercel Blob 的連線設定。連接 Blob store 時，Vercel 可能加入
 * BLOB_READ_WRITE_TOKEN，或是 BLOB_STORE_ID（搭配 Vercel 內建的 OIDC 驗證）；
 * 連接時若改了 Environment Variables Prefix，名稱會變成 <PREFIX>_READ_WRITE_TOKEN / <PREFIX>_STORE_ID。
 */
export function findBlobAuth(env: Record<string, string | undefined> = process.env): BlobAuth | null {
  // 自訂前綴的變數要符合 Blob 的值格式，避免誤用其他服務的同名變數
  const pick = (suffix: string, valuePrefix: string) => {
    if (env[`BLOB${suffix}`]) return env[`BLOB${suffix}`];
    const key = Object.keys(env).find((k) => k.endsWith(suffix) && env[k]?.startsWith(valuePrefix));
    return key ? env[key] : undefined;
  };
  const token = pick("_READ_WRITE_TOKEN", "vercel_blob_rw_");
  if (token) return { token };
  const storeId = pick("_STORE_ID", "store_");
  if (storeId) return { storeId };
  return null;
}

/** 有 Vercel Blob 設定就用 Blob；本機開發沒有設定時存在 .data/books.json。 */
export function getStore(): BookStore {
  if (store) return store;
  const auth = findBlobAuth();
  if (auth) {
    store = new BlobStore(auth);
  } else if (process.env.VERCEL) {
    throw new HttpError(
      500,
      "尚未連接 Vercel Blob：請在 Vercel 專案的 Storage 建立 Blob store，連接到這個專案後重新部署",
    );
  } else {
    store = new FileStore(path.join(process.cwd(), ".data", "books.json"));
  }
  return store;
}
