"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ProductDetail } from "@/types";
import { formatINR } from "@/lib/format";
import { useCart } from "@/lib/cart/store";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { cx } from "@/lib/format";
import { dropInfo } from "@/lib/drop";
import { track } from "@/lib/analytics-client";

export function AcquirePanel({ product }: { product: ProductDetail }) {
  const sizes = product.sizes.length
    ? product.sizes
    : ["S", "M", "L", "XL"];
  const [size, setSize] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  // the button never blocks: pressing it without a fit asks for one instead
  const [asking, setAsking] = useState(false);
  const sizeRowRef = useRef<HTMLDivElement>(null);
  const add = useCart((s) => s.add);
  const openDrawer = useCart((s) => s.openDrawer);
  const drop = dropInfo(product);

  const stockFor = (s: string) =>
    product.variants.find((v) => v.size === s)?.stock ?? 0;

  const selectedStock = size ? stockFor(size) : 0;

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
    // the manifest is on screen before they leave the page — no detour to /cart
    openDrawer();
    window.setTimeout(() => setAdded(false), 2500);
  }

  return (
    <div>
      {/* artifact metadata block */}
      <div className="space-y-1.5 border-b border-bone/26 pb-6 font-mono text-[10px] tracking-widest">
        {[
          ["PURPOSE", product.purpose],
          ["LIMITATION", product.limitation],
          ["STATE", product.state],
          ["ADAPTATION", product.adaptation],
        ]
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

      {/* sizes — hidden when the drop cannot be ordered at all */}
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
                )}                >
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

      {/* acquisition — one button, state-driven copy */}
      {drop.orderable ? (
        <>
          <button
            onClick={onAdd}
            data-cursor="PRE-ORDER"
            className="mt-8 w-full border border-crimson bg-crimson py-5 font-mono text-xs tracking-archive text-bone transition-colors hover:border-crimson/60 hover:bg-transparent hover:text-crimson"
          >
            {added ? "[ ADDED — IN COLLECTION ]" : `PRE-ORDER — ${formatINR(product.price)}`}
          </button>

          {added && (
            <Link
              href="/cart"
              className="mt-3 block text-center font-mono text-[10px] tracking-archive text-crimson underline-offset-4 hover:underline"
            >
              VIEW MANIFEST →
            </Link>
          )}

          <p className="mt-4 font-mono text-[9px] leading-relaxed tracking-widest text-bone/41">
            THIS IS A PRE-ORDER. PIECES ARE PRODUCED AFTER THE WINDOW CLOSES.
          </p>
        </>
      ) : (
        <div className="mt-8 border border-bone/26 px-4 py-4 text-center">
          <p className="font-mono text-[10px] tracking-archive text-bone/60">
            {drop.headline}
          </p>
        </div>
      )}
    </div>
  );
}
