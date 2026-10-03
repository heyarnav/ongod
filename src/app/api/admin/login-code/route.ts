import { after, NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Request a Control Room sign-in code.
 *
 * This route is PUBLIC on purpose — it runs before anyone has a session, so it
 * is the one endpoint under /api/admin that must never assume authorisation.
 * That is exactly why "may this address ask for a code" is decided here, on the
 * server, rather than in the login form where anyone could skip it.
 *
 * The rule: a code goes out only when `admin_users` already grants that address
 * Control Room access. Three things follow, and all three are the point:
 *
 *   - no junk `auth.users` rows from the login screen (`shouldCreateUser: false`
 *     also closes the race where two visitors request the same unknown address)
 *   - no email quota spent by anyone who is not an operator
 *   - no way to learn which addresses are operators: one status, one body, and
 *     the send deferred until after the response has been returned
 *
 * The deferral is load-bearing. An earlier version awaited the send, and the
 * operator path then took 3.7s against 612ms for a stranger — the SMTP hand-off
 * announced who holds the role more clearly than any error message could.
 *
 * It grants nothing. A code proves who you are; `requireAdmin()` in the
 * dashboard layout still refuses anyone without the row.
 */

export const dynamic = "force-dynamic";

const ALWAYS_OK = { ok: true } as const;

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown };
    if (isEmail(body?.email)) email = body.email.trim().toLowerCase();
  } catch {
    // An unparseable body is treated exactly like an unknown address.
  }

  if (email && supabaseUrl && anonKey) {
    after(async () => {
      try {
        const admin = createAdminClient();

        // The grant is stored by email as well as by auth id, so matching on it
        // never enumerates every auth user.
        const { data: grant } = await admin
          .from("admin_users")
          .select("user_id")
          .eq("email", email)
          .maybeSingle();

        if (!grant?.user_id) return;

        // Only mail an address the auth server agrees is that user's own.
        // `admin_users.email` is a copy and could drift.
        const { data: fetched } = await admin.auth.admin.getUserById(grant.user_id);
        const authUser = "user" in fetched ? fetched.user : null;
        if ((authUser?.email ?? "").toLowerCase() !== email) return;

        const anon = createClient(supabaseUrl, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const { error: sendError } = await anon.auth.signInWithOtp({
          email,
          options: {
            // Never create an account from the login screen. Customers are
            // created here on purpose; operators are not.
            shouldCreateUser: false,
            emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/callback?next=%2Fadmin`,
          },
        });

        // Never surfaced to the caller — a rate limit or an SMTP failure must
        // not become "that address is not an operator" — but logged, because
        // otherwise a broken mailer on this path is completely invisible.
        if (sendError) console.warn(`[login-code] send failed: ${sendError.message}`);
      } catch (err) {
        console.warn(`[login-code] gate failed: ${(err as Error).message}`);
      }
    });
  }

  return NextResponse.json(ALWAYS_OK, { status: 200 });
}
