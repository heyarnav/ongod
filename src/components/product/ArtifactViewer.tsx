"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { ProductImageVM } from "@/types";
import { cx } from "@/lib/format";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { Crosshair, RegistrationMark } from "@/components/ui/marks";

const TYPE_LABEL: Record<string, string> = {
  front: "VIEW / FRONT",
  back: "VIEW / REVERSE",
  detail: "VIEW / DETAIL",
  artwork: "VIEW / ARTWORK",
  hero: "VIEW / PLATE",
  thumbnail: "VIEW / PLATE",
};

/**
 * Artifact examination frame: front / back / detail plates with lens zoom.
 * The garment is treated as a physical object under inspection.
 */
export function ArtifactViewer({
  images,
  objectNo,
  statusLabel,
}: {
  images: ProductImageVM[];
  objectNo: string;
  statusLabel?: string;
}) {
  const views = images.filter((i) => i.type !== "thumbnail");
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const frame = useRef<HTMLDivElement>(null);

  const current = views[idx];

  function onMove(e: React.MouseEvent) {
    const el = frame.current;
    if (!el || !zoom) return;
    const r = el.getBoundingClientRect();
    setOrigin({
      x: ((e.clientX - r.left) / r.width) * 100,
      y: ((e.clientY - r.top) / r.height) * 100,
    });
  }

  if (!current) {
    return (
      <div className="flex aspect-[4/5] items-center justify-center border border-bone/26">
        <ArchiveLabel tone="faint">PLATE UNAVAILABLE</ArchiveLabel>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-3">
        {/* left rail — one thumb per plate, numbered */}
        <div className="flex w-16 shrink-0 flex-col gap-2 md:w-20">
          {views.map((v, i) => {
            const active = i === idx;
            return (
              <button
                key={v.id}
                onClick={() => {
                  setIdx(i);
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
            ref={frame}
            onMouseMove={onMove}
            onClick={() => setZoom((z) => !z)}
            data-cursor={zoom ? "ZOOM 1.0" : "ZOOM 2.5"}
            className="scanband relative aspect-[4/5] max-h-[76vh] cursor-zoom-in overflow-hidden border border-bone/26 select-none bg-[radial-gradient(120%_90%_at_50%_40%,rgba(26,25,22,0.55)_0%,rgba(13,12,10,0.92)_100%)]"
          >
            <Image
              key={current.id}
              src={current.url}
              alt={current.alt || `${TYPE_LABEL[current.type] ?? "PLATE"} — object ${objectNo}`}
              fill
              priority={idx === 0}
              sizes="(max-width: 1024px) 100vw, 55vw"
              className={cx(
                "archive-img object-contain transition-transform duration-700",
                zoom && "scale-[2.2] cursor-zoom-out",
              )}
              style={zoom ? { transformOrigin: `${origin.x}% ${origin.y}%` } : undefined}
            />
            <Crosshair className="inset-0 opacity-40" />
            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
              <RegistrationMark className="h-3.5 w-3.5" />
              {statusLabel && (
                <span className="border border-bone/26 bg-void/85 px-1.5 py-0.5 font-mono text-[9px] tracking-archive text-crimson backdrop-blur-sm">
                  [ {statusLabel} ]
                </span>
              )}
            </div>
            <div className="pointer-events-none absolute bottom-3 right-3">
              <ArchiveLabel tone="faint">
                {String(idx + 1).padStart(2, "0")} / {String(views.length).padStart(2, "0")}
              </ArchiveLabel>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
