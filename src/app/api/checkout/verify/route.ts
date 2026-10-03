import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, requireCustomer } from "@/lib/supabase/session";
import { verifyRazorpaySignature } from "@/lib/razorpay";

/**
 * Payment verification — server-side only, and DORMANT.
 *
 * This route exists so the schema and the seam stay ready, not because
 * Razorpay is switched on. With no credentials configured the signature check
 * can never succeed, so no order is ever marked PAID through this path.
 *
 * When it is eventually activated: the HMAC is verified before anything is
 * written, and the order must already carry the gateway order id we issued.
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

  const { orderNumber, razorpayOrderId, razorpayPaymentId, razorpaySignature } =
    parsed.data;

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

  const valid = await verifyRazorpaySignature(
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  );

  if (!valid) {
    await supabase
      .from("orders")
      .update({ payment_status: "FAILED" })
      .eq("id", order.id);
    return NextResponse.json({ error: "SIGNATURE_INVALID" }, { status: 400 });
  }

  await supabase
    .from("orders")
    .update({
      payment_status: "PAID",
      status: "PAID",
      gateway_payment_id: razorpayPaymentId,
      gateway_signature: razorpaySignature,
    })
    .eq("id", order.id);

  return NextResponse.json({ ok: true });
}