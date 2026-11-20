"use client";

import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { applyLookup, bookToInput, emptyInput, parseCategories, today } from "@/lib/shelf";
import type { Book, BookInput, LookupResult, Rating, Status } from "@/lib/types";
import Seg from "./Seg";

const STATUS_OPTS: { value: Status; label: string }[] = [
  { value: "read", label: "讀完" },
  { value: "reading", label: "在讀" },
  { value: "want", label: "想讀" },
];
type RatingValue = "1" | "0" | "-1" | "";
const RATING_OPTS: { value: RatingValue; label: string }[] = [
  { value: "1", label: "喜歡" },
  { value: "0", label: "沒想法" },
  { value: "-1", label: "不喜歡" },
  { value: "", label: "未評價" },
];

const toRating = (v: RatingValue): Rating => (v === "" ? null : (Number(v) as Rating));
const fromRating = (r: Rating): RatingValue => (r === null ? "" : (String(r) as RatingValue));

export default function BookDialog({
  book,
  onClose,
  onSaved,
  onDeleted,
}: {
  book: Book | null;
  onClose: () => void;
  onSaved: (b: Book) => void;
  onDeleted: (id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<BookInput>(() => (book ? bookToInput(book) : emptyInput({ finished_at: today() })));
  const [categoriesText, setCategoriesText] = useState(() => (book?.categories ?? []).join("、"));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LookupResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [lookupMsg, setLookupMsg] = useState("");

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const set = <K extends keyof BookInput>(k: K, v: BookInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  function setStatus(s: Status) {
    setForm((f) => ({
      ...f,
      status: s,
      // 改成「讀完」時自動填今天，改成「想讀」時清掉日期
      finished_at: s === "read" ? f.finished_at || today() : s === "want" ? "" : f.finished_at,
    }));
  }

  async function search() {
    const q = query.trim() || form.title.trim();
    if (!q || searching) return;
    if (!query.trim()) setQuery(q);
    setSearching(true);
    setLookupMsg("");
    try {
      const r = await api.lookup(q);
      setResults(r);
      if (!r.length) setLookupMsg("查不到這本書，可以在下方手動填寫簡介。");
    } catch (e) {
      setResults(null);
      setLookupMsg(errorMessage(e));
    } finally {
      setSearching(false);
    }
  }

  function pick(r: LookupResult) {
    const next = applyLookup(form, r);
    setForm(next);
    setCategoriesText(next.categories.join("、"));
    setResults(null);
    setLookupMsg(r.description ? "" : "這筆資料沒有簡介，可以在下方手動貼上。");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || saving) return;
    setSaving(true);
    setError("");
    const input = { ...form, categories: parseCategories(categoriesText) };
    try {
      const saved = book ? await api.updateBook(book.id, input) : await api.createBook(input);
      onSaved(saved);
    } catch (err) {
      setError("儲存失敗：" + errorMessage(err));
      setSaving(false);
    }
  }

  async function remove() {
    if (!book) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    try {
      await api.deleteBook(book.id);
      onDeleted(book.id);
    } catch (err) {
      setError("刪除失敗：" + errorMessage(err));
    }
  }

  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <h3>{book ? "編輯書籍" : "新增書籍"}</h3>

        <label htmlFor="lookup">從 ISBN 或書名帶入資料</label>
        <div className="lookup">
          <input
            id="lookup"
            type="text"
            value={query}
            placeholder={form.title || "ISBN 或書名"}
            autoComplete="off"
            autoFocus={!book}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                search();
              }
            }}
          />
          <button type="button" className="btn" onClick={search} disabled={searching}>
            {searching ? "查詢中…" : "查詢"}
          </button>
        </div>
        {lookupMsg && <div className="hint">{lookupMsg}</div>}
        {results && results.length > 0 && (
          <div className="results">
            {results.map((r, i) => (
              <button type="button" key={i} className="result" onClick={() => pick(r)}>
                {r.cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="cover" src={r.cover_url} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span className="cover ph">{r.title.slice(0, 1)}</span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="t" style={{ display: "block" }}>
                    {r.title}
                    {r.subtitle ? `：${r.subtitle}` : ""}
                  </span>
                  <span className="a" style={{ display: "block" }}>
                    {[r.authors.join("、"), r.published_date, r.source === "google" ? "Google Books" : "Open Library"]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {r.description && <span className="d">{r.description}</span>}
                </span>
              </button>
            ))}
          </div>
        )}

        {form.cover_url && (
          <div className="picked">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="cover" src={form.cover_url} alt="" referrerPolicy="no-referrer" />
            <span className="hint">已帶入封面</span>
          </div>
        )}

        <label htmlFor="fTitle">書名</label>
        <input id="fTitle" type="text" required autoComplete="off" value={form.title} onChange={(e) => set("title", e.target.value)} />
        <label htmlFor="fAuthor">作者</label>
        <input id="fAuthor" type="text" autoComplete="off" value={form.author} onChange={(e) => set("author", e.target.value)} />

        <label>狀態</label>
        <Seg label="狀態" options={STATUS_OPTS} value={form.status} onChange={setStatus} />
        <label>評價</label>
        <Seg label="評價" options={RATING_OPTS} value={fromRating(form.rating)} onChange={(v) => set("rating", toRating(v))} />

        <label htmlFor="fDate">讀完日期</label>
        <input id="fDate" type="date" value={form.finished_at} onChange={(e) => set("finished_at", e.target.value)} />
        <label htmlFor="fNote">心得</label>
        <textarea
          id="fNote"
          placeholder="喜歡或不喜歡的原因，會讓推薦更準"
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
        />

        <h4>書籍資料</h4>
        <label htmlFor="fDesc">簡介（查不到時可以自己貼上）</label>
        <textarea id="fDesc" value={form.description} onChange={(e) => set("description", e.target.value)} />
        <label htmlFor="fCats">分類（用逗號或頓號分隔）</label>
        <input id="fCats" type="text" value={categoriesText} onChange={(e) => setCategoriesText(e.target.value)} />
        <div className="grid2">
          <div>
            <label htmlFor="fIsbn">ISBN</label>
            <input id="fIsbn" type="text" inputMode="numeric" value={form.isbn} onChange={(e) => set("isbn", e.target.value)} />
          </div>
          <div>
            <label htmlFor="fCover">封面網址</label>
            <input id="fCover" type="url" value={form.cover_url} onChange={(e) => set("cover_url", e.target.value)} />
          </div>
        </div>

        {error && <div className="err">{error}</div>}

        <div className="foot">
          <button type="button" className={"del" + (confirmDelete ? " confirm" : "")} onClick={remove} style={{ visibility: book ? "visible" : "hidden" }}>
            {confirmDelete ? "確定刪除？" : "刪除"}
          </button>
          <div className="right">
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? "儲存中…" : "儲存"}
            </button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
