import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reservation expiry sweep.
 *
 * Inventory held by an unpaid order has to come back even when nobody is
 * looking at the shop. place_order() already sweeps before each new order, so
 * this is belt-and-braces for the quiet case — a drop that closes at 3am and
 * buys nothing until Thursday should not keep a size reserved until then.
 *
 * Callable two ways:
 *   - Vercel Cron:  GET /api/cron/expire  with `Authorization: Bearer <CRON_SECRET>`
 *   - by hand:     npm run orders:expire
 *
 * The SERVICE ROLE client is required, not the request-scoped one:
 * expire_reservations() is revoked from authenticated so that no customer can
 * call it, and a request-scoped client carries the customer's own JWT.
 *
 * Not using pg_cron on purpose. Creating the extension inside a migration risks
 * rolling back a file that also carries the reservation logic, and the app's
 * own scheduler is available anyway.
 */

export const dynamic = "force-dynamic";

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

async function sweep() {
  const { data, error } = await createAdminClient().rpc("expire_reservations", { p_limit: 500 });
  if (error) {
    console.error("[expire] sweep failed:", error.message);
    return NextResponse.json({ ok: false, error: "SWEEP_FAILED" }, { status: 500 });
  }
  const expired = Number(data ?? 0);
  if (expired > 0) console.log(`[expire] released ${expired} reservation(s)`);
  return NextResponse.json({ ok: true, expired });
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return sweep();
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  return sweep();
}