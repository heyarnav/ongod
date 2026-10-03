import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/AdminTable";
import { OrderRow } from "@/components/admin/OrderRow";

export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const { data } = await createAdminClient()
    .from("orders")
    .select(
      `id, order_number, shipping_name, email, shipping_phone, status, payment_status,
       subtotal, shipping_amount, total, currency, gateway_payment_id, gateway_order_id,
       refund_required, paid_at, reservation_expires_at,
       shipping_address_line_1, shipping_address_line_2, shipping_city,
       shipping_state, shipping_postal_code, tracking_number, tracking_url,
       placed_at, created_at,
       order_items ( id, product_name, variant_size, unit_price, quantity,
                     drop_status, edition_label, tracking_note )`,
    )
    .order("placed_at", { ascending: false });

  const orders = data ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        section="SECTION 04"
        title="Orders"
        note="Acquisitions. Move each order through production with the status control."
      />

      {orders.length === 0 ? (
        <p className="mt-8 border border-line p-6 font-mono text-[11px] text-faint">
          No orders recorded.
        </p>
      ) : (
        <ul className="mt-8 border border-line">
          {orders.map((o, i) => (
            <OrderRow
              key={String(o.id)}
              order={{
                id: String(o.id),
                number: String(o.order_number),
                customerName: String(o.shipping_name ?? ""),
                email: String(o.email ?? ""),
                phone: String(o.shipping_phone ?? ""),
                // The FROZEN snapshot stored at checkout — not a live read of
                // the customer's address book.
                address: [
                  o.shipping_address_line_1,
                  o.shipping_address_line_2,
                  o.shipping_city,
                  o.shipping_state,
                  o.shipping_postal_code,
                ]
                  .filter(Boolean)
                  .join(", "),
                total: Number(o.total ?? 0),
                paymentStatus: String(o.payment_status ?? "PENDING"),
                status: String(o.status ?? "PENDING"),
                razorpayPaymentId: String(o.gateway_payment_id ?? ""),
                razorpayOrderId: String(o.gateway_order_id ?? ""),
                refundRequired: o.refund_required === true,
                reservationExpiresAt: String(o.reservation_expires_at ?? ""),
                paidAt: String(o.paid_at ?? ""),
                trackingNumber: String(o.tracking_number ?? ""),
                trackingUrl: String(o.tracking_url ?? ""),
                createdAt: new Date(String(o.placed_at ?? o.created_at)).toISOString(),
                items: ((o.order_items ?? []) as Array<Record<string, unknown>>).map((it) => ({
                  id: String(it.id),
                  name: String(it.product_name ?? ""),
                  size: String(it.variant_size ?? ""),
                  quantity: Number(it.quantity ?? 1),
                  price: Number(it.unit_price ?? 0),
                  dropStatus: String(it.drop_status ?? ""),
                  editionLabel: String(it.edition_label ?? ""),
                  trackingNote: String(it.tracking_note ?? ""),
                })),
              }}
              first={i === 0}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
