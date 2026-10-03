"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/format";

const LINKS = [
  { href: "/", label: "HOME", note: "THE FIRST OBJECT" },
  { href: "/shop", label: "SHOP", note: "CURRENT RELEASES" },
  { href: "/archive", label: "ARCHIVE", note: "THE THREE REALMS" },
  { href: "/about", label: "ABOUT", note: "METHOD & CORRESPONDENCE" },
] as const;

/**
 * THE INDEX — mobile navigation.
 * Below md the link row collapses into a single INDEX toggle that opens a
 * full-screen register of destinations, set in the document voice.
 * Closes on navigation; locks scroll while open.
 */
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation.
  useEffect(() => setOpen(false), [pathname]);

  // Scroll lock + Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        data-cursor="INDEX"
        aria-expanded={open}
        aria-label="Open index"
        className="font-mono text-[10px] tracking-archive text-bone/161 transition-colors hover:text-bone"
      >
        INDEX
      </button>

      <div
        className={cx(
          "fixed inset-0 z-[90] flex flex-col bg-abyss transition-opacity duration-300",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {/* overlay header */}
        <div className="flex items-center justify-between border-b border-bone/26 px-5 py-5">
          <span className="font-black-d text-xl text-bone">on god.</span>
          <button
            onClick={() => setOpen(false)}
            data-cursor="CLOSE"
            aria-label="Close index"
            className="font-mono text-[10px] tracking-archive text-bone/65 transition-colors hover:text-crimson"
          >
            CLOSE ✕
          </button>
        </div>

        {/* the register */}
        <nav className="flex flex-1 flex-col justify-center px-6">
          {LINKS.map((l, i) => (
            <Link
              key={l.href}
              href={l.href}
              data-cursor="ENTER"
              className={cx(
                "group border-b border-bone/22 py-5 transition-colors",
                pathname === l.href ? "text-crimson" : "text-bone",
              )}
              style={{
                transitionDelay: open ? `${i * 60}ms` : "0ms",
                opacity: open ? 1 : 0,
                transform: open ? "none" : "translateY(12px)",
                transitionProperty: "opacity, transform",
                transitionDuration: "700ms",
              }}
            >
              <span className="flex items-baseline gap-4">
                <span className="font-mono text-[9px] tracking-archive text-crimson/70">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-serif-d text-4xl font-light">{l.label}</span>
              </span>
              <span className="mt-1 block pl-10 font-mono text-[9px] tracking-widest text-bone/121">
                {l.note}
              </span>
            </Link>
          ))}
        </nav>

        <div className="border-t border-bone/26 px-6 py-5">
          <Link
            href="/cart"
            data-cursor="VIEW"
            className="font-mono text-[10px] tracking-archive text-bone/73"
          >
            CART →
          </Link>
        </div>
      </div>
    </div>
  );
}
