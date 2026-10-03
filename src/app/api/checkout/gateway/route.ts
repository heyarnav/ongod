import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCustomer } from "@/lib/supabase/session";
import { createGatewayOrder, isRazorpayConfigured, publicKeyId } from "@/lib/razorpay";

/**
 * Create-or-return the gateway order for an order that already exists.
 *
 * /api/checkout creates the application order first and the Razorpay order
 * second, so a Razorpay outage leaves a real order holding real stock and no
 * way to pay for it. This route closes that gap: the customer retries payment
 * and gets a gateway order for the order they already have.
 *
 * It is deliberately NOT idempotent-on-nothing. An order that already carries a
 * gateway_order_id returns that same id — creating a second Razorpay order for
 * one order is how a customer ends up paying twice.
 *
 * Ownership is re-checked here rather than trusted from the request, and the
 * reservation must still be live: paying for an order whose hold has expired
 * would take stock another shopper has been given.
 */

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  orderId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) {
    return NextResponse.json({ error: "SIGN_IN_REQUIRED" }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  if (!isRazorpayConfigured()) {
    return NextResponse.json({ error: "GATEWAY_NOT_CONFIGURED" }, { status: 503 });
  }

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, total, currency, customer_id, gateway_order_id, payment_status, reservation_expires_at")
    .eq("id", parsed.data.orderId)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  if (order.customer_id !== auth.customer.id) {
    // Not this customer's order. 404 rather than 403 so this cannot be used to
    // probe which order ids exist.
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  if (order.payment_status === "PAID") {
    return NextResponse.json({ error: "ALREADY_PAID" }, { status: 409 });
  }
  if (order.reservation_expires_at && new Date(order.reservation_expires_at) < new Date()) {
    return NextResponse.json({ error: "RESERVATION_EXPIRED" }, { status: 409 });
  }

  if (order.gateway_order_id) {
    return NextResponse.json({
      gateway: "razorpay",
      gatewayOrderId: order.gateway_order_id,
      keyId: publicKeyId(),
      amount: order.total,
      currency: order.currency,
    });
  }

  try {
    const gatewayOrderId = await createGatewayOrder(order.total, order.order_number, {
      order_id: order.id,
    });
    const { error } = await admin
      .from("orders")
      .update({ gateway_order_id: gatewayOrderId })
      .eq("id", order.id);
    if (error) throw new Error(error.message);

    return NextResponse.json({
      gateway: "razorpay",
      gatewayOrderId,
      keyId: publicKeyId(),
      amount: order.total,
      currency: order.currency,
    });
  } catch (err) {
    console.error("gateway retry failed:", (err as Error).message);
    return NextResponse.json({ error: "GATEWAY_UNAVAILABLE" }, { status: 502 });
  }
}