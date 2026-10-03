import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/session";

/**
 * Control Room: inspect and move one order.
 *
 * The shipping_* columns returned here are the FROZEN snapshot stored at
 * checkout. They are never re-read from the customer's address book, which is
 * exactly why an old order keeps showing the address it actually shipped to.
 */

const OrderStatus = z.enum([
  "PENDING",
  "PAID",
  "IN_PRODUCTION",
  "QUALITY_CHECK",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
]);

const UpdateInput = z.object({
  status: OrderStatus.optional(),
  paymentStatus: z.enum(["PENDING", "PAID", "FAILED", "REFUNDED"]).optional(),
  trackingNumber: z.string().max(120).optional(),
  trackingUrl: z.string().max(500).optional(),
  trackingNote: z.string().max(300).optional(),
});

type Params = { params: Promise<{ id: string }> };

function mapOrder(o: Record<string, unknown>) {
  const items = (o.order_items as Array<Record<string, unknown>>) ?? [];
  const customer = o.customers as unknown as Record<string, unknown> | null;
  const c = Array.isArray(customer) ? customer[0] : customer;

  return {
    id: o.id,
    number: o.order_number,
    customerId: o.customer_id,
    customerName: o.shipping_name,
    email: o.email,
    phone: o.shipping_phone,
    addressLine1: o.shipping_address_line_1,
    addressLine2: o.shipping_address_line_2,
    city: o.shipping_city,
    state: o.shipping_state,
    postalCode: o.shipping_postal_code,
    country: o.shipping_country,
    address: [
      o.shipping_address_line_1,
      o.shipping_address_line_2,
      o.shipping_city,
      o.shipping_state,
      o.shipping_postal_code,
    ]
      .filter(Boolean)
      .join(", "),
    status: o.status,
    paymentStatus: o.payment_status,
    subtotal: o.subtotal,
    shipping: o.shipping_amount,
    total: o.total,
    currency: o.currency,
    trackingNumber: o.tracking_number,
    trackingUrl: o.tracking_url,
    placedAt: o.placed_at,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    customerAccount: c ? { id: c.id, email: c.email, name: c.name } : null,
    items: items.map((i) => ({
      id: i.id,
      productId: i.product_id,
      variantId: i.variant_id,
      name: i.product_name,
      size: i.variant_size,
      price: i.unit_price,
      quantity: i.quantity,
      imageUrl: i.image_url,
      dropStatus: i.drop_status,
      editionLabel: i.edition_label,
      trackingNote: i.tracking_note,
    })),
    _count: { items: items.length },
  };
}

const ORDER_SELECT = `
  id, order_number, customer_id, address_id, status, payment_status,
  subtotal, shipping_amount, total, currency,
  shipping_name, shipping_phone, shipping_address_line_1, shipping_address_line_2,
  shipping_city, shipping_state, shipping_postal_code, shipping_country, email,
  gateway_order_id, gateway_payment_id, tracking_number, tracking_url,
  placed_at, created_at, updated_at,
  customers ( id, email, name ),
  order_items ( * )
`;

async function authorize() {
  const auth = await requireAdmin();
  if (auth.ok) return null;
  return NextResponse.json({ error: auth.error }, { status: auth.error === "UNAUTHENTICATED" ? 401 : 403 });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const denied = await authorize();
  if (denied) return denied;

  const { id } = await params;
  const { data } = await createAdminClient()
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!data) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  return NextResponse.json({ order: mapOrder(data as unknown as Record<string, unknown>) });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const denied = await authorize();
  if (denied) return denied;

  const { id } = await params;
  const parsed = UpdateInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {};

  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.paymentStatus !== undefined) patch.payment_status = parsed.data.paymentStatus;
  if (parsed.data.trackingNumber !== undefined) patch.tracking_number = parsed.data.trackingNumber;
  if (parsed.data.trackingUrl !== undefined) patch.tracking_url = parsed.data.trackingUrl;

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("orders").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // A per-line shipping note lives on the item, not the order.
  if (parsed.data.trackingNote !== undefined) {
    await supabase
      .from("order_items")
      .update({ tracking_note: parsed.data.trackingNote })
      .eq("order_id", id);
  }

  const { data } = await supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .single();

  return NextResponse.json({ order: mapOrder(data as unknown as Record<string, unknown>) });
}