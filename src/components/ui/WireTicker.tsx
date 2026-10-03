"use client";

import { Fragment } from "react";
import { cx } from "@/lib/format";

/**
 * THE WIRE — the crimson observation line, in motion.
 * A single slow marquee band: the drop window and specimen facts tick past
 * like annotations on a scanning instrument. Pauses on hover; static under
 * reduced motion. This is the one place the signature line moves.
 * Items may be strings or nodes (so one tick can be the CTA link itself).
 */
export function WireTicker({
  items,
  className,
}: {
  items: React.ReactNode[];
  className?: string;
}) {
  const row = (key: string) => (
    <Fragment key={key}>
      {items.map((t, i) => (
        <span key={i} className="flex items-center whitespace-nowrap">
          <span className="px-6">{t}</span>
          <span aria-hidden className="h-1 w-1 rotate-45 bg-crimson/80" />
        </span>
      ))}
    </Fragment>
  );

  return (
    <div
      aria-hidden={undefined}
      className={cx(
        "relative overflow-hidden border-y border-crimson/25 bg-crimson/[0.045] py-2",
        className,
      )}
    >
      <div className="wire-track">
        {row("a")}
        <span aria-hidden className="contents">
          {row("b")}
        </span>
      </div>
    </div>
  );
}
