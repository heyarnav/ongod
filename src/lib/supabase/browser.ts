import { createBrowserClient } from "@supabase/ssr";

/**
 * The browser half of Supabase. Anon key only — it is safe in the client
 * bundle because RLS, not the key, is what protects customer data.
 *
 * Deliberately not cached in a module-level variable: Next may evaluate this
 * module more than once per render, and a second client would mean a second
 * in-memory auth state.
 */
export function createClient(options?: { detectSessionInUrl?: boolean }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set — copy .env.example to .env and fill them in.",
    );
  }

  return createBrowserClient(url, key, {
    auth: {
      // Default stays true for ordinary pages. The auth callback passes false:
      // it reads the URL tokens itself, and letting the client race it produced
      // a half-written session cookie that vanished on the next navigation.
      detectSessionInUrl: options?.detectSessionInUrl ?? true,
    },
  });
}