/**
 * ADDRESS BOOK — shared constants (client-safe: no Node imports here).
 *
 * An Address is a saved destination, not a source of truth for an order:
 * checkout freezes its own copy onto the Order, so editing or deleting an
 * address here never rewrites what was actually shipped.
 */

export const ADDRESS_LABELS = ["HOME", "WORK", "OTHER"] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

export const ADDRESS_LABEL_TEXT: Record<AddressLabel, string> = {
  HOME: "Home",
  WORK: "Work",
  OTHER: "Other",
};

/** A customer keeps a small book; the register stays readable. */
export const ADDRESS_LIMITS = { max: 10 };

/** The shape the API returns and the UI renders. */
export type SavedAddress = {
  id: string;
  label: string;
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

/** One-line rendering for the address list and the checkout picker. */
export function formatAddress(
  a: Pick<SavedAddress, "line1" | "line2" | "city" | "state" | "postalCode">,
): string {
  return [a.line1, a.line2, `${a.city} ${a.postalCode}`.trim(), a.state]
    .filter(Boolean)
    .join(", ");
}