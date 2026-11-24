"use client";

// 共用的小元件：封面、評價標籤、書籍列。
import { RATING_LABEL, STATUS_LABEL, type Book, type Rating, type RatingKey } from "@/lib/types";

export function Cover({ src, title, size = "sm" }: { src?: string; title: string; size?: "sm" | "md" | "lg" }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`cover cover-${size}`} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
  ) : (
    <span className={`cover cover-${size} ph`} aria-hidden>
      {title.slice(0, 1)}
    </span>
  );
}

export function RatingPill({ rating }: { rating: Rating }) {
  if (rating === null) return null;
  const key = String(rating) as RatingKey;
  return <span className={`pill r${key}`}>{rating === 2 ? "★ " : ""}{RATING_LABEL[key]}</span>;
}

export function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 75 ? "hi" : score >= 50 ? "mid" : "lo";
  return (
    <span className={`score-badge ${tone}`} title="推薦分數">
      {score}
    </span>
  );
}

export function BookRow({ book, onClick }: { book: Book; onClick: () => void }) {
  return (
    <button className="row" onClick={onClick}>
      <Cover src={book.cover_url} title={book.title} />
      <span className="main">
        <span className="t">{book.title}</span>
        {book.author && <span className="a">{book.author}</span>}
      </span>
      {book.finished_at && <span className="tag date">{book.finished_at}</span>}
      <span className={"tag" + (book.status === "dropped" ? " dropped" : "")}>{STATUS_LABEL[book.status]}</span>
      <RatingPill rating={book.rating} />
    </button>
  );
}
