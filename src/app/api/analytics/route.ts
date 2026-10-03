import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Client analytics ingest.
 *
 * Deliberately narrow: the browser may name an event and give a path, and
 * nothing else. There is no productId, no meta, no customer identity — so
 * nothing a client sends can be counted as a conversion. The events that
 * matter are written server-side (lib/analytics.ts).
 *
 * The insert uses the service role because an anonymous visitor has no RLS
 * grant to write here; the payload is allow-listed below, so the elevated
 * key is not being handed a browser-controlled row.
 */

const CLIENT_EVENTS = new Set([
  "VIEW_PAGE",
  "ADD_TO_CART",
  "OPEN_DRAWER",
  "CHECKOUT_START",
]);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const name = typeof body?.name === "string" ? body.name : "";
  if (!CLIENT_EVENTS.has(name)) {
    return NextResponse.json({ error: "UNKNOWN_EVENT" }, { status: 400 });
  }

  const path = typeof body?.path === "string" ? body.path.slice(0, 300) : "";

  try {
    await createAdminClient().from("analytics_events").insert({
      event_name: name,
      path,
      referrer: (req.headers.get("referer") ?? "").slice(0, 300),
      metadata: {},
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch {
    // Never surface a telemetry failure to the page that fired it.
    return NextResponse.json({ ok: true }, { status: 201 });
  }
}