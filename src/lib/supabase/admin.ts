import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * SERVICE ROLE CLIENT — bypasses row level security.
 *
 * This is the Control Room's key. It exists because an administrator must be
 * able to read every order, edit a price, and read unpublished products, and
 * because RLS deliberately hides those rows from everyone else.
 *
 * Rules that are not negotiable:
 *   - `server-only` import means a "use client" module cannot pull this in.
 *   - the key is only ever read from a non-NEXT_PUBLIC_ env var.
 *   - every caller must already have passed `requireAdmin()`.
 *
 * Never import this into anything that ships to the browser.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set — it is server-only and is required for Control Room operations.",
    );
  }

  return createClient(url, key, {
    auth: {
      // The service role must never try to persist or refresh a session.
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}