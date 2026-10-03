import Link from "next/link";
import { getCustomer } from "@/lib/supabase/session";
import { createClient } from "@/lib/supabase/server";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { StatusChip } from "@/components/admin/AdminTable";
import { formatINR } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Account overview: identity, orders, saved addresses.
 *
 * Every read runs through the request-scoped Supabase client, so RLS is what
 * actually scopes them to this customer. There is no customer id in a where
 * clause because there is no customer id to trust.
 */
export default async function AccountPage() {
  const customer = await getCustomer();
  if (!customer) return null;

  const supabase = await createClient();

  const [{ data: orders }, { count: addressCount }] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, status, payment_status, total, placed_at, order_items ( id )")
      .order("placed_at", { ascending: false }),
    supabase.from("addresses").select("id", { count: "exact", head: true }),
  ]);

  const rows = orders ?? [];
  const lifetime = rows
    .filter((o) => o.payment_status === "PAID")
    .reduce((sum, o) => sum + Number(o.total ?? 0), 0);

  return (
    <div>
      {/* identity */}
      <section className="border border-line">
        <div className="border-b border-line px-5 py-3">
          <ArchiveLabel tone="faint">IDENTITY</ArchiveLabel>
        </div>
        <div className="px-5 py-4 font-mono text-[12px] text-bone/67">
          <p>{customer.email}</p>
          {customer.name && <p className="mt-1 text-faint">{customer.name}</p>}
          {customer.phone && <p className="mt-1 text-faint">{customer.phone}</p>}
          <p className="mt-3 text-faint">NO PASSWORD ON FILE</p>
        </div>
      </section>

      {/* orders summary */}
      <section className="mt-8 grid grid-cols-3 gap-px border border-line bg-line">
        <div className="bg-abyss p-5">
          <p className="font-mono text-[9px] tracking-[0.3em] text-faint">ORDERS</p>
          <p className="mt-3 font-serif text-2xl text-bone">{rows.length}</p>
        </div>
        <div className="bg-abyss p-5">
          <p className="font-mono text-[9px] tracking-[0.3em] text-faint">SPENT</p>
          <p className="mt-3 font-serif text-2xl text-bone">{formatINR(lifetime)}</p>
        </div>
        <div className="bg-abyss p-5">
          <p className="font-mono text-[9px] tracking-[0.3em] text-faint">ADDRESSES</p>
          <p className="mt-3 font-serif text-2xl text-bone">{addressCount ?? 0}</p>
        </div>
      </section>

      {/* recent orders */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <ArchiveLabel tone="faint">RECENT ORDERS</ArchiveLabel>
          <Link
            href="/account/orders"
            className="font-mono text-[10px] tracking-archive text-faint hover:text-bone"
          >
            ALL →
          </Link>
        </div>

        {rows.length === 0 ? (
          <p className="mt-4 border border-line p-6 font-mono text-[11px] text-faint">
            No orders recorded against this register.
          </p>
        ) : (
          <ul className="mt-4 border border-line">
            {rows.slice(0, 5).map((o, i) => (
              <li key={String(o.id)} className={i > 0 ? "border-t border-line" : ""}>
                <Link
                  href={`/account/orders/${o.id}`}
                  className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 transition-colors hover:bg-graphite/40"
                >
                  <span className="font-mono text-[11px] text-bone">
                    {String(o.order_number)}
                  </span>
                  <StatusChip status={String(o.status ?? "PENDING")} />
                  <span className="ml-auto font-mono text-[11px] text-bone/90">
                    {formatINR(Number(o.total ?? 0))}
                  </span>
                  <span className="font-mono text-[10px] text-faint">
                    {new Date(String(o.placed_at)).toISOString().slice(0, 10)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
