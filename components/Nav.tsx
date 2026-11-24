"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBook, IconSparkle, IconUser } from "./icons";

const ITEMS = [
  { href: "/", label: "推薦", Icon: IconSparkle },
  { href: "/shelf", label: "書櫃", Icon: IconBook },
  { href: "/me", label: "我的", Icon: IconUser },
];

/** 桌機是左側的圖示列，手機變成底部的分頁列。 */
export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="主選單">
      <Link href="/" className="nav-logo" aria-label="nextread 首頁">
        <span>n</span>
      </Link>
      <div className="nav-items">
        {ITEMS.map(({ href, label, Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link key={href} href={href} className={"nav-item" + (active ? " active" : "")} aria-current={active ? "page" : undefined}>
              <span className="nav-icon">
                <Icon />
              </span>
              <span className="nav-label">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
