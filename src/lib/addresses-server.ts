import "server-only";

import type { SavedAddress } from "./addresses";
import { createClient } from "./supabase/server";

/**
 * ADDRESS BOOK — server-only helpers.
 *
 * Every function here goes through the request-scoped Supabase client, so the
 * database itself refuses to hand back an address that does not belong to the
 * caller. RLS scopes `addresses` by `current_customer_id()`; passing someone
 * else's customer id to these helpers would simply return nothing.
 */

type AddressRow = {
  id: string;
  label: string;
  name: string;
  phone: string;
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};

export function toSavedAddress(a: AddressRow): SavedAddress {
  return {
    id: a.id,
    label: a.label,
    name: a.name,
    phone: a.phone,
    line1: a.address_line_1,
    line2: a.address_line_2,
    city: a.city,
    state: a.state,
    postalCode: a.postal_code,
    country: a.country,
    isDefault: a.is_default,
  };
}

/**
 * The caller's own book, default first.
 *
 * No customer id is accepted: the caller is whoever the Supabase session says
 * they are, and RLS narrows the rows to match. There is no way to ask this
 * function for somebody else's addresses.
 */
export async function listAddresses(): Promise<SavedAddress[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("addresses")
    .select(
      "id, label, name, phone, address_line_1, address_line_2, city, state, postal_code, country, is_default",
    )
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`addresses: ${error.message}`);
  return ((data ?? []) as AddressRow[]).map(toSavedAddress);
}

/**
 * Set exactly one address as the default.
 *
 * The database enforces this with a partial unique index
 * (`addresses_one_default_per_customer`), so a race between two requests
 * cannot leave two defaults or none. Clearing happens first, in two calls,
 * because the unique index is checked per-statement.
 */
export async function makeDefault(addressId: string): Promise<boolean> {
  const supabase = await createClient();

  const { error: clearError } = await supabase
    .from("addresses")
    .update({ is_default: false })
    .eq("is_default", true);

  if (clearError) throw new Error(`addresses: ${clearError.message}`);

  const { data, error } = await supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", addressId)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`addresses: ${error.message}`);
  return Boolean(data);
}