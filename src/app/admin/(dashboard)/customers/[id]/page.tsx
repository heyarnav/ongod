import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader, StatusChip } from "@/components/admin/AdminTable";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** One customer: who they are, what they bought, where they ship. */
export default async function AdminCustomerPage({ params }: Params) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!customer) notFound();

  const [{ data: orders }, { data: addresses }] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `id, order_number, status, payment_status, subtotal, shipping_amount, total,
         currency, placed_at, shipping_address_line_1, shipping_city,
         shipping_postal_code, order_items ( id )`,
      )
      .eq("customer_id", id)
      .order("placed_at", { ascending: false }),
    supabase
      .from("addresses")
      .select(
        "id, label, name, phone, address_line_1, address_line_2, city, state, postal_code, country, is_default",
      )
      .eq("customer_id", id)
      .order("is_default", { ascending: false }),
  ]);

  const lifetime = (orders ?? [])
    .filter((o) => o.payment_status === "PAID")
    .reduce((sum, o) => sum + Number(o.total ?? 0), 0);

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/admin/customers"
        className="font-mono text-[10px] tracking-[0.25em] text-faint hover:text-bone"
      >
        ← ALL CUSTOMERS
      </Link>

      <div className="mt-4">
        <AdminPageHeader
          section="SECTION 05"
          title={String(customer.name || customer.email)}
          note={`${customer.email}${customer.phone ? ` · ${customer.phone}` : ""}`}
        />
      </div>

      <div className="mt-8 grid grid-cols-3 gap-px border border-line bg-line">
        <div className="bg-abyss p-5">
          <p className="font-mono text-[9px] tracking-[0.3em] text-faint">ORDERS</p>
          <p className="mt-3 font-serif text-2xl text-bone">{orders?.length ?? 0}</p>
        </div>
        <div className="bg-abyss p-5">
          <p className="font-mono text-[9px] tracking-[0.3em] text-faint">LIFETIME</p>
          <p className="mt-3 font-serif text-2xl text-bone">
            ₹{(lifetime / 100).toLocaleString("en-IN")}
          </p>
        </div>
        <div className="bg-abyss p-5">
          <p className="font-mono text-[9px] tracking-[0.3em] text-faint">SINCE</p>
          <p className="mt-3 font-serif text-2xl text-bone">
            {new Date(String(customer.created_at)).toISOString().slice(0, 10)}
          </p>
        </div>
      </div>

      <h2 className="mt-12 font-mono text-[11px] tracking-[0.3em] text-faint">ORDER HISTORY</h2>
      {(orders ?? []).length === 0 ? (
        <p className="mt-4 border border-line p-5 font-mono text-[11px] text-faint">
          No orders recorded.
        </p>
      ) : (
        <ul className="mt-4 border border-line">
          {orders!.map((o, i) => {
            const items = (o.order_items as Array<unknown>) ?? [];
            return (
              <li
                key={String(o.id)}
                className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${
                  i > 0 ? "border-t border-line" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="font-mono text-[11px] text-bone">{String(o.order_number)}</p>
                  <p className="font-mono text-[10px] text-faint">
                    {new Date(String(o.placed_at)).toISOString().slice(0, 10)} ·{" "}
                    {items.length} item{items.length === 1 ? "" : "s"} ·{" "}
                    {[o.shipping_address_line_1, o.shipping_city, o.shipping_postal_code]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[11px] text-bone">
                    ₹{(Number(o.total) / 100).toLocaleString("en-IN")}
                  </span>
                  <StatusChip status={String(o.status)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-12 font-mono text-[11px] tracking-[0.3em] text-faint">ADDRESS BOOK</h2>
      {(addresses ?? []).length === 0 ? (
        <p className="mt-4 border border-line p-5 font-mono text-[11px] text-faint">
          No saved addresses.
        </p>
      ) : (
        <ul className="mt-4 border border-line">
          {addresses!.map((a, i) => (
            <li
              key={String(a.id)}
              className={`px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
            >
              <p className="font-mono text-[11px] text-bone">
                {String(a.label)}
                {a.is_default && <span className="ml-2 text-crimson">DEFAULT</span>}
              </p>
              <p className="mt-1 font-mono text-[10px] text-faint">
                {[
                  a.name,
                  a.phone,
                  a.address_line_1,
                  a.address_line_2,
                  `${a.city} ${a.postal_code}`,
                  a.state,
                  a.country,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}