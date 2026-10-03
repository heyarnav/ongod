import "server-only";

import crypto from "node:crypto";
import Razorpay from "razorpay";

/**
 * Razorpay integration. Server-only — the secret key is read here and never
 * leaves the server.
 *
 * Three facts this module is careful about:
 *
 *   1. `isRazorpayConfigured()` is the switch for the whole payment path.
 *      With no keys, checkout behaves exactly as it did before any of this
 *      existed: the order is created and payment_status stays PENDING. The
 *      store does not break while onboarding is in progress.
 *   2. Nothing here ever returns invented payment data. An unconfigured
 *      gateway throws; it does not fabricate an order id that would then be
 *      stored against an order.
 *   3. Signature verification is the only thing that may write payment state,
 *      and it is verified against the exact string Razorpay signs.
 */

export type CheckoutIntent = {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  keyId: string | null;
  gateway: "razorpay" | "pending";
  gatewayOrderId: string | null;
};

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/** A cached instance; the SDK holds an HTTP agent we do not want per-call. */
let client: Razorpay | null = null;

function razorpay(): Razorpay {
  if (!isRazorpayConfigured()) {
    throw new Error("RAZORPAY_NOT_CONFIGURED");
  }
  if (!client) {
    client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID as string,
      key_secret: process.env.RAZORPAY_KEY_SECRET as string,
    });
  }
  return client;
}

/**
 * Create the gateway order for one application order.
 *
 * `receipt` is our own order number, so a payment that turns up in the
 * Razorpay dashboard without context can be traced straight back to an order
 * here. Amounts are minor units (paise) on both sides.
 */
export async function createGatewayOrder(
  amount: number,
  receipt: string,
  notes?: Record<string, string>,
): Promise<string> {
  // The SDK returns a promise-like; awaiting it is required for `.id`.
  const order = await razorpay().orders.create({
    amount,
    currency: "INR",
    receipt,
    notes: notes ?? {},
    // Auto-capture: a successful payment is captured immediately, so the
    // webhook that marks the order PAID fires without a second call.
    payment_capture: true,
  });
  return order.id;
}

/**
 * Verify the signature Checkout returns after a successful payment.
 *
 * Razorpay signs exactly `razorpay_order_id + "|" + razorpay_payment_id` with
 * the key secret. A constant-time comparison avoids leaking the expected value
 * through timing.
 */
export function verifyCheckoutSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  signature: string,
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  if (!razorpayOrderId || !razorpayPaymentId || !signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function publicKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID ?? process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? null;
}