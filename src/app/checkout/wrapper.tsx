import { redirect } from "next/navigation";
import { getProducts } from "@/lib/products";
import { getCustomer } from "@/lib/supabase/session";
import { listAddresses } from "@/lib/addresses-server";
import { CheckoutClient } from "./CheckoutClient";

/**
 * Server wrapper: derives the pre-order acknowledgement data from live
 * products (never from the client cart) and hands it to the client form.
 *
 * Checkout requires an account — `place_order` resolves identity from the
 * caller's Supabase JWT, so an anonymous cart has nowhere to attach itself.
 * The saved addresses are read server-side under RLS; the browser is never
 * asked for them.
 */
export default async function CheckoutWrapper() {
  const customer = await getCustomer();
  if (!customer) redirect("/account/login?next=/checkout");

  const [products, addresses] = await Promise.all([
    getProducts(),
    listAddresses(),
  ]);

  const preOrder = products.filter((p) => p.dropStatus === "PRE_ORDER");
  const hasPreOrder = preOrder.length > 0;
  const editionLabel = preOrder[0]?.editionLabel ?? "FIRST EDITION";
  const dispatchPeriod = preOrder.find((p) => p.dispatchPeriod)?.dispatchPeriod ?? "";

  return (
    <CheckoutClient
      acknowledgement={{ hasPreOrder, editionLabel, dispatchPeriod }}
      addresses={addresses}
      canSave
      customerEmail={customer.email}
    />
  );
}