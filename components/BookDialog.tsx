"use client";

import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { normalizeISBN } from "@/lib/server/books";
import { applyLookup, bookToInput, emptyInput, parseCategories, today } from "@/lib/shelf";
import { canRate, type Book, type BookInput, type LookupResult, type Rating, type Status } from "@/lib/types";
import Seg from "./Seg";

const STATUS_OPTS: { value: Status; label: string }[] = [
  { value: "read", label: "完讀" },
  { value: "reading", label: "在讀" },
  { value: "want", label: "想讀" },
  { value: "dropped", label: "棄讀" },
];
type RatingValue = "2" | "1" | "0" | "-1" | "";
const RATING_OPTS: { value: RatingValue; label: string }[] = [
  { value: "2", label: "超級喜歡" },
  { value: "1", label: "喜歡" },
  { value: "0", label: "沒想法" },
  { value: "-1", label: "不喜歡" },
  { value: "", label: "未評價" },
];

const toRating = (v: RatingValue): Rating => (v === "" ? null : (Number(v) as Rating));
const fromRating = (r: Rating): RatingValue => (r === null ? "" : (String(r) as RatingValue));

export default function BookDialog({
  book,
  preset,
  onClose,
  onSaved,
  onDeleted,
}: {
  book: Book | null;
  /** 新增時預先填入的欄位（例如從推薦加入）。 */
  preset?: Partial<BookInput>;
  onClose: () => void;
  onSaved: (b: Book) => void;
  onDeleted: (id: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<BookInput>(() =>
    book ? bookToInput(book) : emptyInput({ finished_at: today(), ...preset }),
  );
  const [categoriesText, setCategoriesText] = useState(() => (book?.categories ?? preset?.categories ?? []).join("、"));
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
      // 只有完讀、棄讀可以評價；棄讀還沒評價時預設為不喜歡
      rating: !canRate(s) ? null : s === "dropped" && f.rating === null ? -1 : f.rating,
      // 改成完讀、棄讀時自動填今天，改成想讀時清掉日期
      finished_at: canRate(s) ? f.finished_at || today() : s === "want" ? "" : f.finished_at,
    }));
  }

  async function search() {
    const q = query.trim() || form.title.trim();
    if (!q || searching) return;
    if (!query.trim()) setQuery(q);
    setSearching(true);
    setLookupMsg("");
    const isbn = normalizeISBN(q);
    try {
      const r = await api.lookup(q);
      setResults(r);
      if (!r.length && isbn) {
        // 查不到的 ISBN 還是填進書籍資料，之後補資料時可以再用它查
        set("isbn", isbn);
        setLookupMsg("查不到這個 ISBN 的資料，已幫你填入下方的 ISBN 欄位，書名和簡介可以手動填寫。");
      } else if (!r.length) setLookupMsg("查不到這本書，可以在下方手動填寫簡介。");
    } catch (e) {
      setResults(null);
      setLookupMsg(errorMessage(e));
    } finally {
      setSearching(false);
    }
  }

  function pick(r: LookupResult) {
    // 用 ISBN 查到、但結果本身沒有 ISBN 時，沿用查詢的 ISBN
    const searched = normalizeISBN(query);
    const next = applyLookup(form, searched && !r.isbn ? { ...r, isbn: searched } : r);
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
        {(form.rec_score !== null || form.rec_reason) && (
          <div className="rec-note">
            <span className="rec-note-head">
              推薦紀錄{form.rec_score !== null && <b>{form.rec_score} 分</b>}
              {form.rec_at && <span className="muted"> · {form.rec_at.slice(0, 10)}</span>}
            </span>
            {form.rec_reason && <span>{form.rec_reason}</span>}
          </div>
        )}

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
        {canRate(form.status) ? (
          <Seg label="評價" options={RATING_OPTS} value={fromRating(form.rating)} onChange={(v) => set("rating", toRating(v))} />
        ) : (
          <p className="hint">完讀或棄讀後才能評價。</p>
        )}

        {form.status !== "want" && (
          <>
            <label htmlFor="fDate">{form.status === "dropped" ? "棄讀日期" : form.status === "reading" ? "完讀日期（讀完再填）" : "完讀日期"}</label>
            <input id="fDate" type="date" value={form.finished_at} onChange={(e) => set("finished_at", e.target.value)} />
          </>
        )}
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
