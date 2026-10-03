import { getCustomer } from "@/lib/supabase/session";
import { getProducts } from "@/lib/products";
import { listAddresses } from "@/lib/addresses-server";
import { CheckoutClient } from "./CheckoutClient";

/**
 * Server wrapper: derives the pre-order acknowledgement data from live
 * products (never from the client cart) and hands it to the client form.
 *
 * There is deliberately NO redirect here any more. Checkout used to bounce an
 * anonymous visitor to /account/login, which meant: fill in the form, lose the
 * form, wait for an email, type a code, retype the address. Identity is now
 * established inline, after the shopper has seen the price.
 *
 * `getCustomer()` returns null for a guest, and that is simply a guest now:
 *
 *   - a returning signed-in customer gets their saved addresses, and the
 *     "save this address" option, exactly as before;
 *   - a first-time shopper gets neither, and is not asked to save anything.
 *
 * The customer row itself is created later, by /api/checkout/otp/verify, and
 * only after the OTP has proven control of the address.
 */
export default async function CheckoutWrapper() {
  const customer = await getCustomer();

  const [products, addresses] = await Promise.all([
    getProducts(),
    // RLS scopes this to the signed-in customer; a guest gets an empty book.
    customer ? listAddresses() : Promise.resolve([]),
  ]);

  const preOrder = products.filter((p) => p.dropStatus === "PRE_ORDER");
  const hasPreOrder = preOrder.length > 0;
  const editionLabel = preOrder[0]?.editionLabel ?? "FIRST EDITION";
  const dispatchPeriod = preOrder.find((p) => p.dispatchPeriod)?.dispatchPeriod ?? "";

  return (
    <CheckoutClient
      acknowledgement={{ hasPreOrder, editionLabel, dispatchPeriod }}
      addresses={addresses}
      canSave={Boolean(customer)}
      customerEmail={customer?.email ?? ""}
      signedInInitially={Boolean(customer)}
    />
  );
}