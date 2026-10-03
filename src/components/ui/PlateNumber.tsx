"use client";

import { useEffect, useState } from "react";
import { pad } from "@/lib/format";

/**
 * Fixed archival page number, e.g. "PLATE 02 / 05".
 * Derives the current plate from scroll position across registered sections.
 */
export function PlateNumber({ total, className }: { total?: number; className?: string }) {
  const [plate, setPlate] = useState(1);

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const p = max > 0 ? window.scrollY / max : 0;
      const count = total ?? 5;
      setPlate(Math.min(count, Math.max(1, Math.ceil(p * count) || 1)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [total]);

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed bottom-5 right-5 z-[80] hidden select-none font-mono text-[9px] tracking-archive text-bone/46 md:block ${className ?? ""}`}
    >
      PLATE {pad(plate)} {total ? `/ ${pad(total)}` : ""}
    </div>
  );
}
