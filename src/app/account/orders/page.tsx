import Link from "next/link";
import { getCustomer } from "@/lib/supabase/session";
import { createClient } from "@/lib/supabase/server";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { StatusChip } from "@/components/admin/AdminTable";
import { formatINR } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * The customer's orders.
 *
 * The query carries no customer filter because RLS supplies one: the anon
 * server client is scoped to this request's JWT, and `orders_select_own` only
 * ever returns rows belonging to `current_customer_id()`.
 */
export default async function AccountOrdersPage() {
  const customer = await getCustomer();
  if (!customer) return null;

  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select(
      "id, order_number, status, payment_status, total, tracking_number, placed_at, order_items ( id, product_name, variant_size, quantity, drop_status )",
    )
    .order("placed_at", { ascending: false });

  const orders = data ?? [];

  return (
    <div>
      <ArchiveLabel tone="faint">ALL ORDERS</ArchiveLabel>
      {orders.length === 0 ? (
        <p className="mt-4 border border-line p-6 font-mono text-[11px] text-faint">
          No orders recorded against this register.
        </p>
      ) : (
        <ul className="mt-4 border border-line">
          {orders.map((o) => {
            const items = (o.order_items ?? []) as Array<Record<string, unknown>>;
            const hasPreOrder = items.some((i) => i.drop_status === "PRE_ORDER");
            return (
              <li key={String(o.id)} className="border-b border-line/60 last:border-0">
                <Link
                  href={`/account/orders/${o.id}`}
                  className="group block px-5 py-4 transition-colors hover:bg-graphite/40"
                >
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                    <span className="font-mono text-[12px] text-bone">
                      {String(o.order_number)}
                    </span>
                    <StatusChip status={String(o.status ?? "PENDING")} />
                    {hasPreOrder && <ArchiveLabel tone="crimson">PRE-ORDER</ArchiveLabel>}
                    {o.tracking_number && (
                      <span className="font-mono text-[10px] text-faint">
                        TRACKING · {String(o.tracking_number)}
                      </span>
                    )}
                    <span className="ml-auto font-mono text-[12px] text-bone/90">
                      {formatINR(Number(o.total ?? 0))}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 font-mono text-[10px] text-faint">
                    <span>
                      {items
                        .map(
                          (i) =>
                            `${String(i.product_name)}/${String(i.variant_size)} ×${Number(i.quantity)}`,
                        )
                        .join(" · ")}
                    </span>
                    <span className="ml-auto">
                      {new Date(String(o.placed_at)).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "2-digit",
                      })}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
