"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ProductDetail } from "@/types";
import type { DropInfo } from "@/lib/drop";
import { PRE_ORDER_STEPS } from "@/lib/drop";
import { formatINR, cx } from "@/lib/format";
import { useCart } from "@/lib/cart/store";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { Crosshair, RegistrationMark } from "@/components/ui/marks";
import { track } from "@/lib/analytics-client";

const TYPE_LABEL: Record<string, string> = {
  front: "FRONT",
  back: "REVERSE",
  detail: "DETAIL",
  artwork: "ARTWORK",
  hero: "PLATE",
  thumbnail: "PLATE",
};

type View = { id: string; url: string; alt: string | null; type: string };

/**
 * THE ACQUISITION CONSOLE — the first drop, purchasable in place.
 * Left rail of plate thumbnails (Amazon-style, but archival); the stage
 * right of it shows the selected plate — the live two-sided garment for
 * front/reverse, the high-res plate with lens zoom for artwork/detail.
 * Everything needed to buy lives in the register beside it. No dead ends.
 */
export function DropConsole({
  product,
  drop,
}: {
  product: ProductDetail;
  drop: DropInfo;
}) {
  const views = useMemo(
    () => product.images.filter((i) => i.type !== "thumbnail"),
    [product.images],
  );
  const sizes = product.sizes.length ? product.sizes : ["S", "M", "L", "XL"];
  const [sel, setSel] = useState<string>(views[0]?.id ?? "");
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [size, setSize] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [openStep, setOpenStep] = useState<string | null>(null);
  // the button never blocks: pressing it without a fit asks for one instead
  const [asking, setAsking] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const sizeRowRef = useRef<HTMLDivElement>(null);
  const add = useCart((s) => s.add);
  const openDrawer = useCart((s) => s.openDrawer);

  const stockFor = (s: string) =>
    product.variants.find((v) => v.size === s)?.stock ?? 0;
  const selectedStock = size ? stockFor(size) : 0;

  // The rail: the archived plates in record order.
  const rail: View[] = views;
  const current: View = rail.find((v) => v.id === sel) ?? rail[0];
  const currentIndex = rail.indexOf(current);

  // ── window ticker: days · hours until the window closes ──────────────
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!drop.preOrderEndsAt || !drop.orderable) return;
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [drop.preOrderEndsAt, drop.orderable]);

  const remaining = useMemo(() => {
    if (!now || !drop.orderable || !drop.preOrderEndsAt) return null;
    const ms = new Date(drop.preOrderEndsAt).getTime() - now;
    if (ms <= 0) return null;
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    return { days, hours };
  }, [now, drop.orderable, drop.preOrderEndsAt]);

  function onMove(e: React.MouseEvent) {
    const el = frameRef.current;
    if (!el || !zoom) return;
    const r = el.getBoundingClientRect();
    setOrigin({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  }

  function onAdd() {
    if (!drop.orderable) return;
    if (!size) {
      setAsking(true);
      sizeRowRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    if (selectedStock <= 0) return;
    add({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      archiveNumber: product.archiveNumber,
      collectionName: product.collection?.name ?? "ARCHIVE",
      size,
      price: product.price,
      quantity: 1,
      image: product.cover,
      maxStock: selectedStock,
      dropStatus: drop.status,
      editionLabel: drop.editionLabel,
    });
    setAdded(true);
    track("ADD_TO_CART", { productId: product.id, meta: { size, price: product.price } });
    openDrawer();
    window.setTimeout(() => setAdded(false), 2600);
  }

  const href = `/archive/${product.collection?.slug ?? "human"}/${product.slug}`;

  return (
    <div className="grid grid-cols-1 gap-10 md:grid-cols-12 md:gap-14">
      {/* ── PLATES — thumbnail rail + stage, the examination bench ───── */}
      <div className="md:col-span-7">
        <div className="flex gap-3">
          {/* left rail — one thumb per plate */}
          <div className="flex w-16 shrink-0 flex-col gap-2 md:w-20">
            {rail.map((v, i) => {
              const active = v.id === sel;
              return (
                <button
                  key={v.id}
                  onClick={() => {
                    setSel(v.id);
                    setZoom(false);
                  }}
                  data-cursor="INSPECT"
                  aria-label={`Plate ${v.type}`}
                  className={cx(
                    "relative aspect-square overflow-hidden border transition-colors",
                    active
                      ? "border-crimson"
                      : "border-bone/26 opacity-70 hover:border-bone/46 hover:opacity-100",
                  )}
                >
                  <Image
                    src={v.url}
                    alt=""
                    fill
                    sizes="80px"
                    className="archive-img object-cover"
                  />
                  {/* plate index — structural, not decorative */}
                  <span className="absolute bottom-0.5 left-1 bg-void/85 px-1 font-mono text-[8px] text-bone/96">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </button>
              );
            })}
          </div>

          {/* stage */}
          <div className="min-w-0 flex-1">
            <div
              ref={frameRef}
              onMouseMove={onMove}
              onClick={() => setZoom((z) => !z)}
              data-cursor={zoom ? "ZOOM 1.0" : "ZOOM 2.5"}
              className="scanband relative aspect-[4/5] max-h-[76vh] cursor-zoom-in select-none overflow-hidden border border-bone/26 bg-[radial-gradient(120%_90%_at_50%_40%,rgba(26,25,22,0.55)_0%,rgba(13,12,10,0.92)_100%)]"
            >
              <Image
                key={current.id}
                src={current.url}
                alt={current.alt || `${TYPE_LABEL[current.type] ?? "PLATE"} — object ${product.archiveNumber}`}
                fill
                priority={currentIndex <= 1}
                sizes="(max-width: 768px) 100vw, 50vw"
                className={cx(
                  "archive-img object-contain transition-transform duration-700",
                  zoom && "scale-[2.2] cursor-zoom-out",
                )}
                style={zoom ? { transformOrigin: `${origin.x}% ${origin.y}%` } : undefined}
              />
              <Crosshair className="inset-0 opacity-40" />
              <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
                <RegistrationMark className="h-3.5 w-3.5" />
                <span className="border border-bone/26 bg-void/85 px-1.5 py-0.5 font-mono text-[9px] tracking-archive text-crimson backdrop-blur-sm">
                  [ {drop.label} ]
                </span>
              </div>
              <div className="pointer-events-none absolute bottom-3 right-3">
                <ArchiveLabel tone="faint">
                  {String(currentIndex + 1).padStart(2, "0")} / {String(rail.length).padStart(2, "0")}
                </ArchiveLabel>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── ACQUISITION REGISTER ──────────────────────────────────────── */}
      <div className="md:col-span-5">
        <div className="flex flex-wrap items-center gap-2">
          <ArchiveLabel tone="crimson">{drop.editionLabel}</ArchiveLabel>
          <span className="text-bone/36">·</span>
          <ArchiveLabel>{product.collection?.name} / {product.archiveNumber}</ArchiveLabel>
        </div>
        <h3 className="mt-4 font-serif-d text-5xl font-light leading-none text-bone md:text-6xl">
          {product.name}
          {product.subtitle && (
            <span className="mt-1 block text-xl italic text-bone/65">{product.subtitle}</span>
          )}
        </h3>

        {/* window + remaining time */}
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1">
          {drop.windowLabel && (
            <ArchiveLabel tone="faint">{drop.windowLabel}</ArchiveLabel>
          )}
          {remaining && (
            <span className="font-mono text-[10px] tracking-widest text-crimson">
              CLOSES IN {remaining.days}D {String(remaining.hours).padStart(2, "0")}H
            </span>
          )}
        </div>

        {/* purpose / limitation register */}
        <div className="mt-6 space-y-1.5 border-y border-bone/26 py-5 font-mono text-[10px] tracking-widest">
          {([
            ["PURPOSE", product.purpose],
            ["LIMITATION", product.limitation],
            ["STATE", product.state],
            ["ADAPTATION", product.adaptation],
          ] as Array<[string, string | null]>)
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className="flex gap-4">
                <span className="w-24 text-bone/126">{k} :</span>
                <span className="text-bone/164">{v}</span>
              </div>
            ))}
        </div>

        {/* price */}
        <div className="flex items-baseline gap-4 pt-6">
          <span className="font-mono text-xl text-bone">{formatINR(product.price)}</span>
          {product.comparePrice && product.comparePrice > product.price && (
            <span className="font-mono text-xs text-bone/121 line-through">
              {formatINR(product.comparePrice)}
            </span>
          )}
          <ArchiveLabel tone={drop.orderable ? "crimson" : "default"} className="ml-auto">
            STATUS / {drop.label}
          </ArchiveLabel>
        </div>

        {/* size register */}
        {drop.orderable && (
          <div ref={sizeRowRef} className="mt-6 scroll-mt-24">
            <ArchiveLabel tone={asking ? "crimson" : "faint"}>SIZE / SPECIMEN FIT</ArchiveLabel>
            <div
              className={cx(
                "mt-3 flex flex-wrap gap-2 transition-shadow duration-300",
                asking && "animate-pulse",
              )}
            >
              {sizes.map((s) => {
                const stock = stockFor(s);
                const active = size === s;
                return (
                  <button
                    key={s}
                    disabled={stock <= 0}
                    onClick={() => {
                      setSize(s);
                      setAsking(false);
                    }}
                    data-cursor={stock > 0 ? "SELECT" : "DEPLETED"}
                    className={cx(
                      "relative h-10 w-12 border font-mono text-[11px] transition-colors",
                      active
                        ? "border-crimson text-crimson"
                        : stock > 0
                          ? "border-bone/36 text-bone/161 hover:border-bone/65 hover:text-bone"
                          : "cursor-not-allowed border-bone/12 text-bone/36 line-through",
                    )}
                  >
                    {s}
                    {stock <= 2 && stock > 0 && (
                      <span className="absolute -right-1 -top-1 h-1 w-1 rotate-45 bg-crimson" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* the ask — only after the button has been pressed */}
            {asking && (
              <p className="mt-3 font-mono text-[10px] tracking-archive text-crimson">
                [ SELECT A SIZE TO CONTINUE ]
              </p>
            )}
          </div>
        )}

        {/* acquisition */}
        {drop.orderable ? (
          <>
            <button
              onClick={onAdd}
              data-cursor="PRE-ORDER"
              className="mt-8 w-full border border-crimson bg-crimson py-5 font-mono text-xs tracking-archive text-bone transition-colors hover:border-crimson/60 hover:bg-transparent hover:text-crimson"
            >
              {added ? "[ ADDED — IN COLLECTION ]" : `PRE-ORDER — ${formatINR(product.price)}`}
            </button>
            {added ? (
              <Link
                href="/cart"
                data-cursor="CHECKOUT"
                className="mt-3 block text-center font-mono text-[10px] tracking-archive text-crimson underline-offset-4 hover:underline"
              >
                PROCEED TO CART →
              </Link>
            ) : (
              <Link
                href={href}
                data-cursor="EXAMINE"
                className="mt-3 block text-center font-mono text-[10px] tracking-archive text-bone/126 underline-offset-4 hover:text-bone/161 hover:underline"
              >
                FULL EXAMINATION →
              </Link>
            )}
            <p className="mt-4 font-mono text-[9px] leading-relaxed tracking-widest text-bone/41">
              {drop.preOrderNotice ||
                "THIS IS A PRE-ORDER. PIECES ARE PRODUCED AFTER THE WINDOW CLOSES."}
            </p>
          </>
        ) : (
          <div className="mt-8 border border-bone/26 px-4 py-4 text-center">
            <p className="font-mono text-[10px] leading-relaxed tracking-archive text-bone/60">
              {drop.headline}
            </p>
            <Link
              href={href}
              data-cursor="EXAMINE"
              className="mt-3 inline-block font-mono text-[10px] tracking-archive text-crimson underline-offset-4 hover:underline"
            >
              EXAMINE THE RECORD →
            </Link>
          </div>
        )}

        {/* process ledger — expanding rows */}
        <div className="mt-10">
          <ArchiveLabel tone="faint">THE PROCESS</ArchiveLabel>
          <div className="mt-3">
            {PRE_ORDER_STEPS.map((st) => {
              const open = openStep === st.num;
              return (
                <div key={st.num} className="border-b border-bone/26">
                  <button
                    onClick={() => setOpenStep(open ? null : st.num)}
                    aria-expanded={open}
                    data-cursor={open ? "CLOSE" : "OPEN"}
                    className="flex w-full items-center justify-between py-3 text-left font-mono text-[10px] tracking-widest text-bone/69 transition-colors hover:text-bone"
                  >
                    <span>
                      <span className="mr-3 text-crimson/80">{st.num}</span>
                      {st.title}
                    </span>
                    <span
                      className={cx(
                        "text-bone/41 transition-transform duration-300",
                        open && "rotate-45",
                      )}
                    >
                      +
                    </span>
                  </button>
                  <div
                    className={cx(
                      "grid transition-all duration-500 ease-out",
                      open ? "grid-rows-[1fr] pb-3" : "grid-rows-[0fr]",
                    )}
                  >
                    <p className="overflow-hidden font-mono text-[10px] leading-relaxed text-bone/126">
                      {st.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
