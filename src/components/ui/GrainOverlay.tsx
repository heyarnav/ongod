"use client";

import { useEffect, useState } from "react";

/**
 * Fixed, non-interactive grain + faint scan lines.
 * SVG turbulence noise (SSR-safe), CSS-only animation; respects
 * prefers-reduced-motion.
 */
export function GrainOverlay() {
  // The grain layer only mounts client-side; it is decoration, not content.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[90] overflow-hidden"
      style={{ contain: "strict" }}
    >
      {/* scan imperfection + vignette share ONE static layer — every extra
          full-viewport overlay is another blend pass over the live canvas.
          Their alphas are baked into the gradients so they keep the exact
          strength they had as separate layers. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0 5px, rgba(255,255,255,0.013) 5px 6px)," +
            "radial-gradient(ellipse at center, transparent 58%, rgba(0,0,0,0.32) 100%)",
        }}
      />
      {mounted && (
        <div
          className="ongod-noise absolute -inset-[3%] opacity-[0.05]"
          style={{
            backgroundImage: `url("${NOISE_URL}")`,
            backgroundSize: "180px 180px",
            willChange: "transform",
          }}
        />
      )}
      <style jsx global>{`
        @keyframes ongod-grain {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(-2%, 1%); }
          50% { transform: translate(1%, -2%); }
          75% { transform: translate(-1%, 2%); }
        }
        @media (prefers-reduced-motion: no-preference) {
          .ongod-noise {
            animation: ongod-grain 0.9s steps(4) infinite;
          }
        }
      `}</style>
    </div>
  );
}

/** Fractal-noise SVG tile as a data URL — no canvas, deterministic, tiny. */
const NOISE_URL =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>` +
      `<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>` +
      `<feColorMatrix type='saturate' values='0'/></filter>` +
      `<rect width='100%' height='100%' filter='url(%23n)' opacity='0.6'/>` +
      `</svg>`,
  );
