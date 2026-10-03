import "server-only";

import type { User } from "@supabase/supabase-js";
import { createClient as createServerClient } from "./server";
import { createAdminClient } from "./admin";

/** A customer row, shaped for the few places that need one. */
export type CustomerRecord = {
  id: string;
  supabase_user_id: string;
  email: string;
  name: string;
  phone: string;
  created_at: string;
};

export type AdminRecord = {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: string;
};

/**
 * The authenticated Supabase user, or null.
 *
 * This is the ONLY source of customer identity in the application. A customer
 * id arriving from a request body is never trusted — routes call this instead.
 * `getUser()` (not `getSession()`) because only the former revalidates the JWT
 * against the auth server rather than trusting the cookie's own claims.
 */
export async function getSupabaseUser(): Promise<User | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}

/**
 * The customer record for the signed-in user, created on first sight.
 *
 * Rows are keyed on `supabase_user_id` and inserted under the caller's own
 * RLS policy (`supabase_user_id = auth.uid()`), so this cannot create a row
 * belonging to anyone else.
 */
export async function getCustomer(): Promise<CustomerRecord | null> {
  const user = await getSupabaseUser();
  if (!user) return null;

  const supabase = await createServerClient();

  const { data: existing } = await supabase
    .from("customers")
    .select("*")
    .eq("supabase_user_id", user.id)
    .maybeSingle();

  if (existing) return existing as CustomerRecord;

  // First login on this device: materialise the profile row.
  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      supabase_user_id: user.id,
      email: user.email ?? "",
      name: (user.user_metadata?.name as string | undefined) ?? "",
      phone: (user.user_metadata?.phone as string | undefined) ?? "",
    })
    .select("*")
    .single();

  if (error) {
    // A concurrent first login may have won the race. Re-read once.
    const { data: retry } = await supabase
      .from("customers")
      .select("*")
      .eq("supabase_user_id", user.id)
      .maybeSingle();
    return (retry as CustomerRecord | null) ?? null;
  }

  return created as CustomerRecord;
}

/**
 * The customer record, or a typed failure. Route handlers use this so an
 * anonymous checkout attempt becomes a 401 instead of a crash.
 */
export async function requireCustomer(): Promise<
  { ok: true; customer: CustomerRecord } | { ok: false; error: "UNAUTHENTICATED" }
> {
  const customer = await getCustomer();
  if (!customer) return { ok: false, error: "UNAUTHENTICATED" };
  return { ok: true, customer };
}

/**
 * Authorize the caller as Control Room staff.
 *
 * Deliberate, deny-by-default: signing in as a Supabase user is not enough.
 * A row must exist in `admin_users` for that exact `auth.users.id`. This is
 * read with the service role because the row itself is not customer data.
 */
export async function requireAdmin(): Promise<
  { ok: true; admin: AdminRecord } | { ok: false; error: "UNAUTHENTICATED" | "FORBIDDEN" }
> {
  const user = await getSupabaseUser();
  if (!user) return { ok: false, error: "UNAUTHENTICATED" };

  const { data } = await createAdminClient()
    .from("admin_users")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return { ok: false, error: "FORBIDDEN" };
  return { ok: true, admin: data as AdminRecord };
}

/** Convenience for server components that only need a yes/no. */
export async function isAdmin(): Promise<boolean> {
  return (await requireAdmin()).ok;
}