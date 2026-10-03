import Link from "next/link";
import { notFound } from "next/navigation";
import { getCustomer } from "@/lib/supabase/session";
import { createClient } from "@/lib/supabase/server";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { StatusChip } from "@/components/admin/AdminTable";
import { formatINR } from "@/lib/format";
import { OrderTimeline } from "@/components/account/OrderTimeline";
import { PAYMENT_STATUS_LABEL } from "@/lib/order-status";

export const dynamic = "force-dynamic";

/**
 * One order.
 *
 * The DISPATCH block below reads `shipping_*` straight off the order row.
 * Those columns were written once, at checkout, and are never re-derived from
 * the customer's address book — which is precisely why an old order keeps
 * showing the address it actually shipped to after the saved address is
 * edited or deleted.
 *
 * Ownership is enforced by RLS, not by an id comparison here: a request for
 * somebody else's order simply returns nothing, and `notFound()` runs.
 */
export default async function CustomerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const customer = await getCustomer();
  if (!customer) return null;

  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("orders")
    .select(
      `id, order_number, status, payment_status, subtotal, shipping_amount, total, currency,
       shipping_name, shipping_phone, shipping_address_line_1, shipping_address_line_2,
       shipping_city, shipping_state, shipping_postal_code, shipping_country,
       tracking_number, tracking_url, placed_at,
       order_items ( id, product_name, variant_size, unit_price, quantity,
                     image_url, drop_status, edition_label )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!data) notFound();

  const items = (data.order_items ?? []) as Array<Record<string, unknown>>;
  const hasPreOrder = items.some((i) => i.drop_status === "PRE_ORDER");
  const names = [
    ...new Set(items.map((i) => String(i.product_name))),
  ];

  return (
    <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
      {/* left — object + payment */}
      <div className="lg:col-span-7">
        <div className="flex flex-wrap items-center gap-3">
          <ArchiveLabel tone="crimson">ARCHIVE OBJECT</ArchiveLabel>
          <StatusChip status={String(data.status ?? "PENDING")} />
        </div>
        <h2 className="mt-4 font-serif-d text-4xl font-light text-bone">
          {names.join(" · ") || "OBJECT"}
        </h2>
        <p className="mt-2 font-mono text-[10px] tracking-widest text-faint">
          ORDER ID / {String(data.order_number)}
        </p>
        <p className="mt-1 font-mono text-[10px] text-faint">
          PLACED /{" "}
          {new Date(String(data.placed_at)).toLocaleString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>

        {/* manifest — product name, size and price are frozen snapshots */}
        <ul className="mt-8 border border-line">
          {items.map((i) => (
            <li
              key={String(i.id)}
              className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line/60 px-4 py-3 last:border-0"
            >
              <span className="font-mono text-[11px] text-bone/90">
                {String(i.product_name)} — {String(i.variant_size)}
              </span>
              <span className="font-mono text-[10px] text-faint">
                QTY {Number(i.quantity ?? 1)}
              </span>
              {Boolean(i.drop_status) && (
                <ArchiveLabel tone={i.drop_status === "PRE_ORDER" ? "crimson" : "faint"}>
                  {String(i.edition_label) || String(i.drop_status).replace(/_/g, " ")}
                </ArchiveLabel>
              )}
              <span className="ml-auto font-mono text-[11px] text-bone/67">
                {formatINR(Number(i.unit_price ?? 0) * Number(i.quantity ?? 1))}
              </span>
            </li>
          ))}
          <li className="flex justify-between px-4 py-3 font-mono text-[12px] text-bone">
            <span className="tracking-archive">TOTAL</span>
            <span>{formatINR(Number(data.total ?? 0))}</span>
          </li>
          <li className="flex justify-between border-t border-line px-4 py-2.5 font-mono text-[10px] text-faint">
            <span className="tracking-archive">PAYMENT</span>
            <span>{PAYMENT_STATUS_LABEL[String(data.payment_status)] ?? String(data.payment_status)}</span>
          </li>
        </ul>

        {/* dispatch — the frozen address snapshot */}
        <section className="mt-8 border border-line">
          <p className="border-b border-line px-4 py-2.5 font-mono text-[9px] tracking-[0.3em] text-faint">
            DISPATCH
          </p>
          <div className="space-y-1 px-4 py-4 font-mono text-[11px] leading-relaxed text-bone/73">
            <p>{String(data.shipping_name ?? "")}</p>
            <p className="text-faint">
              {[
                data.shipping_address_line_1,
                data.shipping_address_line_2,
                data.shipping_city,
                data.shipping_state,
                data.shipping_postal_code,
                data.shipping_country,
              ]
                .filter((v) => Boolean(v))
                .map((v) => String(v))
                .join(", ")}
            </p>
            {data.tracking_number ? (
              <p className="pt-2 text-bone/90">
                TRACKING / {String(data.tracking_number)}
                {data.tracking_url && (
                  <>
                    {" — "}
                    <a
                      href={String(data.tracking_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-crimson underline-offset-4 hover:underline"
                    >
                      CARRIER SITE
                    </a>
                  </>
                )}
              </p>
            ) : (
              <p className="pt-2 text-faint">
                {data.status === "DELIVERED" || data.status === "SHIPPED"
                  ? "Tracking details pending sync."
                  : "Tracking is issued at the SHIPPED stage."}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* right — production timeline */}
      <aside className="lg:col-span-5">
        <div className="border border-line p-6">
          <ArchiveLabel tone="crimson">PRODUCTION STATUS</ArchiveLabel>
          <div className="mt-6">
            <OrderTimeline status={String(data.status ?? "PENDING")} />
          </div>
          {hasPreOrder && (
            <p className="mt-6 border-t border-bone/26 pt-4 font-mono text-[9px] leading-relaxed tracking-widest text-bone/61">
              PRE-ORDER PRODUCTION BEGINS AFTER THE WINDOW CLOSES.
            </p>
          )}
        </div>

        <Link
          href="/account/orders"
          className="mt-8 inline-block font-mono text-[10px] tracking-archive text-faint transition-colors hover:text-bone"
        >
          ← ALL ORDERS
        </Link>
      </aside>
    </div>
  );
}
