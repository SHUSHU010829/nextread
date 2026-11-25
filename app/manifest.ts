import type { MetadataRoute } from "next";

/** 加到手機主畫面時使用的名稱與圖示。 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "nextread｜下一本，讀什麼？",
    short_name: "nextread",
    description: "記錄讀過的每一本書，依照你的口味推薦下一本。",
    start_url: "/",
    display: "standalone",
    background_color: "#f1eee8",
    theme_color: "#f1eee8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
