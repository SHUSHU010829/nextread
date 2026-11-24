// 書櫃資料存取介面。正式環境用 Postgres（Neon，pg-repo.ts），本機開發與測試用 JSON 檔（這裡的 JsonRepo）。
import type { Book } from "../types.ts";
import type { BookRow } from "./books.ts";
import { applyPatches, createBook, deleteBook, importRows, updateBook } from "./repo.ts";
import { mutate, type BookStore } from "./store.ts";

/** 補資料時要寫入的欄位；ISBN 跟別本書重複時略過 ISBN。 */
export type Patch = Partial<Pick<Book, "description" | "cover_url" | "categories" | "isbn" | "author">>;

export interface BookRepo {
  list(): Promise<Book[]>;
  /** ISBN 重複時丟出 409。 */
  create(row: BookRow): Promise<Book>;
  /** 找不到時 404、ISBN 重複時 409。 */
  update(id: string, row: BookRow): Promise<Book>;
  /** 找不到時 404。 */
  delete(id: string): Promise<void>;
  /** 匯入多本書；ISBN 跟現有書重複的會清掉 ISBN 再匯入。回傳匯入數量。 */
  importRows(rows: BookRow[]): Promise<number>;
  applyPatches(patches: Map<string, Patch>): Promise<void>;
}

/** 整個書櫃存成一個 JSON 檔（本機開發）；寫入衝突時由 mutate() 重試。 */
export class JsonRepo implements BookRepo {
  private store: BookStore;
  constructor(store: BookStore) {
    this.store = store;
  }

  async list() {
    return (await this.store.read()).books;
  }
  create(row: BookRow) {
    return mutate(this.store, (books) => createBook(books, row));
  }
  update(id: string, row: BookRow) {
    return mutate(this.store, (books) => updateBook(books, id, row));
  }
  delete(id: string) {
    return mutate(this.store, (books) => deleteBook(books, id));
  }
  importRows(rows: BookRow[]) {
    return mutate(this.store, (books) => importRows(books, rows));
  }
  applyPatches(patches: Map<string, Patch>) {
    return mutate(this.store, (books) => applyPatches(books, patches));
  }
}
