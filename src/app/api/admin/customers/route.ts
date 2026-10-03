import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/supabase/session";

/**
 * Control Room: customers and their order history.
 *
 * Only ever reached after requireAdmin(). The service role can see rows RLS
 * keeps away from the storefront — that is the point of an operator view.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.error === "UNAUTHENTICATED" ? 401 : 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const supabase = createAdminClient();

  // Single customer, with the orders they have placed.
  if (id) {
    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!customer) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const { data: orders } = await supabase
      .from("orders")
      .select(
        "id, order_number, status, payment_status, subtotal, shipping_amount, total, currency, placed_at",
      )
      .eq("customer_id", id)
      .order("placed_at", { ascending: false });

    const { data: addresses } = await supabase
      .from("addresses")
      .select("id, label, name, phone, address_line_1, address_line_2, city, state, postal_code, country, is_default")
      .eq("customer_id", id)
      .order("is_default", { ascending: false });

    return NextResponse.json({
      customer: {
        id: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        createdAt: customer.created_at,
      },
      orders: orders ?? [],
      addresses: addresses ?? [],
    });
  }

  const { data, error } = await supabase
    .from("customers")
    .select("id, email, name, phone, created_at, orders ( id, total, payment_status, placed_at )")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    customers: (data ?? []).map((c) => {
      const orders = (c.orders as Array<Record<string, unknown>>) ?? [];
      return {
        id: c.id,
        email: c.email,
        name: c.name,
        phone: c.phone,
        createdAt: c.created_at,
        orderCount: orders.length,
        lifetimeValue: orders
          .filter((o) => o.payment_status === "PAID")
          .reduce((sum, o) => sum + Number(o.total ?? 0), 0),
      };
    }),
  });
}