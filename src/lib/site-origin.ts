import type { NextRequest } from "next/server";

/**
 * The absolute origin a request arrived on, for building links that leave the
 * server.
 *
 * This exists because Supabase does not accept a relative `redirect_to`. Handed
 * one, it discards it silently and falls back to the Site URL configured in the
 * dashboard — which is the bare homepage. The shopper clicks "confirm your
 * address", lands on "/", and the session cookie is never written, because
 * /auth/callback is what writes it. That is not a degraded experience; the link
 * is dead, and nothing in the UI says so.
 *
 * Proven against this project's own Supabase: a relative redirect_to comes back
 * as `redirect_to=https://wearongod.vercel.app/`.
 *
 * So the origin is read off the request rather than trusted from the
 * environment. NEXT_PUBLIC_SITE_URL still wins when it is set — a deployment
 * reached through a preview host should mail links to the canonical domain —
 * but its absence can no longer produce a relative URL.
 *
 * Call this BEFORE handing the request to after(); the headers are read once,
 * up front, and the resulting string is what gets captured.
 */
export function siteOrigin(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  // Vercel and every other proxy in front of Next sets the forwarded pair.
  const host =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    req.headers.get("host")?.trim();

  if (host) {
    const local = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    const proto =
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || (local ? "http" : "https");
    return `${proto}://${host}`;
  }

  // No host header at all. This is still absolute and still same-origin with
  // the request, which is the property that actually matters.
  return req.nextUrl.origin;
}