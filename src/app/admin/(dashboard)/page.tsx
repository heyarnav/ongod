import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAnalyticsSummary } from "@/lib/analytics";
import { AdminPageHeader, Chip, StatusChip } from "@/components/admin/AdminTable";

export const dynamic = "force-dynamic";

/**
 * Dashboard — the operator's single landing page.
 *
 * Traffic record and trade record live side by side here rather than behind a
 * separate analytics screen: the question an operator actually opens this page
 * with is "how is the archive doing", and that is one answer.
 *
 * The analytics half is a reading of `analytics_events`, not a platform.
 * Anything that matters — an order placed, a product view from a server render
 * — is written server-side, so none of these counts can be inflated from a
 * browser.
 */
export default async function AdminDashboardPage() {
  const supabase = createAdminClient();

  const [
    summary,
    productCount,
    publishedCount,
    archivedCount,
    recentOrders,
    lowStock,
    paidOrders,
    customerCount,
  ] = await Promise.all([
    getAnalyticsSummary(14),
    supabase.from("products").select("id", { count: "exact", head: true }),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "PUBLISHED"),
    supabase.from("products").select("id", { count: "exact", head: true }).eq("status", "ARCHIVED"),
    supabase
      .from("orders")
      .select("id, order_number, shipping_name, total, status, placed_at, order_items ( id )")
      .order("placed_at", { ascending: false })
      .limit(6),
    supabase
      .from("product_variants")
      .select("id, size, stock, products ( id, name, archive_number, collections ( name ) )")
      .lte("stock", 2)
      .eq("active", true)
      .order("stock", { ascending: true })
      .limit(8),
    supabase.from("orders").select("total").eq("payment_status", "PAID"),
    supabase.from("customers").select("id", { count: "exact", head: true }),
  ]);

  const orders = recentOrders.data ?? [];
  const variants = lowStock.data ?? [];
  const revenue = (paidOrders.data ?? []).reduce((sum, o) => sum + Number(o.total ?? 0), 0);
  const soldOutCount = variants.filter((v) => v.stock === 0).length;

  const peak = summary.daily.reduce((max, d) => Math.max(max, d.count), 0);
  const totalEvents = summary.byEvent.reduce((sum, e) => sum + e.count, 0);

  const stats = [
    { label: "OBJECTS", value: productCount.count ?? 0, note: `${publishedCount.count ?? 0} published` },
    { label: "LOW STOCK", value: soldOutCount, note: `${archivedCount.count ?? 0} archived` },
    { label: "REVENUE", value: `₹${(revenue / 100).toLocaleString("en-IN")}`, note: "paid orders" },
    { label: "ORDERS", value: orders.length, note: "recent" },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <p className="font-mono text-[10px] tracking-[0.3em] text-crimson">SECTION 00</p>
      <h1 className="mt-2 font-serif text-3xl text-bone">Dashboard</h1>

      <div className="mt-8 grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-abyss p-5">
            <p className="font-mono text-[9px] tracking-[0.3em] text-faint">{s.label}</p>
            <p className="mt-3 font-serif text-2xl text-bone">{s.value}</p>
            <p className="mt-1 font-mono text-[10px] text-faint/70">{s.note}</p>
          </div>
        ))}
      </div>

      {/* ── trade record ─────────────────────────────────────────────── */}
      <div className="mt-10 grid gap-10 lg:grid-cols-2">
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] tracking-[0.3em] text-faint">RECENT ORDERS</h2>
            <Link href="/admin/orders" className="font-mono text-[10px] text-crimson hover:underline">
              ALL →
            </Link>
          </div>
          <div className="mt-4 border border-line">
            {orders.length === 0 ? (
              <p className="p-5 font-mono text-[11px] text-faint">No orders yet. The archive is quiet.</p>
            ) : (
              orders.map((o, i) => {
                const items = (o.order_items as Array<unknown>) ?? [];
                return (
                  <div
                    key={String(o.id)}
                    className={`flex items-center justify-between gap-3 px-4 py-3 ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] text-bone">
                        {String(o.order_number)}
                      </p>
                      <p className="truncate font-mono text-[10px] text-faint">
                        {String(o.shipping_name || "—")} · {items.length} item
                        {items.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[11px] text-bone">
                        ₹{(Number(o.total) / 100).toLocaleString("en-IN")}
                      </p>
                      <p
                        className={`font-mono text-[9px] tracking-[0.2em] ${
                          o.status === "PENDING" ? "text-faint" : "text-crimson"
                        }`}
                      >
                        {String(o.status)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[11px] tracking-[0.3em] text-faint">LOW STOCK</h2>
            <Link href="/admin/inventory" className="font-mono text-[10px] text-crimson hover:underline">
              MANAGE →
            </Link>
          </div>
          <div className="mt-4 border border-line">
            {variants.length === 0 ? (
              <p className="p-5 font-mono text-[11px] text-faint">All stocks healthy.</p>
            ) : (
              variants.map((v, i) => {
                const product = v.products as unknown as {
                  name: string;
                  archive_number: string;
                  collections: { name: string } | { name: string }[] | null;
                } | null;
                const c = Array.isArray(product?.collections)
                  ? product.collections[0]
                  : product?.collections;
                return (
                  <div
                    key={String(v.id)}
                    className={`flex items-center justify-between gap-3 px-4 py-3 ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[11px] text-bone">
                        {product?.name} / {String(v.size)}
                      </p>
                      <p className="font-mono text-[10px] text-faint">
                        {c?.name ?? "—"} / {product?.archive_number}
                      </p>
                    </div>
                    <span
                      className={`font-mono text-[11px] ${v.stock === 0 ? "text-crimson" : "text-faint"}`}
                    >
                      {v.stock} left
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* ── analytics, folded in ──────────────────────────────────────── */}
      <div className="mt-14 border-t border-line pt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-mono text-[11px] tracking-[0.3em] text-faint">
            ANALYTICS · LAST 14 DAYS
          </h2>
          <p className="font-mono text-[10px] text-faint">
            {summary.last7d} EVENTS RECENTLY · {customerCount.count ?? 0} REGISTERED CUSTOMERS
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-px border border-line bg-line lg:grid-cols-4">
          {[
            { label: "EVENTS", value: summary.total, note: "all time" },
            { label: "LAST 14 DAYS", value: summary.last7d, note: "recent" },
            { label: "EVENT TYPES", value: summary.byEvent.length, note: "recorded" },
            {
              label: "TOP OBJECT",
              value: summary.topProducts[0]?.name ?? "—",
              note: "by views",
            },
          ].map((s) => (
            <div key={s.label} className="bg-abyss p-5">
              <p className="font-mono text-[9px] tracking-[0.3em] text-faint">{s.label}</p>
              <p className="mt-3 truncate font-serif text-2xl text-bone">{s.value}</p>
              <p className="mt-1 font-mono text-[10px] text-faint/70">{s.note}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-10 lg:grid-cols-2">
          {/* daily volume */}
          <section>
            <h3 className="font-mono text-[10px] tracking-[0.3em] text-faint">DAILY VOLUME</h3>
            <div className="mt-3 border border-line p-5">
              {summary.daily.length === 0 ? (
                <p className="font-mono text-[11px] text-faint">No events recorded yet.</p>
              ) : (
                <>
                  <div className="flex h-28 items-end gap-1">
                    {summary.daily.map((d) => (
                      <div key={d.day} className="group relative flex-1" title={`${d.day}: ${d.count}`}>
                        <div
                          className="w-full bg-crimson/70 transition-colors group-hover:bg-crimson"
                          style={{ height: `${Math.max(2, (d.count / peak) * 100)}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 flex justify-between font-mono text-[9px] text-faint">
                    <span>{summary.daily[0]?.day}</span>
                    <span>{summary.daily[summary.daily.length - 1]?.day}</span>
                  </p>
                </>
              )}
            </div>
          </section>

          {/* event breakdown */}
          <section>
            <h3 className="font-mono text-[10px] tracking-[0.3em] text-faint">EVENT BREAKDOWN</h3>
            <div className="mt-3 border border-line">
              {summary.byEvent.length === 0 ? (
                <p className="p-5 font-mono text-[11px] text-faint">No events recorded yet.</p>
              ) : (
                summary.byEvent.map((e, i) => (
                  <div
                    key={e.name}
                    className={`flex items-center justify-between px-4 py-3 ${
                      i > 0 ? "border-t border-line" : ""
                    }`}
                  >
                    <span className="font-mono text-[11px] text-bone">{e.name}</span>
                    <span className="font-mono text-[11px] text-faint">
                      {e.count}
                      <span className="ml-3 text-faint/60">
                        {totalEvents ? Math.round((e.count / totalEvents) * 100) : 0}%
                      </span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* objects by view */}
        <section className="mt-10">
          <h3 className="font-mono text-[10px] tracking-[0.3em] text-faint">OBJECTS BY VIEW</h3>
          <div className="mt-3 border border-line">
            {summary.topProducts.length === 0 ? (
              <p className="p-5 font-mono text-[11px] text-faint">No product views yet.</p>
            ) : (
              summary.topProducts.map((p, i) => (
                <div
                  key={p.slug}
                  className={`flex items-center justify-between px-4 py-3 ${
                    i > 0 ? "border-t border-line" : ""
                  }`}
                >
                  <span className="font-mono text-[11px] text-bone">
                    {p.name} <span className="text-faint">/{p.slug}</span>
                  </span>
                  <span className="font-mono text-[11px] text-faint">{p.views}</span>
                </div>
              ))
            )}
          </div>
        </section>

        <div className="mt-6">
          <Chip tone="info">NOTE</Chip>
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-faint">
            A browser can only name an event and a path. Product views and order placements are
            written from the server after the row is committed, so neither can be forged from the
            client.
          </p>
        </div>
      </div>
    </div>
  );
}