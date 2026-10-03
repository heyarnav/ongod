/**
 * Razorpay integration seam.
 *
 * The secret key lives ONLY on the server. The browser never sees it.
 * Today this module creates the order record and returns a "pending gateway"
 * response; wiring the real razorpay SDK is a server-only change:
 *
 *   1. `npm i razorpay`
 *   2. Fill in createGatewayOrder() with new Razorpay({ key_id, key_secret }).orders.create(...)
 *   3. Implement verifySignature() with crypto.createHmac('sha256', key_secret)
 *   4. The /api/checkout/verify route already validates the payload shape.
 *
 * No fake payment logic is implemented.
 */

export type CheckoutIntent = {
  orderId: string; // internal order id (cuid)
  orderNumber: string; // human-readable OG-XXXXXX
  amount: number; // minor units (paise)
  currency: string;
  keyId: string | null; // public key id — safe for the browser
  gateway: "razorpay" | "pending";
  /** Present only when the gateway is wired; the browser opens Razorpay Checkout with this. */
  gatewayOrderId: string | null;
};

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/**
 * Server-side only. Creates the gateway order once the SDK is added.
 * Placeholder throws unless configured — never returns invented payment data.
 */
export async function createGatewayOrder(_amount: number, _receipt: string): Promise<string> {
  if (!isRazorpayConfigured()) {
    throw new Error("RAZORPAY_NOT_CONFIGURED");
  }
  // TODO(server): const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! });
  // TODO(server): const order = await rzp.orders.create({ amount, currency: "INR", receipt });
  // TODO(server): return order.id;
  throw new Error("RAZORPAY_NOT_CONFIGURED");
}

/** Server-side only. HMAC verification of the checkout handler response. */
export async function verifyRazorpaySignature(
  _razorpayOrderId: string,
  _razorpayPaymentId: string,
  _signature: string,
): Promise<boolean> {
  if (!isRazorpayConfigured()) return false;
  // TODO(server): const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
  //   .update(`${razorpayOrderId}|${razorpayPaymentId}`).digest("hex");
  // TODO(server): return expected === signature;
  return false;
}

export function publicKeyId(): string | null {
  return process.env.RAZORPAY_KEY_ID ?? null;
}
