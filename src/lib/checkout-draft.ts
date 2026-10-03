"use client";

/**
 * Checkout draft — survives a refresh, never survives a payment.
 *
 * The problem this solves is narrow and real: a shopper with a multi-line
 * address form open who hits refresh, or whose browser decides to reload while
 * an OTP is arriving, currently loses everything they typed. sessionStorage
 * (not localStorage) because a draft is a property of this tab — a half-filled
 * checkout that reappears days later on another visit is worse than useless.
 *
 * What is NOT in here, deliberately:
 *   - no tokens or session material (the Supabase cookie owns that)
 *   - no card data of any kind (Razorpay's own sheet collects it, and it never
 *     touches this code)
 *   - nothing secret — the VPA, keys and service role are server-side
 *
 * Prices are not stored either. They come from the cart, which the server
 * re-prices regardless; a stale cached total in this file could only ever be
 * wrong in the customer's favour.
 */

const KEY = "ongod.archive.checkout.v1";

export type CheckoutDraft = {
  name: string;
  email: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
  /** Which saved address is selected, if any. Re-validated server-side. */
  picked: string | null;
  keepAddress: boolean;
  /** Pre-order timeline acknowledgement. */
  acknowledged: boolean;
};

/** Shape-checked on read: a stale or hand-edited value must not crash the form. */
function coerce(raw: unknown): CheckoutDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : "");
  return {
    name: str("name").slice(0, 120),
    email: str("email").slice(0, 200),
    phone: str("phone").slice(0, 20),
    address1: str("address1").slice(0, 200),
    address2: str("address2").slice(0, 200),
    city: str("city").slice(0, 80),
    state: str("state").slice(0, 80),
    pincode: str("pincode").slice(0, 10),
    picked: typeof o.picked === "string" ? o.picked : null,
    keepAddress: o.keepAddress === true,
    acknowledged: o.acknowledged === true,
  };
}

export function loadDraft(): CheckoutDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    return coerce(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveDraft(draft: CheckoutDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Private-mode Safari and a full quota both throw. Losing the draft is
    // survivable; failing to render the form is not.
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}