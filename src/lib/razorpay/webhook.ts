import "server-only";

import crypto from "node:crypto";

/**
 * Razorpay webhook authenticity.
 *
 * This is separate from src/lib/razorpay/index.ts on purpose. A webhook is
 * signed over the RAW request body, so the signature has to be checked before
 * anything parses the payload — a re-serialised JSON body does not hash to the
 * same value, and a webhook verified after parsing is a webhook that can be
 * forged by reordering keys.
 */

/** Header Razorpay sends the HMAC in. */
export const WEBHOOK_SIGNATURE_HEADER = "x-razorpay-signature";

export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** The slice of a Razorpay payment object this application acts on. */
export type WebhookPayment = {
  id: string;
  order_id: string;
  status: string;
  amount: number;
  currency: string;
  method?: string;
  error_code?: string | null;
  error_description?: string | null;
};

export type WebhookEvent = {
  event: string;
  payload: {
    payment?: {
      entity?: WebhookPayment | null;
    };
    refund?: {
      entity?: {
        id: string;
        amount: number;
        status: string;
        notes?: Record<string, string> | null;
      } | null;
    };
  };
};

/**
 * Parse the event body after the signature has been verified.
 *
 * Deliberately forgiving about shape and strict about identity: a malformed
 * body yields an event we ignore, never a payment we act on without both ids.
 */
export function parseWebhookEvent(rawBody: string): WebhookEvent | null {
  try {
    const parsed = JSON.parse(rawBody) as WebhookEvent;
    if (!parsed || typeof parsed.event !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function paymentOf(event: WebhookEvent): WebhookPayment | null {
  const p = event.payload?.payment?.entity;
  if (!p || typeof p.id !== "string" || typeof p.order_id !== "string") return null;
  return p;
}

/**
 * Whether a refund actually settled.
 *
 * `refund.processed` is the event that matters; `refund.failed` and the
 * `refund.closed` family must not be allowed to mark money as returned.
 */
export function isSettledRefund(event: WebhookEvent): boolean {
  return event.event === "refund.processed" || event.event === "refund.settled";
}