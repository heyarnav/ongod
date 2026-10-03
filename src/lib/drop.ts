/**
 * DROP STATUS — the release lifecycle system.
 *
 * A drop (archive object) moves through:
 *   DRAFT → COMING_SOON → PRE_ORDER → PRE_ORDER_CLOSED → IN_PRODUCTION
 *         → FULFILLING → SOLD_OUT → ARCHIVED
 *
 * `dropStatus` is authoritative (set from the Control Room). The pre-order
 * window dates are display/advisory data; when both dates exist they derive
 * a suggested state, but nothing security-sensitive relies on client clocks —
 * orderability is enforced server-side in /api/checkout.
 */

export const DROP_STATUSES = [
  "DRAFT",
  "COMING_SOON",
  "PRE_ORDER",
  "PRE_ORDER_CLOSED",
  "IN_PRODUCTION",
  "FULFILLING",
  "SOLD_OUT",
  "ARCHIVED",
] as const;

export type DropStatus = (typeof DROP_STATUSES)[number];

/** States in which the object can be acquired. Server-enforced too. */
export const ORDERABLE: readonly DropStatus[] = ["PRE_ORDER"];

/** Human label per state, in the archive voice. */
export const DROP_LABEL: Record<DropStatus, string> = {
  DRAFT: "DRAFT",
  COMING_SOON: "COMING SOON",
  PRE_ORDER: "PRE-ORDER",
  PRE_ORDER_CLOSED: "PRE-ORDER CLOSED",
  IN_PRODUCTION: "IN PRODUCTION",
  FULFILLING: "FULFILLING",
  SOLD_OUT: "SOLD OUT",
  ARCHIVED: "ARCHIVED",
};

/** Status line shown under the label on product surfaces. */
export const DROP_HEADLINE: Record<DropStatus, string> = {
  DRAFT: "THE OBJECT IS BEING PREPARED.",
  COMING_SOON: "THE PRE-ORDER WINDOW OPENS SOON.",
  PRE_ORDER: "THE FIRST EDITION IS OPEN FOR PRE-ORDER.",
  PRE_ORDER_CLOSED: "THE FIRST EDITION IS NOW IN PRODUCTION.",
  IN_PRODUCTION: "THE FIRST EDITION IS CURRENTLY BEING PRODUCED.",
  FULFILLING: "ORDERS ARE BEING PREPARED FOR DISPATCH.",
  SOLD_OUT: "THE ARCHIVE IS CLOSED.",
  ARCHIVED: "THIS OBJECT HAS BEEN SEALED.",
};

/** Effective state suggested by the pre-order window (advisory only). */
export function suggestedByWindow(
  startsAt: Date | null | undefined,
  endsAt: Date | null | undefined,
  now: Date = new Date(),
): DropStatus | null {
  if (!startsAt || !endsAt) return null;
  if (now < startsAt) return "COMING_SOON";
  if (now > endsAt) return "PRE_ORDER_CLOSED";
  return "PRE_ORDER";
}

export type DropInfo = {
  status: DropStatus;
  label: string;
  headline: string;
  orderable: boolean;
  editionLabel: string;
  preOrderStartsAt: Date | null;
  preOrderEndsAt: Date | null;
  productionPeriod: string;
  dispatchPeriod: string;
  preOrderNotice: string;
  statusMessage: string; // IN_PRODUCTION / FULFILLING / SOLD_OUT copy
  windowLabel: string; // "PRE-ORDER 21.09.26 — 28.09.26" or ""
};

/** Build the full drop view-model from a product row (server or client safe). */
export function dropInfo(p: {
  dropStatus?: string;
  editionLabel?: string;
  preOrderStartsAt?: Date | string | null;
  preOrderEndsAt?: Date | string | null;
  productionPeriod?: string;
  dispatchPeriod?: string;
  preOrderNotice?: string;
  inProductionMessage?: string;
  fulfillingMessage?: string;
  soldOutMessage?: string;
}): DropInfo {
  const status = (DROP_STATUSES as readonly string[]).includes(p.dropStatus ?? "")
    ? (p.dropStatus as DropStatus)
    : "DRAFT";

  const starts = toDate(p.preOrderStartsAt);
  const ends = toDate(p.preOrderEndsAt);

  const statusMessage =
    status === "IN_PRODUCTION"
      ? p.inProductionMessage || DROP_HEADLINE[status]
      : status === "FULFILLING"
        ? p.fulfillingMessage || DROP_HEADLINE[status]
        : status === "SOLD_OUT"
          ? p.soldOutMessage || DROP_HEADLINE[status]
          : DROP_HEADLINE[status];

  return {
    status,
    label: DROP_LABEL[status],
    headline: DROP_HEADLINE[status],
    orderable: ORDERABLE.includes(status),
    editionLabel: p.editionLabel || "FIRST EDITION",
    preOrderStartsAt: starts,
    preOrderEndsAt: ends,
    productionPeriod: p.productionPeriod ?? "",
    dispatchPeriod: p.dispatchPeriod ?? "",
    preOrderNotice: p.preOrderNotice ?? "",
    statusMessage,
    windowLabel: windowLabel(starts, ends),
  };
}

/** "PRE-ORDER 21.09.26 — 28.09.26" when both dates exist. */
export function windowLabel(starts: Date | null, ends: Date | null): string {
  if (!starts || !ends) return "";
  return `PRE-ORDER ${stamp(starts)} — ${stamp(ends)}`;
}

function stamp(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The six-step archival process shown in the pre-order information panel. */
export const PRE_ORDER_STEPS: Array<{ num: string; title: string; body: string }> = [
  { num: "01", title: "ORDER", body: "Place your order during the pre-order window." },
  { num: "02", title: "PRODUCTION", body: "Orders are sent into production after the pre-order window closes." },
  { num: "03", title: "QUALITY CHECK", body: "Each garment is inspected before packaging." },
  { num: "04", title: "PACKAGING", body: "Each order is individually packed by on god." },
  { num: "05", title: "DISPATCH", body: "Your package is handed to the shipping carrier." },
  { num: "06", title: "TRACKING", body: "Tracking information is sent after dispatch." },
];

/** Order workflow used by the Control Room. */
export const ORDER_STATUSES = [
  "PENDING",
  "PAID",
  "IN_PRODUCTION",
  "QUALITY_CHECK",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;

export const ORDER_STATUS_LABEL: Record<(typeof ORDER_STATUSES)[number], string> = {
  PENDING: "PENDING",
  PAID: "PAID",
  IN_PRODUCTION: "IN PRODUCTION",
  QUALITY_CHECK: "QUALITY CHECK",
  PACKED: "PACKED",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};
