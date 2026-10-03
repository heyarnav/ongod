"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/format";
import { useCart, cartCount } from "@/lib/cart/store";
import { MobileMenu } from "@/components/ui/MobileMenu";

const LINKS = [
  { href: "/shop", label: "SHOP" },
  { href: "/archive", label: "ARCHIVE" },
  { href: "/about", label: "ABOUT" },
] as const;

export function Navigation() {
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const lines = useCart((s) => s.lines);
  const count = cartCount(lines);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (pathname?.startsWith("/admin")) return null;

  return (
    <header
      className={cx(
        "sticky top-0 z-[85] border-b transition-all duration-500",
        scrolled
          ? "border-bone/12 bg-void/85 backdrop-blur-md"
          : "border-transparent bg-transparent",
      )}
    >
      <nav
        className={cx(
          "mx-auto flex max-w-[1600px] items-center justify-between px-5 transition-all duration-500 md:px-10",
          scrolled ? "py-3" : "py-5",
        )}
      >
        <Link
          href="/"
          data-cursor="HOME"
          className="font-black-d text-[22px] leading-none text-bone transition-colors hover:text-bone/167 md:text-[26px]"
        >
          on god.
        </Link>

        {/* desktop links */}
        <div className="hidden items-center gap-6 md:flex md:gap-10">
          {LINKS.map((l) => {
            const active = pathname === l.href || pathname?.startsWith(l.href + "/");
            return (
              <Link
                key={l.href}
                href={l.href}
                data-cursor="ENTER"
                className={cx(
                  "link-sweep font-mono text-[10px] tracking-archive transition-colors",
                  active ? "text-crimson" : "text-bone/73 hover:text-bone",
                )}
              >
                {l.label}
              </Link>
            );
          })}
          <Link
            href="/cart"
            data-cursor="VIEW OBJECT"
            className="group flex items-center gap-1.5 font-mono text-[10px] tracking-archive text-bone/73 transition-colors hover:text-bone"
          >
            CART
            <span className={cx("tabular-nums", count > 0 && "text-crimson")}>
              ({count})
            </span>
          </Link>
        </div>

        {/* mobile */}
        <div className="flex items-center gap-6 md:hidden">
          <Link
            href="/cart"
            data-cursor="VIEW OBJECT"
            className="font-mono text-[10px] tracking-archive text-bone/73 transition-colors hover:text-bone"
          >
            CART<span className={cx("ml-1 tabular-nums", count > 0 && "text-crimson")}>({count})</span>
          </Link>
          <MobileMenu />
        </div>
      </nav>
    </header>
  );
}
