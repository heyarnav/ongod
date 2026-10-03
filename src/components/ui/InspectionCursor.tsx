"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Cursor inspection label. Elements opt in via data-cursor="INSPECT" etc.
 * A tiny dot follows the pointer; a mono label appears beside it when the
 * element under the pointer declares one. Never replaces the native cursor.
 */
export function InspectionCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const [label, setLabel] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;

    let raf = 0;
    const pos = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };

    const onMove = (e: MouseEvent) => {
      pos.x = e.clientX;
      pos.y = e.clientY;
      setVisible(true);
      // only touch React when the label actually changes
      const el = (e.target as HTMLElement | null)?.closest?.("[data-cursor]");
      const next = el?.getAttribute("data-cursor") ?? null;
      setLabel((prev) => (prev === next ? prev : next));
    };

    const tick = () => {
      const dx = pos.x - cur.x;
      const dy = pos.y - cur.y;
      // the pointer has settled — stop writing to the DOM entirely
      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
        raf = requestAnimationFrame(tick);
        return;
      }
      cur.x += dx * 0.22;
      cur.y += dy * 0.22;
      const d = dotRef.current;
      if (d) d.style.transform = `translate(${cur.x}px, ${cur.y}px)`;
      raf = requestAnimationFrame(tick);
    };

    const onLeave = () => {
      setVisible(false);
      setLabel(null);
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={dotRef}
      aria-hidden
      className={`pointer-events-none fixed left-0 top-0 z-[95] hidden md:block transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      <div className="relative -translate-x-1/2 -translate-y-1/2">
        <div className="h-1 w-1 rounded-full bg-bone/167" />
        {label && (
          <div className="absolute left-3 top-2 whitespace-nowrap border border-bone/26 bg-void/80 px-1.5 py-0.5 font-mono text-[9px] tracking-archive text-bone/167 backdrop-blur-sm">
            [{label}]
          </div>
        )}
      </div>
    </div>
  );
}
