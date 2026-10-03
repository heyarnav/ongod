import { ReactNode } from "react";

export function AdminPageHeader({
  section,
  title,
  note,
  action,
}: {
  section: string;
  title: string;
  note?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-mono text-[10px] tracking-[0.3em] text-crimson">{section}</p>
        <h1 className="mt-2 font-serif text-3xl text-bone">{title}</h1>
        {note && <p className="mt-1 font-mono text-[11px] text-faint">{note}</p>}
      </div>
      {action}
    </div>
  );
}

export function Chip({ tone, children }: { tone: "ok" | "warn" | "off" | "info"; children: ReactNode }) {
  const tones = {
    ok: "border-bone/41 text-bone",
    warn: "border-crimson/60 text-crimson",
    off: "border-line text-faint",
    info: "border-faint/40 text-faint",
  } as const;
  return (
    <span className={`inline-block border px-2 py-0.5 font-mono text-[9px] tracking-[0.2em] ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function StatusChip({ status }: { status: string }) {
  const label = status.replace(/_/g, " ");
  const tone =
    status === "PUBLISHED" ||
    status === "PAID" ||
    status === "DELIVERED" ||
    status === "PRE_ORDER"
      ? "ok"
      : status === "DRAFT" ||
          status === "PENDING" ||
          status === "COMING_SOON"
        ? "off"
        : status === "ARCHIVED" ||
            status === "CANCELLED" ||
            status === "FAILED" ||
            status === "SOLD_OUT"
          ? "warn"
          : "info";
  return <Chip tone={tone}>{label}</Chip>;
}
