/**
 * ORDER FULFILMENT TIMELINE — shared constants (client-safe).
 *
 * These describe how an order moves from placed to delivered. They are shown
 * on the order detail page and mirrored by the `orders_status_check`
 * constraint in 0001_initial_schema.sql.
 */
export const ORDER_TIMELINE = [
  "PENDING",
  "PAID",
  "IN_PRODUCTION",
  "QUALITY_CHECK",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
] as const;

export type TimelineStatus = (typeof ORDER_TIMELINE)[number];

export const TIMELINE_LABEL: Record<TimelineStatus, string> = {
  PENDING: "Ordered",
  PAID: "Payment confirmed",
  IN_PRODUCTION: "In production",
  QUALITY_CHECK: "Quality check",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
};

/** Index of the furthest reached stage (CANCELLED handled by the UI). */
export function timelineProgress(status: string): number {
  const idx = (ORDER_TIMELINE as readonly string[]).indexOf(status);
  if (idx >= 0) return idx;
  if (status === "PROCESSING") return 2;
  return 0;
}

/** Payment states, mirroring `orders_payment_status_check`. */
export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  PENDING: "Payment pending",
  PAID: "Payment confirmed",
  FAILED: "Payment failed",
  REFUNDED: "Refunded",
};