import { cx, pad } from "@/lib/format";
import { ArchiveLabel } from "./ArchiveLabel";

/** Print registration mark: hairline cross in a faint ring. */
export function RegistrationMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cx("h-4 w-4 text-bone/46", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="0.5"
    >
      <circle cx="12" cy="12" r="7" />
      <line x1="12" y1="1" x2="12" y2="23" />
      <line x1="1" y1="12" x2="23" y2="12" />
    </svg>
  );
}

/** Faint plate crosshair. */
export function Crosshair({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cx("pointer-events-none absolute", className)}>
      <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-bone/19" />
      <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-bone/19" />
    </div>
  );
}

/**
 * Measurement line with ticks:  <──── 184 mm ────>
 * Reacts to scroll progress when `progress` provided (0–1); otherwise static.
 */
export function MeasurementLine({
  label,
  progress,
  className,
}: {
  label: string;
  progress?: number;
  className?: string;
}) {
  return (
    <div aria-hidden className={cx("flex items-center gap-2 text-bone/121", className)}>
      <span className="font-mono text-[10px]">&lt;</span>
      <span className="relative h-px flex-1 bg-bone/36">
        {progress !== undefined && (
          <span
            className="absolute left-0 top-0 h-px bg-crimson/80 transition-[width] duration-300"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        )}
        <span className="absolute left-0 top-1/2 h-1.5 w-px -translate-y-1/2 bg-bone/41" />
        <span className="absolute right-0 top-1/2 h-1.5 w-px -translate-y-1/2 bg-bone/41" />
      </span>
      <span className="whitespace-nowrap font-mono text-[10px] tracking-widest">{label}</span>
      <span className="relative h-px flex-1 bg-bone/36" />
      <span className="font-mono text-[10px]">&gt;</span>
    </div>
  );
}

/**
 * Crimson annotation: elbow line ending in a small label.
 * Side controls which edge the elbow enters from.
 */
export function AnnotationLine({
  label,
  side = "right",
  className,
}: {
  label: string;
  side?: "left" | "right";
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cx(
        "pointer-events-none absolute flex items-center gap-0 text-crimson/80",
        side === "right" ? "flex-row" : "flex-row-reverse",
        className,
      )}
    >
      <span className="block h-px w-10 bg-crimson/60" />
      <span className="block h-6 w-px bg-crimson/60" />
      <span className="ml-1 font-mono text-[9px] tracking-widest">{label}</span>
    </div>
  );
}

/** Tiny fake-survey coordinates: 43°12'08" / X: 004 / Y: 018 */
export function Coordinates({
  lat = "43° 12' 08\"",
  lon = "18° 04' 32\"",
  x = 4,
  y = 18,
  z = 2,
  className,
}: {
  lat?: string;
  lon?: string;
  x?: number;
  y?: number;
  z?: number;
  className?: string;
}) {
  return (
    <div aria-hidden className={cx("space-y-0.5 font-mono text-[9px] leading-relaxed text-bone/41", className)}>
      <div>{lat}</div>
      <div>{lon}</div>
      <div className="text-bone/36">
        X: {pad(x, 3)} · Y: {pad(y, 3)} · Z: {pad(z, 3)}
      </div>
    </div>
  );
}

/** Specimen tag: bordered plate chip, e.g. SPECIMEN / 001 — HUMAN */
export function SpecimenTag({
  children,
  active,
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-block border px-2 py-1 font-mono text-[9px] tracking-archive",
        active
          ? "border-crimson/60 text-crimson"
          : "border-bone/26 text-bone/60",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Vertical crimson reference line with optional node ticks. */
export function RedLine({
  nodes = 0,
  className,
}: {
  nodes?: number;
  className?: string;
}) {
  return (
    <div aria-hidden className={cx("pointer-events-none absolute inset-y-0 w-px", className)}>
      <div className="h-full w-px bg-gradient-to-b from-transparent via-crimson/50 to-transparent" />
      {Array.from({ length: nodes }).map((_, i) => (
        <span
          key={i}
          className="absolute left-1/2 h-1 w-1 -translate-x-1/2 rotate-45 bg-crimson/70"
          style={{ top: `${((i + 1) / (nodes + 1)) * 100}%` }}
        />
      ))}
    </div>
  );
}

/** Orbital path: concentric thin ellipses with a node, pure SVG. */
export function OrbitalPath({
  rings = 3,
  className,
}: {
  rings?: number;
  className?: string;
}) {
  const size = 200;
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
      className={cx("pointer-events-none", className)}
      fill="none"
      stroke="currentColor"
    >
      {Array.from({ length: rings }).map((_, i) => {
        const r = 28 + i * 26;
        return (
          <ellipse
            key={i}
            cx={size / 2}
            cy={size / 2}
            rx={r}
            ry={r * 0.62}
            strokeWidth="0.4"
            stroke="currentColor"
            className="text-bone/26"
          />
        );
      })}
      <circle cx={size / 2 + 92} cy={size / 2} r="1.6" className="fill-crimson/80" stroke="none" />
      <circle cx={size / 2} cy={size / 2 - 55} r="1" className="fill-bone/65" stroke="none" />
    </svg>
  );
}

/** Small right-arrow used across CTAs. */
export function ArrowRight({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={cx("h-3 w-3", className)} fill="none" stroke="currentColor" strokeWidth="1">
      <line x1="1" y1="8" x2="14" y2="8" />
      <path d="M9 3l5 5-5 5" />
    </svg>
  );
}

/** Plate index: 01 ─────────── 04 */
export function PlateIndex({ from, to, className }: { from: string; to: string; className?: string }) {
  return (
    <div aria-hidden className={cx("flex items-center gap-2 font-mono text-[9px] text-bone/46", className)}>
      <span>{from}</span>
      <span className="h-px w-14 bg-bone/26" />
      <span>{to}</span>
    </div>
  );
}
