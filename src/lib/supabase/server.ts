import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * The server half of Supabase, scoped to the visitor's own session.
 *
 * This is the client that matters for security: because it carries the
 * caller's JWT, PostgREST resolves `auth.uid()` and RLS does the rest. Any
 * read of customer-owned data goes through here, never through the
 * service-role client — otherwise RLS would be decorative.
 *
 * Cookie writes are only possible from a Server Action or Route Handler.
 * Server Components still get a working read client; this is the documented
 * @supabase/ssr behaviour, not a defect.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set — copy .env.example to .env and fill them in.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, which cannot mutate cookies.
          // middleware.ts refreshes the session for these requests anyway.
        }
      },
    },
  });
}