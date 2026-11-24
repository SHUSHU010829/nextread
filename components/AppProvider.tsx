"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, errorMessage, UNAUTHORIZED_EVENT } from "@/lib/api";
import type { Book, BookInput } from "@/lib/types";
import BookDialog from "./BookDialog";
import ImportDialog from "./ImportDialog";
import Login from "./Login";
import Nav from "./Nav";

interface AppState {
  books: Book[] | null;
  loadError: string;
  reload: () => Promise<void>;
  /** 新增或更新一本書到本地清單（儲存成功後呼叫）。 */
  upsert: (b: Book) => void;
  openEditor: (book: Book | null, preset?: Partial<BookInput>) => void;
  openImport: () => void;
  logout: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be used inside AppProvider");
  return v;
}

type Editing = { book: Book | null; preset?: Partial<BookInput> } | null;

function Shell({ children, onLogout }: { children: React.ReactNode; onLogout: () => void }) {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [importing, setImporting] = useState(false);

  const reload = useCallback(async () => {
    try {
      setBooks(await api.listBooks());
      setLoadError("");
    } catch (e) {
      setLoadError("讀取失敗：" + errorMessage(e));
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const upsert = useCallback((b: Book) => {
    setBooks((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [b, ...list];
    });
  }, []);

  const value: AppState = {
    books,
    loadError,
    reload,
    upsert,
    openEditor: (book, preset) => setEditing({ book, preset }),
    openImport: () => setImporting(true),
    logout: () => api.logout().finally(onLogout),
  };

  return (
    <Ctx.Provider value={value}>
      <div className="app">
        <Nav />
        <main className="main">{children}</main>
      </div>
      {editing && (
        <BookDialog
          book={editing.book}
          preset={editing.preset}
          onClose={() => setEditing(null)}
          onSaved={(b) => {
            upsert(b);
            setEditing(null);
          }}
          onDeleted={(id) => {
            setBooks((prev) => (prev ?? []).filter((x) => x.id !== id));
            setEditing(null);
          }}
        />
      )}
      {importing && <ImportDialog onClose={() => setImporting(false)} onImported={reload} />}
    </Ctx.Provider>
  );
}

/** 處理登入狀態；登入後提供書櫃資料與共用的新增／編輯、匯入視窗。 */
export default function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "in" | "out">("loading");

  useEffect(() => {
    api
      .session()
      .then((s) => setState(s.authenticated ? "in" : "out"))
      .catch(() => setState("out"));
    const onUnauthorized = () => setState("out");
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  if (state === "loading") return <div className="state">載入中…</div>;
  if (state === "out") return <Login onLogin={() => setState("in")} />;
  return <Shell onLogout={() => setState("out")}>{children}</Shell>;
}
