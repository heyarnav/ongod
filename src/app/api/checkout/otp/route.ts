import { after, NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { siteOrigin } from "@/lib/site-origin";
import { createCheckoutDraft, newDraftToken } from "@/lib/checkout-draft-server";

/**
 * Send a checkout verification code.
 *
 * PUBLIC on purpose — it runs before the shopper has any session. It replaces
 * what used to be a redirect to /account/login: the customer fills in the form
 * on /checkout and proves the address there, without ever leaving the page.
 *
 * The threat this route has to resist is email-budget exhaustion. Every
 * sign-in in this store is an email, and a checkout form is a form anyone on
 * the internet can POST to, so:
 *
 *   - the address is throttled on a server-side ledger, because an in-memory
 *     window does not survive serverless and Supabase's own limiter only stops
 *     one address spamming itself, not one visitor trying many;
 *   - the response is always 200 {ok:true} with an identical body, so it
 *     cannot be used to learn whether an address is a customer;
 *   - the send is deferred with after(), so response time cannot leak whether a
 *     code was actually dispatched.
 *
 * shouldCreateUser: true is correct HERE and wrong in the operator login, which
 * uses false. A first-time shopper must be able to check out without visiting
 * a signup page first — that is the entire point of this flow.
 */

export const dynamic = "force-dynamic";

/**
 * The body is always `{ ok: true }`, plus the caller's own draft token.
 *
 * The token is returned whether or not anything was sent, and it says nothing
 * about whether the address is a customer — it is a fresh random string that
 * this response just invented. So the enumeration guarantee is intact.
 */
function okBody(draftToken: string | null) {
  return { ok: true as const, draftToken };
}

/** Per-address. Generous enough for a genuine typo, tight enough to be useless. */
const EMAIL_WINDOW_MINUTES = 10;
const EMAIL_MAX = 3;
/** Per-IP, across all addresses, so one visitor cannot enumerate. */
const IP_WINDOW_MINUTES = 60;
const IP_MAX = 20;

/** Salted so a leaked ledger cannot be reversed into an address book. */
function hash(value: string): string {
  const salt = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "ongod.checkout.otp";
  return crypto.createHmac("sha256", salt).update(value.trim().toLowerCase()).digest("hex");
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let email = "";
  let cart: unknown = [];
  let form: unknown = {};
  try {
    const body = (await req.json()) as { email?: unknown; cart?: unknown; form?: unknown };
    if (isEmail(body?.email)) email = body.email.trim().toLowerCase();
    cart = body?.cart;
    form = body?.form;
  } catch {
    // An unparseable body is treated exactly like an unthrottled stranger.
  }

  // Minted before anything is sent so the response can always carry a token the
  // client can restore from. It is not persisted yet — the row is created
  // inside after(), so a throttled or failed send leaves nothing behind.
  const draftToken = newDraftToken();

  if (email && supabaseUrl && anonKey) {
    // Read before after(): the emailed link is the only thing that carries this
    // shopper back to checkout, and a relative redirect_to is discarded by
    // Supabase without a word — the shopper would land on the homepage instead.
    //
    // The draft token rides in `next`, and it is the ONLY draft detail in the
    // URL: no address, name, product or price. Opened from any browser, any
    // device, an in-app mail viewer or a private window, /checkout reads it back
    // and restores the basket the server kept.
    const next = `/checkout?draft=${draftToken}`;
    const redirectTo = `${siteOrigin(req)}/auth/callback?next=${encodeURIComponent(next)}`;

    // Logged, because this string is invisible everywhere else. If the link in
    // a shopper's inbox takes them somewhere unexpected, this line in the
    // deployment log is the whole diagnosis.
    console.log(`[checkout-otp] link returns to ${redirectTo}`);

    const emailHash = hash(email);
    const ipHash = hash(clientIp(req));

    after(async () => {
      try {
        const admin = createAdminClient();

        const [{ count: byEmail }, { count: byIp }] = await Promise.all([
          admin
            .from("checkout_otp_requests")
            .select("id", { count: "exact", head: true })
            .eq("email_hash", emailHash)
            .gte("created_at", new Date(Date.now() - EMAIL_WINDOW_MINUTES * 60_000).toISOString()),
          admin
            .from("checkout_otp_requests")
            .select("id", { count: "exact", head: true })
            .eq("ip_hash", ipHash)
            .gte("created_at", new Date(Date.now() - IP_WINDOW_MINUTES * 60_000).toISOString()),
        ]);

        // Over the limit: silently do nothing. The caller still sees 200, which
        // is what keeps this from becoming an oracle.
        if ((byEmail ?? 0) >= EMAIL_MAX || (byIp ?? 0) >= IP_MAX) {
          console.warn(`[checkout-otp] throttled ${emailHash.slice(0, 12)} (${byEmail}/${byIp})`);
          return;
        }

        await admin.from("checkout_otp_requests").insert({ email_hash: emailHash, ip_hash: ipHash });

        // Housekeeping, best-effort, and never in the request path.
        admin.rpc("prune_checkout_otp_requests").then(() => {}, () => {});

        // Past the throttle, so this only runs for a request that will actually
        // produce an email. No order and no reservation is created here — this
        // records an intention, nothing more.
        await createCheckoutDraft({ token: draftToken, email, cart, form });

        const anon = createClient(supabaseUrl, anonKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });

        const { error: sendError } = await anon.auth.signInWithOtp({
          email,
          options: {
            // This path mints the shopper. No signup form exists anywhere in the
            // store, so this is where a customer record comes from.
            shouldCreateUser: true,
            emailRedirectTo: redirectTo,
          },
        });

        if (sendError) {
          // Supabase's own rate limit lives here too — it is the second line of
          // defence after the ledger above. Logged, never surfaced, because a
          // distinct error body would re-open the enumeration channel.
          console.warn(`[checkout-otp] send failed: ${sendError.message}`);
        }
      } catch (err) {
        console.warn(`[checkout-otp] gate failed: ${(err as Error).message}`);
      }
    });
  }

  return NextResponse.json(okBody(draftToken), { status: 200 });
}