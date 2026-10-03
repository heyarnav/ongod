/**
 * Formatting + tiny utils. Server & client safe.
 *
 * NOTE: order numbers are NOT generated here. They come from the database
 * (`generate_order_number()` in supabase/migrations/0002_functions.sql) so a
 * number can never collide and is assigned inside the ordering transaction.
 */

export function formatINR(minor: number): string {
  const rupees = minor / 100;
  const hasFraction = !Number.isInteger(rupees);
  return (
    "₹" +
    rupees.toLocaleString("en-IN", {
      maximumFractionDigits: hasFraction ? 2 : 0,
      minimumFractionDigits: hasFraction ? 2 : 0,
    })
  );
}

export function pad(n: number | string, width = 2): string {
  return String(n).padStart(width, "0");
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export const SIZE_AXIS = ["XS", "S", "M", "L", "XL", "XXL"] as const;

export function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
