import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomer } from "@/lib/supabase/session";
import { createClient } from "@/lib/supabase/server";
import { ADDRESS_LABELS } from "@/lib/addresses";
import { listAddresses, makeDefault, toSavedAddress } from "@/lib/addresses-server";

/**
 * A single saved address.
 *
 * Ownership is not checked by comparing ids in application code — RLS simply
 * refuses to return or mutate a row that is not the caller's. An id belonging
 * to another customer comes back as a 404, never a 403 that confirms it exists.
 */

const PatchSchema = z
  .object({
    label: z.enum(ADDRESS_LABELS),
    name: z.string().max(120),
    phone: z.string().max(20),
    line1: z.string().trim().min(1).max(200),
    line2: z.string().max(200),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().min(1).max(80),
    postalCode: z.string().trim().min(4).max(10),
    country: z.string().max(2),
    isDefault: z.boolean(),
  })
  .partial();

type Params = { params: Promise<{ id: string }> };

const SELECT = "id, label, name, phone, address_line_1, address_line_2, city, state, postal_code, country, is_default";

export async function PATCH(req: NextRequest, { params }: Params) {
  const auth = await requireCustomer();
  if (!auth.ok) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("addresses")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_INPUT", fields: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { isDefault, ...fields } = parsed.data;

  // Edits here change the SAVED address only. Orders carry their own frozen
  // copy of the address they shipped to, so historical orders are untouched.
  if (Object.keys(fields).length > 0) {
    const patch: Record<string, unknown> = {};
    if (fields.label !== undefined) patch.label = fields.label;
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.phone !== undefined) patch.phone = fields.phone;
    if (fields.line1 !== undefined) patch.address_line_1 = fields.line1;
    if (fields.line2 !== undefined) patch.address_line_2 = fields.line2;
    if (fields.city !== undefined) patch.city = fields.city;
    if (fields.state !== undefined) patch.state = fields.state;
    if (fields.postalCode !== undefined) patch.postal_code = fields.postalCode;
    if (fields.country !== undefined) patch.country = fields.country;

    const { error } = await supabase.from("addresses").update(patch).eq("id", id);
    if (error) {
      return NextResponse.json({ error: "ADDRESS_UPDATE_FAILED" }, { status: 500 });
    }
  }

  // Setting the default is a separate operation: the database enforces "at
  // most one default per customer" with a partial unique index, so the clear
  // and the set have to happen in that order.
  if (isDefault) await makeDefault(id);

  const { data: fresh } = await supabase
    .from("addresses")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ address: toSavedAddress(fresh as never) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const auth = await requireCustomer();
  if (!auth.ok) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { id } = await params;
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("addresses")
    .select("id, is_default")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const { error } = await supabase.from("addresses").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: "ADDRESS_DELETE_FAILED" }, { status: 500 });
  }

  // Orders hold a frozen copy of the shipping fields and their own
  // address_id, which is nulled on delete — deleting a saved address never
  // rewrites order history. If the deleted row held the default flag, hand it
  // to the most recent survivor so the checkout picker still has one.
  if (existing.is_default) {
    const remaining = await listAddresses();
    if (remaining.length > 0) await makeDefault(remaining[0].id);
  }

  return NextResponse.json({ ok: true });
}