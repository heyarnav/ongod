"use client";

import { useState } from "react";
import { formatINR } from "@/lib/format";
import type { DropInfo } from "@/lib/drop";
import { PRE_ORDER_STEPS } from "@/lib/drop";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { cx } from "@/lib/format";

/**
 * PRE-ORDER INFORMATION panel + status messaging.
 * Expandable archival process register — six steps, no ecommerce FAQ energy.
 * Also renders the state headline for non-orderable statuses.
 */
export function PreOrderPanel({ drop, price }: { drop: DropInfo; price: number }) {
  const [open, setOpen] = useState(false);

  // Non-orderable states carry their own headline instead of the process.
  if (!drop.orderable) {
    return (
      <div>
        <ArchiveLabel tone="crimson">{drop.label}</ArchiveLabel>
        <p className="mt-4 font-serif-d text-lg italic leading-relaxed text-bone/73">
          {drop.statusMessage}
        </p>
        {drop.windowLabel && (
          <ArchiveLabel tone="faint" className="mt-4 block">
            {drop.windowLabel}
          </ArchiveLabel>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* the notice — never tiny legal text */}
      <p className="font-mono text-[11px] leading-relaxed tracking-wide text-bone/73">
        {drop.preOrderNotice || DEFAULT_NOTICE}
      </p>

      {(drop.productionPeriod || drop.dispatchPeriod) && (
        <div className="mt-5 space-y-1.5 border-l border-crimson/40 pl-4 font-mono text-[10px] tracking-wide text-bone/69">
          {drop.productionPeriod && (
            <p>
              ESTIMATED PRODUCTION: <span className="text-bone/167">{drop.productionPeriod}</span>
            </p>
          )}
          {drop.dispatchPeriod && (
            <p>
              ESTIMATED DISPATCH: <span className="text-bone/167">{drop.dispatchPeriod}</span>
            </p>
          )}
          <p className="text-bone/121">TRACKING WILL BE PROVIDED ONCE YOUR ORDER SHIPS.</p>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        data-cursor={open ? "CLOSE" : "OPEN"}
        className="mt-7 flex w-full items-center justify-between border-t border-bone/26 pt-5 text-left font-mono text-[10px] tracking-archive text-bone/73 transition-colors hover:text-bone"
        aria-expanded={open}
      >
        PRE-ORDER INFORMATION
        <span
          className={cx(
            "text-crimson transition-transform duration-300",
            open && "rotate-45",
          )}
        >
          +
        </span>
      </button>

      {open && (
        <ol className="mt-2 space-y-0 border-t border-bone/12">
          {PRE_ORDER_STEPS.map((step, i) => (
            <li
              key={step.num}
              className={cx(
                "flex gap-5 border-b border-bone/12 py-4",
                i === 0 && "border-t-0",
              )}
            >
              <span className="w-8 shrink-0 pt-0.5 font-mono text-[10px] text-crimson/80">
                {step.num}
              </span>
              <div>
                <p className="font-mono text-[10px] tracking-archive text-bone/164">
                  {step.title}
                </p>
                <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-bone/126">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-6 font-mono text-[9px] tracking-widest text-bone/46">
        {drop.editionLabel} · {formatINR(price)} · NUMBERED ON ACQUISITION
      </p>
    </div>
  );
}

const DEFAULT_NOTICE =
  "THIS IS A PRE-ORDER. Your piece will be produced as part of the first edition after the pre-order period closes. It will not ship immediately after purchase.";
