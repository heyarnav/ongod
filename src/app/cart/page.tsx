"use client";

import Link from "next/link";
import Image from "next/image";
import { useCart, cartSubtotal } from "@/lib/cart/store";
import { formatINR } from "@/lib/format";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { RegistrationMark } from "@/components/ui/marks";

export default function CartPage() {
  const { lines, remove, setQuantity } = useCart();
  const subtotal = cartSubtotal(lines);
  const hasPreOrder = lines.some((l) => l.dropStatus === "PRE_ORDER");

  return (
    <div className="mx-auto min-h-[80vh] max-w-[1100px] px-5 pb-32 pt-28 md:px-10 md:pt-36">
      <div className="flex items-center gap-3">
        <RegistrationMark className="h-3.5 w-3.5" />
        <ArchiveLabel tone="crimson">OBJECTS SELECTED FOR ACQUISITION</ArchiveLabel>
      </div>
      <h1 className="mt-6 font-serif-d text-5xl font-light tracking-wide text-bone md:text-7xl">
        YOUR CART
      </h1>
      <p className="mt-4 font-mono text-[10px] tracking-archive text-bone/121">
        NO ACCOUNT REQUIRED — GUEST ACQUISITION ONLY.
      </p>

      {lines.length === 0 ? (
        <div className="mt-24 border border-bone/26 px-8 py-20 text-center">
          <ArchiveLabel tone="faint">THE REGISTER IS EMPTY.</ArchiveLabel>
          <Link
            href="/shop"
            data-cursor="ENTER"
            className="mt-8 inline-block border border-bone/41 px-6 py-3 font-mono text-[10px] tracking-archive text-bone transition-colors hover:border-crimson hover:text-crimson"
          >
            EXAMINE OBJECTS
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-14 border-t border-bone/26">
            {lines.map((l) => (
              <div
                key={`${l.productId}-${l.size}`}
                className="grid grid-cols-[88px_1fr_auto] items-center gap-5 border-b border-bone/26 py-6 md:grid-cols-[110px_1fr_auto] md:gap-8"
              >
                <div className="relative aspect-square overflow-hidden border border-bone/26">
                  {l.image && (
                    <Image src={l.image} alt={l.name} fill sizes="110px" className="archive-img object-cover" />
                  )}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <ArchiveLabel tone="crimson">
                      {l.collectionName} / {l.archiveNumber}
                    </ArchiveLabel>
                    {l.dropStatus === "PRE_ORDER" && (
                      <ArchiveLabel tone="crimson">PRE-ORDER</ArchiveLabel>
                    )}
                  </div>
                  <div className="mt-1.5 font-serif-d text-xl text-bone/93 md:text-2xl">
                    {l.name}
                  </div>
                  <div className="mt-1 font-mono text-[10px] tracking-widest text-bone/126">
                    SIZE / {l.size}
                  </div>
                  <div className="mt-3 flex items-center gap-4">
                    <div className="flex items-center border border-bone/26">
                      <button
                        onClick={() => setQuantity(l.productId, l.size, l.quantity - 1)}
                        data-cursor="ADJUST"
                        className="px-3 py-1.5 font-mono text-xs text-bone/65 hover:text-bone"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-mono text-xs text-bone/167">
                        {l.quantity}
                      </span>
                      <button
                        onClick={() => setQuantity(l.productId, l.size, l.quantity + 1)}
                        data-cursor="ADJUST"
                        className="px-3 py-1.5 font-mono text-xs text-bone/65 hover:text-bone"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => remove(l.productId, l.size)}
                      data-cursor="REMOVE"
                      className="font-mono text-[9px] tracking-widest text-bone/41 underline-offset-4 transition-colors hover:text-crimson hover:underline"
                    >
                      REMOVE
                    </button>
                  </div>
                </div>
                <div className="text-right font-mono text-sm text-bone/167">
                  {formatINR(l.price * l.quantity)}
                </div>
              </div>
            ))}
          </div>

          {hasPreOrder && (
            <div className="mt-10 border border-crimson/30 bg-crimson/5 px-5 py-4">
              <ArchiveLabel tone="crimson">NOTICE</ArchiveLabel>
              <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-widest text-bone/77">
                YOUR ORDER CONTAINS A PRE-ORDER ITEM. PIECES ENTER PRODUCTION AFTER THE
                PRE-ORDER WINDOW CLOSES AND DISPATCH AFTER THE ESTIMATED PERIOD.
              </p>
            </div>
          )}

          <div className="mt-10 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <div className="space-y-1.5 font-mono text-[10px] tracking-widest text-bone/126">
              <div className="flex justify-between gap-16">
                <span>SUBTOTAL</span>
                <span className="text-bone/161">{formatINR(subtotal)}</span>
              </div>
              <div className="flex justify-between gap-16">
                <span>SHIPPING</span>
                <span>CALCULATED AT CHECKOUT</span>
              </div>
              <div className="mt-3 flex justify-between gap-16 border-t border-bone/26 pt-3 text-bone">
                <span className="tracking-archive">TOTAL</span>
                <span className="text-base">{formatINR(subtotal)}</span>
              </div>
            </div>

            <Link
              href="/checkout"
              data-cursor="PROCEED"
              className="inline-flex items-center justify-center border border-bone/46 px-10 py-4 font-mono text-[11px] tracking-archive text-bone transition-colors hover:border-crimson hover:text-crimson"
            >
              PROCEED TO CHECKOUT →
            </Link>
          </div>

          <p className="mt-10 text-center font-mono text-[9px] tracking-widest text-bone/41">
            PAYMENT SECURED BY RAZORPAY AT CHECKOUT — INTEGRATION PENDING
          </p>
        </>
      )}
    </div>
  );
}
