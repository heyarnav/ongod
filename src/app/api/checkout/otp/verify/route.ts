import { NextResponse } from "next/server";
import { getCustomer, getSupabaseUser } from "@/lib/supabase/session";
import { listAddresses } from "@/lib/addresses-server";

/**
 * Confirm that checkout email verification actually produced a session.
 *
 * The code itself is redeemed by the browser through Supabase's own client, the
 * same way every other sign-in in this project works, so the session cookie is
 * written exactly once and by exactly one piece of code. This route does NOT
 * verify the token again — the token is single-use, and a second attempt would
 * burn it.
 *
 * What it does instead is check the thing the client cannot check for itself:
 * whether the cookie actually reached the server, and who it belongs to. That
 * matters because the checkout form must not proceed to "verified" on the
 * strength of a promise from its own JavaScript.
 *
 * getCustomer() materialises the profile row on this call, which is the moment
 * a guest becomes a customer — after the OTP, never before, and never merely
 * because somebody typed an address into a form.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSupabaseUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const customer = await getCustomer();
  if (!customer) {
    return NextResponse.json({ ok: false, error: "CUSTOMER_NOT_FOUND" }, { status: 401 });
  }

  // RLS-scoped to this customer: nobody else's book is reachable from here.
  const addresses = await listAddresses();

  return NextResponse.json({
    ok: true,
    email: customer.email,
    // Safe to say now — the caller has proven control of this inbox.
    hasSavedAddresses: addresses.length > 0,
    addresses,
  });
}