import { cx } from "@/lib/format";

type Tone = "default" | "crimson" | "faint";

/**
 * Tiny monospaced archival metadata: ARCHIVE / 001, OBJECT / FORM, FIG. 03 …
 */
export function ArchiveLabel({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-block font-mono text-[10px] tracking-archive",
        tone === "default" && "text-bone/65",
        tone === "crimson" && "text-crimson",
        tone === "faint" && "text-bone/41",
        className,
      )}
    >
      {children}
    </span>
  );
}
