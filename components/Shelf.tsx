"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, errorMessage, EXPORT_URL } from "@/lib/api";
import { applyFilter, DEFAULT_FILTER, shelfStats, type RatingFilter, type ShelfFilter, type SortKey, type StatusFilter } from "@/lib/shelf";
import { RATING_LABEL, STATUS_LABEL, type Book } from "@/lib/types";
import Seg from "./Seg";
import BookDialog from "./BookDialog";
import ImportDialog from "./ImportDialog";

const STATUS_OPTS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "read", label: "讀完" },
  { value: "reading", label: "在讀" },
  { value: "want", label: "想讀" },
];
const RATING_OPTS: { value: RatingFilter; label: string }[] = [
  { value: "all", label: "所有評價" },
  { value: "1", label: "喜歡" },
  { value: "0", label: "沒想法" },
  { value: "-1", label: "不喜歡" },
  { value: "none", label: "未評價" },
];
const SORT_OPTS: { value: SortKey; label: string }[] = [
  { value: "finished", label: "讀完日期" },
  { value: "created", label: "新增時間" },
  { value: "title", label: "書名" },
];

type Editing = { book: Book | null } | null;

export default function Shelf({ onLogout }: { onLogout: () => void }) {
  const [books, setBooks] = useState<Book[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState<ShelfFilter>(DEFAULT_FILTER);
  const [editing, setEditing] = useState<Editing>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [enriching, setEnriching] = useState(false);

  const load = useCallback(async () => {
    try {
      setBooks(await api.listBooks());
      setLoadError("");
    } catch (e) {
      setLoadError("讀取失敗：" + errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => (books ? applyFilter(books, filter) : []), [books, filter]);
  const stats = useMemo(() => shelfStats(books ?? []), [books]);

  function onSaved(b: Book) {
    setBooks((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === b.id) ? list.map((x) => (x.id === b.id ? b : x)) : [b, ...list];
    });
    setEditing(null);
  }

  function onDeleted(id: string) {
    setBooks((prev) => (prev ?? []).filter((x) => x.id !== id));
    setEditing(null);
  }

  async function enrichAll() {
    if (enriching) return;
    setEnriching(true);
    setNotice(`正在替 ${stats.missingInfo} 本書查詢資料…`);
    try {
      const r = await api.enrich();
      const notFound = r.results.filter((x) => x.status !== "updated").map((x) => `《${x.title}》`);
      setNotice(
        `補上了 ${r.updated} 本書的資料。` +
          (notFound.length ? `查不到：${notFound.slice(0, 8).join("")}${notFound.length > 8 ? ` 等 ${notFound.length} 本` : ""}，可以打開書手動貼簡介。` : "") +
          (r.remaining ? `還有 ${r.remaining} 本這次沒處理到，再按一次「補資料」繼續。` : ""),
      );
      await load();
    } catch (e) {
      setNotice("補資料失敗：" + errorMessage(e));
    } finally {
      setEnriching(false);
    }
  }

  const set = <K extends keyof ShelfFilter>(k: K) => (v: ShelfFilter[K]) => setFilter((f) => ({ ...f, [k]: v }));

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>書櫃</h1>
          <div className="stats">
            {books ? `共 ${stats.total} 本 · 讀完 ${stats.read} · 喜歡 ${stats.liked} · 已評價 ${stats.rated}` : " "}
          </div>
        </div>
        <div className="actions">
          {stats.missingInfo > 0 && (
            <button className="btn" onClick={enrichAll} disabled={enriching} title="替缺少簡介或封面的書查詢資料">
              {enriching ? "補資料中…" : `補資料（${stats.missingInfo}）`}
            </button>
          )}
          <button className="btn" onClick={() => setImporting(true)}>
            匯入
          </button>
          <button className="btn primary" onClick={() => setEditing({ book: null })}>
            新增書籍
          </button>
        </div>
      </header>

      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          {!enriching && (
            <button className="link" onClick={() => setNotice("")}>
              關閉
            </button>
          )}
        </div>
      )}

      <div className="toolbar">
        <input
          className="search"
          placeholder="搜尋書名或作者"
          value={filter.q}
          onChange={(e) => set("q")(e.target.value)}
          aria-label="搜尋書名或作者"
        />
        <Seg label="狀態" options={STATUS_OPTS} value={filter.status} onChange={set("status")} />
      </div>
      <div className="toolbar">
        <Seg label="評價" options={RATING_OPTS} value={filter.rating} onChange={set("rating")} />
        <Seg label="排序" options={SORT_OPTS} value={filter.sort} onChange={set("sort")} />
      </div>

      <div className="list">
        {loadError ? (
          <div className="state">
            {loadError}{" "}
            <button className="link" onClick={load}>
              重試
            </button>
          </div>
        ) : !books ? (
          <div className="state">載入中…</div>
        ) : !books.length ? (
          <div className="empty">書櫃還是空的，按「新增書籍」開始記錄，或「匯入」artifact 書櫃的資料。</div>
        ) : !visible.length ? (
          <div className="empty">沒有符合條件的書。</div>
        ) : (
          visible.map((b) => (
            <button key={b.id} className="row" onClick={() => setEditing({ book: b })}>
              {b.cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="cover" src={b.cover_url} alt="" loading="lazy" referrerPolicy="no-referrer" />
              ) : (
                <span className="cover ph" aria-hidden>
                  {b.title.slice(0, 1)}
                </span>
              )}
              <span className="main">
                <span className="t" style={{ display: "block" }}>
                  {b.title}
                </span>
                {b.author && (
                  <span className="a" style={{ display: "block" }}>
                    {b.author}
                  </span>
                )}
              </span>
              {b.finished_at && <span className="tag date">{b.finished_at}</span>}
              <span className="tag">{STATUS_LABEL[b.status]}</span>
              {b.rating !== null && <span className={`pill r${b.rating}`}>{RATING_LABEL[String(b.rating) as "1" | "0" | "-1"]}</span>}
            </button>
          ))
        )}
      </div>

      <p className="stats" style={{ marginTop: 24, textAlign: "center" }}>
        {books && books.length > 0 && (
          <>
            <a className="link" href={EXPORT_URL} download>
              匯出 JSON 備份
            </a>
            {" · "}
          </>
        )}
        <button className="link" onClick={() => api.logout().finally(onLogout)}>
          登出
        </button>
      </p>

      {editing && (
        <BookDialog book={editing.book} onClose={() => setEditing(null)} onSaved={onSaved} onDeleted={onDeleted} />
      )}
      {importing && (
        <ImportDialog
          onClose={() => setImporting(false)}
          onImported={() => {
            load();
          }}
        />
      )}
    </div>
  );
}
