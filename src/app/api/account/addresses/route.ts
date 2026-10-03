import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomer } from "@/lib/supabase/session";
import { createClient } from "@/lib/supabase/server";
import { ADDRESS_LABELS, ADDRESS_LIMITS } from "@/lib/addresses";
import { listAddresses, makeDefault, toSavedAddress } from "@/lib/addresses-server";

/**
 * The customer's own address book.
 *
 * There is no customer id in this handler at all. The caller is whoever
 * `auth.uid()` says they are, and RLS scopes every statement to that
 * customer's rows — so one customer can never read or write another's
 * address, no matter what they post.
 */

const AddressSchema = z.object({
  label: z.enum(ADDRESS_LABELS).default("HOME"),
  name: z.string().max(120).default(""),
  phone: z.string().max(20).default(""),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().max(200).default(""),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  postalCode: z.string().trim().min(4).max(10),
  country: z.string().max(2).default("IN"),
  isDefault: z.boolean().default(false),
});

/** List the signed-in customer's own addresses, default first. */
export async function GET() {
  const auth = await requireCustomer();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  return NextResponse.json({ addresses: await listAddresses() });
}

export async function POST(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const parsed = AddressSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("addresses")
    .select("id", { count: "exact", head: true });

  if (countError) {
    return NextResponse.json({ error: "ADDRESS_BOOK_UNAVAILABLE" }, { status: 500 });
  }

  const existing = count ?? 0;
  if (existing >= ADDRESS_LIMITS.max) {
    return NextResponse.json({ error: "ADDRESS_BOOK_FULL" }, { status: 409 });
  }

  const data = parsed.data;
  // The first address is the default whether it asked to be or not — an empty
  // book would leave the checkout picker with nothing to prefill.
  const makeItDefault = data.isDefault || existing === 0;

  // `customer_id` is the caller's own id. RLS's insert policy
  // (`customer_id = current_customer_id()`) rejects the write if it is not.
  const { data: created, error } = await supabase
    .from("addresses")
    .insert({
      customer_id: auth.customer.id,
      label: data.label,
      name: data.name,
      phone: data.phone,
      address_line_1: data.line1,
      address_line_2: data.line2,
      city: data.city,
      state: data.state,
      postal_code: data.postalCode,
      country: data.country,
      is_default: false,
    })
    .select("*")
    .single();

  if (error || !created) {
    return NextResponse.json({ error: "ADDRESS_CREATE_FAILED" }, { status: 500 });
  }

  if (makeItDefault) await makeDefault(created.id);

  const { data: fresh } = await supabase
    .from("addresses")
    .select("*")
    .eq("id", created.id)
    .maybeSingle();

  return NextResponse.json(
    { address: toSavedAddress((fresh ?? created) as never) },
    { status: 201 },
  );
}