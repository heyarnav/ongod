import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireCustomer } from "@/lib/supabase/session";
import { verifyCheckoutSignature } from "@/lib/razorpay";

/**
 * Payment verification — the fast path after Razorpay Checkout returns.
 *
 * The WEBHOOK remains authoritative; this exists so the confirmation screen can
 * resolve in a second instead of waiting for Razorpay to call us back. Both
 * routes funnel into the same idempotent `mark_order_paid()`, so whichever
 * arrives first wins and the second is a no-op that reports the truth.
 *
 * What is checked before anything is written:
 *
 *   - the order exists and carries the gateway order id WE issued, so a
 *     browser cannot point an unrelated order id at a real payment;
 *   - the caller is the customer who owns it, or Control Room staff;
 *   - the HMAC over `razorpay_order_id|razorpay_payment_id` matches.
 *
 * A failed verification does NOT mark the order FAILED. A failed *signature* is
 * evidence of tampering, not evidence that the customer's card was declined, and
 * conflating the two would cancel an order whose money may well have arrived.
 */
const VerifySchema = z.object({
  orderNumber: z.string().min(3),
  razorpayOrderId: z.string().min(3),
  razorpayPaymentId: z.string().min(3),
  razorpaySignature: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = VerifySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const { orderNumber, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

  // The caller must be the customer who owns the order, or Control Room staff.
  const auth = await requireCustomer();
  const isOwner = auth.ok;

  const supabase = createAdminClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, customer_id, gateway_order_id")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (!order || order.gateway_order_id !== razorpayOrderId) {
    return NextResponse.json({ error: "ORDER_MISMATCH" }, { status: 404 });
  }

  const allowed = isOwner
    ? auth.customer.id === order.customer_id
    : (await requireAdmin()).ok;

  if (!allowed) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (!verifyCheckoutSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
    console.warn(
      `[checkout-verify] signature mismatch for order ${orderNumber} (payment ${razorpayPaymentId})`,
    );
    return NextResponse.json({ error: "SIGNATURE_INVALID" }, { status: 400 });
  }

  // The single writer of payment state.
  const { data, error } = await supabase.rpc("mark_order_paid", {
    p_razorpay_payment_id: razorpayPaymentId,
    p_razorpay_signature: razorpaySignature,
    p_razorpay_order_id: razorpayOrderId,
  });

  if (error) {
    console.error("mark_order_paid failed:", error.message);
    return NextResponse.json({ error: "VERIFY_FAILED" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, order: data });
}