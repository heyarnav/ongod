"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCart, cartSubtotal } from "@/lib/cart/store";
import { formatINR, cx } from "@/lib/format";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { RegistrationMark } from "@/components/ui/marks";

/**
 * THE MANIFEST — the side drawer that answers "what did I just take?"
 * Opens the moment something is acquired (see openDrawer in the cart store),
 * dismissible with ESC / EXIT / the veil, and hands off to the full checkout
 * register at /checkout. The record never leaves the page to show this.
 */
export function CheckoutDrawer() {
  const { lines, remove, setQuantity } = useCart();
  const open = useCart((s) => s.drawerOpen);
  const closeDrawer = useCart((s) => s.closeDrawer);
  const pathname = usePathname();
  const router = useRouter();
  const closeRef = useRef<HTMLButtonElement>(null);

  const subtotal = cartSubtotal(lines);
  const count = lines.reduce((s, l) => s + l.quantity, 0);
  const hasPreOrder = lines.some((l) => l.dropStatus === "PRE_ORDER");

  // /cart and /checkout ARE the full-page register — the drawer would only
  // restate them. Never open there.
  const exempt =
    pathname?.startsWith("/cart") ||
    pathname?.startsWith("/checkout") ||
    pathname?.startsWith("/admin");

  // Dismissible: ESC, and the veil behind it.
  useEffect(() => {
    if (!open || exempt) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDrawer();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, exempt, closeDrawer]);

  // A drawer never survives the navigation it was opened for. Compare against
  // the last seen route so merely opening it does not count as a navigation.
  const seenPath = useRef(pathname);
  useEffect(() => {
    if (seenPath.current === pathname) return;
    seenPath.current = pathname;
    closeDrawer();
  }, [pathname, closeDrawer]);

  // The page behind must not scroll under the panel.
  useEffect(() => {
    if (!open || exempt) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, exempt]);

  if (exempt) return null;

  const visible = open;

  return (
    <div
      aria-hidden={!visible}
      className={cx(
        "fixed inset-0 z-[88]",
        visible ? "pointer-events-auto" : "pointer-events-none",
      )}
    >
      {/* veil — the way out, if the EXIT button is missed */}
      <button
        onClick={closeDrawer}
        tabIndex={visible ? 0 : -1}
        aria-label="Close manifest"
        className={cx(
          "absolute inset-0 h-full w-full cursor-default bg-abyss/70 backdrop-blur-[2px] transition-opacity duration-500",
          visible ? "opacity-100" : "opacity-0",
        )}
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Acquisition manifest"
        className={cx(
          "absolute right-0 top-0 flex h-full w-full max-w-[430px] flex-col border-l border-bone/26 bg-void shadow-[-24px_0_60px_rgba(0,0,0,0.55)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]",
          visible ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* ── header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-bone/26 px-6 py-5">
          <div className="flex items-center gap-3">
            <RegistrationMark className="h-3.5 w-3.5" />
            <ArchiveLabel tone="crimson">ACQUISITION MANIFEST</ArchiveLabel>
          </div>
          <button
            ref={closeRef}
            onClick={closeDrawer}
            tabIndex={visible ? 0 : -1}
            data-cursor="EXIT"
            aria-label="Close manifest"
            className="font-mono text-[10px] tracking-archive text-bone/65 transition-colors hover:text-crimson"
          >
            EXIT ✕
          </button>
        </div>

        {count > 0 && (
          <div className="border-b border-bone/26 px-6 py-3 font-mono text-[10px] tracking-widest text-bone/46">
            {String(count).padStart(2, "0")} OBJECT{count === 1 ? "" : "S"} ENTERED THE REGISTER
          </div>
        )}

        {/* ── lines ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {lines.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-8 text-center">
              <ArchiveLabel tone="faint">THE REGISTER IS EMPTY.</ArchiveLabel>
              <p className="mt-4 font-mono text-[10px] leading-relaxed tracking-widest text-bone/41">
                NOTHING HAS BEEN SELECTED FOR ACQUISITION.
              </p>
              <Link
                href="/shop"
                tabIndex={visible ? 0 : -1}
                data-cursor="ENTER"
                onClick={closeDrawer}
                className="mt-8 border border-bone/41 px-6 py-3 font-mono text-[10px] tracking-archive text-bone transition-colors hover:border-crimson hover:text-crimson"
              >
                EXAMINE OBJECTS
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-bone/12">
              {lines.map((l) => (
                <li
                  key={`${l.productId}-${l.size}`}
                  className="flex gap-4 px-6 py-5"
                >
                  <div className="relative h-20 w-16 shrink-0 overflow-hidden border border-bone/26">
                    {l.image && (
                      <Image
                        src={l.image}
                        alt={l.name}
                        fill
                        sizes="64px"
                        className="archive-img object-cover"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <ArchiveLabel tone="faint">
                      {l.collectionName} / {l.archiveNumber}
                    </ArchiveLabel>
                    <div className="mt-1 truncate font-serif-d text-xl leading-tight text-bone/90">
                      {l.name}
                    </div>
                    <div className="mt-1 font-mono text-[10px] tracking-widest text-bone/46">
                      SIZE / {l.size}
                      {l.dropStatus === "PRE_ORDER" && (
                        <span className="ml-3 text-crimson">· PRE-ORDER</span>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-4">
                      <div className="flex items-center border border-bone/26">
                        <button
                          onClick={() =>
                            setQuantity(l.productId, l.size, l.quantity - 1)
                          }
                          tabIndex={visible ? 0 : -1}
                          data-cursor="ADJUST"
                          aria-label={`Decrease quantity of ${l.name}`}
                          className="px-2.5 py-1 font-mono text-xs text-bone/65 transition-colors hover:text-bone"
                        >
                          −
                        </button>
                        <span className="w-7 text-center font-mono text-xs text-bone/167">
                          {l.quantity}
                        </span>
                        <button
                          onClick={() =>
                            setQuantity(l.productId, l.size, l.quantity + 1)
                          }
                          tabIndex={visible ? 0 : -1}
                          data-cursor="ADJUST"
                          aria-label={`Increase quantity of ${l.name}`}
                          className="px-2.5 py-1 font-mono text-xs text-bone/65 transition-colors hover:text-bone"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => remove(l.productId, l.size)}
                        tabIndex={visible ? 0 : -1}
                        data-cursor="REMOVE"
                        className="font-mono text-[9px] tracking-widest text-bone/41 underline-offset-4 transition-colors hover:text-crimson hover:underline"
                      >
                        REMOVE
                      </button>
                    </div>
                  </div>

                  <div className="shrink-0 text-right font-mono text-xs text-bone/167">
                    {formatINR(l.price * l.quantity)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── footer — the way through ───────────────────────────── */}
        <div className="border-t border-bone/26 px-6 pb-7 pt-5">
          {hasPreOrder && (
            <p className="mb-5 border border-crimson/30 bg-crimson/5 px-3 py-2.5 font-mono text-[9px] leading-relaxed tracking-widest text-bone/77">
              PRE-ORDER PIECES ENTER PRODUCTION AFTER THE WINDOW CLOSES.
            </p>
          )}

          <div className="space-y-1.5 font-mono text-[10px] tracking-widest text-bone/46">
            <div className="flex justify-between gap-6">
              <span>SUBTOTAL</span>
              <span className="text-bone/126">{formatINR(subtotal)}</span>
            </div>
            <div className="flex justify-between gap-6">
              <span>SHIPPING</span>
              <span>CALCULATED AT CHECKOUT</span>
            </div>
          </div>

          <button
            onClick={() => {
              closeDrawer();
              router.push("/checkout");
            }}
            disabled={lines.length === 0}
            tabIndex={visible ? 0 : -1}
            data-cursor="PROCEED"
            className="mt-5 w-full border border-crimson bg-crimson py-4 font-mono text-[11px] tracking-archive text-bone transition-colors hover:border-crimson/60 hover:bg-transparent hover:text-crimson disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-crimson disabled:hover:bg-crimson"
          >
            CONTINUE TO CHECKOUT →
          </button>

          <div className="mt-3 flex items-center justify-between">
            <button
              onClick={closeDrawer}
              tabIndex={visible ? 0 : -1}
              data-cursor="RESUME"
              className="font-mono text-[10px] tracking-widest text-bone/41 transition-colors hover:text-bone/73"
            >
              ← RESUME EXAMINING
            </button>
            <Link
              href="/cart"
              tabIndex={visible ? 0 : -1}
              data-cursor="FULL CART"
              className="font-mono text-[10px] tracking-widest text-bone/41 transition-colors hover:text-bone/73"
            >
              FULL CART →
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}