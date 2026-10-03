import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader, StatusChip } from "@/components/admin/AdminTable";

export const dynamic = "force-dynamic";

/**
 * Customers.
 *
 * Accounts exist only because someone signed in with Supabase Auth, so this is
 * a real list — never seeded. Each row carries the order count and the lifetime
 * value derived from paid orders only.
 */
export default async function AdminCustomersPage() {
  const { data, error } = await createAdminClient()
    .from("customers")
    .select(
      "id, email, name, phone, created_at, orders ( id, total, payment_status, placed_at )",
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="mx-auto max-w-5xl">
        <AdminPageHeader section="SECTION 05" title="Customers" />
        <p className="mt-8 border border-crimson/60 bg-crimson/10 p-6 font-mono text-[11px] text-crimson">
          Could not load customers: {error.message}
        </p>
      </div>
    );
  }

  const customers = (data ?? []).map((c) => {
    const orders = (c.orders as Array<Record<string, unknown>>) ?? [];
    return {
      id: String(c.id),
      email: String(c.email ?? ""),
      name: String(c.name ?? ""),
      phone: String(c.phone ?? ""),
      createdAt: new Date(String(c.created_at)).toISOString(),
      orderCount: orders.length,
      lifetimeValue: orders
        .filter((o) => o.payment_status === "PAID")
        .reduce((sum, o) => sum + Number(o.total ?? 0), 0),
      lastOrderAt: orders.length
        ? orders
            .map((o) => String(o.placed_at ?? ""))
            .sort()
            .slice(-1)[0]
        : null,
    };
  });

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        section="SECTION 05"
        title="Customers"
        note="Accounts that exist because someone signed in. Orders and addresses are listed per customer."
      />

      <div className="mt-8 overflow-x-auto border border-line">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-line font-mono text-[9px] tracking-[0.25em] text-faint">
              <th className="px-4 py-3 font-normal">CUSTOMER</th>
              <th className="px-4 py-3 font-normal">CONTACT</th>
              <th className="px-4 py-3 font-normal">REGISTERED</th>
              <th className="px-4 py-3 font-normal">ORDERS</th>
              <th className="px-4 py-3 font-normal">LIFETIME</th>
              <th className="px-4 py-3 font-normal" />
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 font-mono text-[11px] text-faint">
                  No customers yet. One appears the moment someone signs in.
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="border-b border-line/50 last:border-0 hover:bg-graphite/40">
                <td className="px-4 py-3">
                  <p className="font-mono text-[11px] text-bone">{c.name || c.email}</p>
                  <p className="font-mono text-[10px] text-faint">/{c.id.slice(0, 8)}</p>
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-faint">
                  <p>{c.email}</p>
                  {c.phone && <p className="text-[10px]">{c.phone}</p>}
                </td>
                <td className="px-4 py-3 font-mono text-[10px] text-faint">
                  {new Date(c.createdAt).toISOString().slice(0, 10)}
                </td>
                <td className="px-4 py-3 font-mono text-[11px] text-bone">{c.orderCount}</td>
                <td className="px-4 py-3 font-mono text-[11px] text-bone">
                  ₹{(c.lifetimeValue / 100).toLocaleString("en-IN")}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/customers/${c.id}`}
                    className="font-mono text-[10px] tracking-[0.2em] text-faint hover:text-bone"
                  >
                    INSPECT →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}