// 封面網址轉成較高解析度的版本（顯示時轉換，已存的封面也會變清楚）。

/**
 * - Google Books：拿掉 edge=curl（右下角的捲頁效果），加上 fife 要求較大的圖。
 * - Open Library：-S／-M 換成 -L（大圖）。
 * 其他網址原樣回傳。
 */
export function hiResCover(url: string): string {
  if (!url) return url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (/(^|\.)books\.google\.[a-z.]+$/.test(u.hostname) && u.pathname.includes("/content")) {
    u.protocol = "https:";
    u.searchParams.delete("edge");
    u.searchParams.set("fife", "w800-h1200");
    return u.toString();
  }
  if (u.hostname === "covers.openlibrary.org") {
    u.pathname = u.pathname.replace(/-[SM]\.jpg$/, "-L.jpg");
    return u.toString();
  }
  return url;
}
