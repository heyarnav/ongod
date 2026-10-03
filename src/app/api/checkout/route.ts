import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/supabase/session";
import { recordEvent } from "@/lib/analytics";
import { createGatewayOrder, isRazorpayConfigured, publicKeyId } from "@/lib/razorpay";

/**
 * Order placement.
 *
 * This route deliberately does almost nothing. It validates shape, establishes
 * WHO is ordering, and hands the whole job to the `place_order` Postgres
 * function. Prices, stock, totals, product status and the pre-order window are
 * re-derived inside the database — nothing in the request body is trusted, and
 * there is no customer id parameter to forge because the function reads
 * `auth.uid()` itself.
 *
 * The call goes through the request-scoped Supabase client (not the service
 * role) precisely so the caller's JWT is attached: that is what makes
 * `auth.uid()` resolve and what makes RLS mean anything.
 *
 * The application order is created FIRST and the gateway order second. That
 * order matters: if Razorpay is unreachable we still hold the stock for this
 * customer and can retry the gateway leg through /api/checkout/gateway without
 * creating a second order or decrementing inventory twice.
 */
const ItemSchema = z.object({
  productId: z.string().min(1),
  size: z.string().min(1),
  quantity: z.number().int().min(1).max(10),
});

const CheckoutSchema = z.object({
  customer: z.object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    phone: z.string().min(5).max(20),
    addressLine1: z.string().min(1).max(200),
    addressLine2: z.string().max(200).default(""),
    city: z.string().min(1).max(80),
    state: z.string().min(1).max(80),
    postalCode: z.string().min(4).max(10),
    country: z.string().default("IN"),
  }),
  items: z.array(ItemSchema).min(1).max(20),
  // Optional: which saved address this order used. Never trusted — the
  // function re-checks that it belongs to the ordering customer, and the
  // typed fields below are what actually ship either way.
  addressId: z.string().uuid().nullish(),
  saveAddress: z.boolean().optional(),
  /** How long to hold the stock while payment is outstanding. */
  reservationMinutes: z.number().int().min(5).max(1440).optional(),
});

/** Messages place_order raises, mapped to codes the client already speaks. */
const CONFLICT_PREFIXES = [
  "STOCK_DEPLETED",
  "OBJECT_UNAVAILABLE",
  "NOT_ORDERABLE",
  "WINDOW_CLOSED",
  "SIZE_UNAVAILABLE",
];

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }

  const { customer: form, items, addressId, saveAddress, reservationMinutes } = parsed.data;

  // 1. Authenticate. The OTP has already been redeemed by the time this runs;
  //    if it was not, the order is never created and no inventory moves.
  const auth = await requireCustomer();
  if (!auth.ok) {
    return NextResponse.json({ error: "SIGN_IN_REQUIRED" }, { status: 401 });
  }
  const customer = auth.customer;

  // 2. The order's contact identity comes from the session, not the form.
  const email = customer.email || form.email;

  try {
    const supabase = await createClient();

    const { data, error } = await supabase.rpc("place_order", {
      p_items: items.map((i) => ({
        product_id: i.productId,
        size: i.size,
        quantity: i.quantity,
      })),
      p_address: {
        name: form.name,
        phone: form.phone,
        address_line_1: form.addressLine1,
        address_line_2: form.addressLine2,
        city: form.city,
        state: form.state,
        postal_code: form.postalCode,
        country: form.country,
      },
      p_address_id: addressId ?? null,
      p_save_address: saveAddress ?? false,
      p_reservation_minutes: reservationMinutes ?? 30,
    });

    if (error) {
      const message = error.message ?? "";
      if (CONFLICT_PREFIXES.some((p) => message.startsWith(p))) {
        return NextResponse.json({ error: message }, { status: 409 });
      }
      if (message.startsWith("UNAUTHENTICATED") || message.startsWith("CUSTOMER_NOT_FOUND")) {
        return NextResponse.json({ error: "SIGN_IN_REQUIRED" }, { status: 401 });
      }
      if (message.startsWith("EMPTY_CART")) {
        return NextResponse.json({ error: "EMPTY_CART" }, { status: 400 });
      }
      if (message.startsWith("INVALID_QUANTITY") || message.startsWith("INVALID_SIZE")) {
        return NextResponse.json({ error: message }, { status: 400 });
      }
      console.error("place_order failed:", error);
      return NextResponse.json({ error: "CHECKOUT_FAILED" }, { status: 500 });
    }

    const order = (data ?? {}) as {
      order_id: string;
      order_number: string;
      subtotal: number;
      shipping: number;
      total: number;
      currency: string;
      reservation_expires_at?: string | null;
    };

    // The one event that must never come from the browser: it is written here,
    // from the order the database just committed.
    await recordEvent({
      name: "ORDER_PLACED",
      path: "/checkout",
      customerId: customer.id,
      referrer: req.headers.get("referer") ?? "",
      meta: {
        orderNumber: order.order_number,
        total: order.total,
        lines: items.reduce((n, l) => n + l.quantity, 0),
      },
    });

    // 3. Gateway leg. Best effort by design: the order and its stock hold
    //    already exist, so a Razorpay outage degrades to "retry payment"
    //    rather than losing the order.
    const configured = isRazorpayConfigured();
    let gatewayOrderId: string | null = null;
    let gateway: "razorpay" | "pending" = "pending";
    let gatewayError: string | null = null;

    if (configured) {
      try {
        gatewayOrderId = await createGatewayOrder(order.total, order.order_number, {
          order_id: order.order_id,
        });

        // The service-role client writes this column: the customer's own client
        // is not permitted to, and that restriction is deliberate.
        const { createAdminClient } = await import("@/lib/supabase/admin");
        const { error: linkErr } = await createAdminClient()
          .from("orders")
          .update({ gateway_order_id: gatewayOrderId })
          .eq("id", order.order_id);
        if (linkErr) {
          // The order exists but cannot be tied to the gateway order. Say so
          // rather than pretending the flow can continue.
          gatewayError = "GATEWAY_LINK_FAILED";
          console.error("could not store gateway_order_id:", linkErr.message);
        } else {
          gateway = "razorpay";
        }
      } catch (err) {
        gatewayError = "GATEWAY_UNAVAILABLE";
        console.error("razorpay order creation failed:", (err as Error).message);
      }
    }

    return NextResponse.json({
      orderId: order.order_id,
      orderNumber: order.order_number,
      amount: order.total,
      currency: order.currency,
      gateway,
      gatewayOrderId,
      keyId: gateway === "razorpay" ? publicKeyId() : null,
      gatewayError,
      reservationExpiresAt: order.reservation_expires_at ?? null,
    });
  } catch (err) {
    console.error("checkout failed:", err);
    return NextResponse.json({ error: "CHECKOUT_FAILED" }, { status: 500 });
  }
}