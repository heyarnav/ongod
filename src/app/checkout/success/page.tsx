import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireCustomer } from "@/lib/supabase/session";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { RegistrationMark } from "@/components/ui/marks";
import { formatINR } from "@/lib/format";
import { PAYMENT_STATUS_LABEL } from "@/lib/order-status";

export const dynamic = "force-dynamic";
export const metadata = { title: "Order confirmed", robots: { index: false } };

/**
 * Post-payment confirmation.
 *
 * Everything here is read back from the database. The page deliberately does
 * NOT trust the fact that the browser reached this URL — a customer can type
 * any order number into the URL bar, and a client-side "payment succeeded"
 * callback is a claim rather than a fact.
 *
 * RLS is the gate: this can only ever read an order belonging to the signed-in
 * customer, so somebody else's order number returns nothing at all.
 *
 * The payment state shown may still read PENDING for a second or two. That is
 * correct and expected — the webhook is asynchronous, and the success screen
 * renders the truth as it stands rather than an optimistic guess. A refresh a
 * moment later shows PAID.
 */
export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const auth = await requireCustomer();
  if (!auth.ok) {
    return (
      <div className="mx-auto min-h-[60vh] max-w-[720px] px-5 pt-36 text-center">
        <ArchiveLabel tone="faint">SIGN IN TO VIEW THIS ORDER.</ArchiveLabel>
        <Link
          href="/account/login?next=%2Fcheckout%2Fsuccess"
          className="mt-8 inline-block border border-bone/41 px-8 py-3 font-mono text-[10px] tracking-archive text-bone hover:border-crimson hover:text-crimson"
        >
          ENTER THE ARCHIVE
        </Link>
      </div>
    );
  }

  const { order: orderNumber } = await searchParams;
  if (!orderNumber) notFound();

  const supabase = await createClient();
  const { data } = await supabase
    .from("orders")
    .select(
      `id, order_number, status, payment_status, subtotal, shipping_amount, total, currency,
       reservation_expires_at, refund_required, tracking_number, placed_at,
       shipping_name, shipping_phone, shipping_address_line_1, shipping_address_line_2,
       shipping_city, shipping_state, shipping_postal_code, shipping_country,
       order_items ( product_name, variant_size, unit_price, quantity, edition_label, drop_status )`,
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  // RLS means "not yours" and "does not exist" are the same empty result.
  if (!data) notFound();

  const items = (data.order_items ?? []) as Array<Record<string, unknown>>;
  const paid = data.payment_status === "PAID";
  const awaiting = data.payment_status === "PENDING" || data.payment_status === "FAILED";

  return (
    <div className="mx-auto max-w-[720px] px-5 pb-32 pt-32 md:px-10 md:pt-40">
      <div className="flex items-center justify-between">
        <ArchiveLabel tone={paid ? "default" : "crimson"}>
          {paid ? "PAYMENT CONFIRMED" : "PAYMENT PROCESSING"}
        </ArchiveLabel>
        <RegistrationMark />
      </div>

      <h1 className="mt-8 font-serif-d text-4xl font-light leading-tight text-bone md:text-6xl">
        {paid ? "OBJECT ACQUIRED." : "PAYMENT PENDING."}
      </h1>

      <p className="mt-6 max-w-md font-serif-d text-lg italic leading-relaxed text-bone/73">
        Thank you for your order.
      </p>

      <p className="mt-6 font-mono text-[10px] tracking-archive text-bone/41">
        ORDER # {String(data.order_number)}
      </p>

      {!paid && awaiting && (
        <p className="mt-6 border border-crimson/60 bg-crimson/10 px-4 py-3 font-mono text-[10px] leading-relaxed text-crimson">
          WE HAVE NOT RECEIVED CONFIRMATION FROM THE PAYMENT SERVICE YET. THIS PAGE READS THE
          ORDER&apos;S REAL STATE — REFRESH IN A MOMENT. YOUR PIECE IS HELD UNTIL THEN.
        </p>
      )}

      {data.refund_required === true && (
        <p className="mt-4 border border-crimson/60 bg-crimson/10 px-4 py-3 font-mono text-[10px] leading-relaxed text-crimson">
          THIS PAYMENT ARRIVED AFTER THE HOLD EXPIRED AND IS BEING REFUNDED. NOTHING FURTHER IS
          REQUIRED FROM YOU.
        </p>
      )}

      {/* MANIFEST */}
      <div className="mt-10 border border-bone/26">
        <div className="border-b border-bone/12 px-5 py-3">
          <ArchiveLabel tone="faint">MANIFEST</ArchiveLabel>
        </div>
        <div className="divide-y divide-bone/12">
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-baseline justify-between gap-4 px-5 py-4 font-mono text-[10px] tracking-widest"
            >
              <span className="text-bone/73">
                {String(item.product_name)}
                <span className="text-bone/41"> — SIZE {String(item.variant_size)}</span>
                <span className="text-bone/41"> × {String(item.quantity)}</span>
                {item.drop_status === "PRE_ORDER" && (
                  <span className="ml-2 text-crimson">· PRE-ORDER</span>
                )}
              </span>
              <span className="shrink-0 text-bone/167">
                {formatINR(Number(item.unit_price) * Number(item.quantity))}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-bone/26 px-5 py-4 font-mono text-xs text-bone">
          <span className="tracking-archive">TOTAL</span>
          <span>{formatINR(Number(data.total))}</span>
        </div>
      </div>

      {/* STATE — payment and order, straight from the row */}
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="border border-bone/26 p-5">
          <ArchiveLabel tone="faint">PAYMENT</ArchiveLabel>
          <p className="mt-3 font-mono text-[11px] tracking-archive text-bone">
            {PAYMENT_STATUS_LABEL[String(data.payment_status)] ?? String(data.payment_status)}
          </p>
        </div>
        <div className="border border-bone/26 p-5">
          <ArchiveLabel tone="faint">ORDER STATUS</ArchiveLabel>
          <p className="mt-3 font-mono text-[11px] tracking-archive text-bone">
            {String(data.status)}
          </p>
        </div>
      </div>

      {/* The frozen snapshot, not the customer's address book. */}
      <div className="mt-6 border border-bone/26 p-5">
        <ArchiveLabel tone="faint">SHIPPING TO</ArchiveLabel>
        <address className="mt-3 font-mono text-[11px] not-italic leading-relaxed text-bone/73">
          {String(data.shipping_name)}
          <br />
          {String(data.shipping_phone)}
          <br />
          {String(data.shipping_address_line_1)}
          {String(data.shipping_address_line_2) ? (
            <>
              <br />
              {String(data.shipping_address_line_2)}
            </>
          ) : null}
          <br />
          {String(data.shipping_city)} — {String(data.shipping_postal_code)}
          <br />
          {String(data.shipping_state)}, {String(data.shipping_country)}
        </address>
        {data.tracking_number ? (
          <p className="mt-4 font-mono text-[10px] tracking-widest text-bone/41">
            TRACKING / {String(data.tracking_number)}
          </p>
        ) : (
          <p className="mt-4 font-mono text-[10px] tracking-widest text-bone/41">TRACKING / —</p>
        )}
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-4">
        <Link
          href={`/account/orders/${String(data.id)}`}
          className="inline-block border border-bone/41 px-8 py-3 font-mono text-[10px] tracking-archive text-bone hover:border-crimson hover:text-crimson"
        >
          VIEW ORDER →
        </Link>
        <Link
          href="/account/orders"
          className="inline-block px-8 py-3 font-mono text-[10px] tracking-archive text-bone/41 hover:text-bone"
        >
          ALL ORDERS
        </Link>
        <Link
          href="/archive"
          className="inline-block px-8 py-3 font-mono text-[10px] tracking-archive text-bone/41 hover:text-bone"
        >
          RETURN TO THE ARCHIVE
        </Link>
      </div>
    </div>
  );
}