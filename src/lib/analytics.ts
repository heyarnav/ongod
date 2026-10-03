import "server-only";

import { createAdminClient } from "./supabase/admin";

/**
 * ANALYTICS — the archive's own traffic record.
 *
 * Server-side only. A browser can name an event, but everything that actually
 * matters (a product view, an order placed) is written here from the row we
 * just committed, so a client can never inflate a count or forge a conversion.
 */
export type EventName =
  | "VIEW_PAGE"
  | "VIEW_PRODUCT"
  | "ADD_TO_CART"
  | "OPEN_DRAWER"
  | "CHECKOUT_START"
  | "ORDER_PLACED"
  | "LOGIN";

export const EVENT_NAMES: EventName[] = [
  "VIEW_PAGE",
  "VIEW_PRODUCT",
  "ADD_TO_CART",
  "OPEN_DRAWER",
  "CHECKOUT_START",
  "ORDER_PLACED",
  "LOGIN",
];

export type RecordEventInput = {
  name: EventName;
  path?: string;
  productId?: string | null;
  customerId?: string | null;
  sessionId?: string;
  referrer?: string;
  meta?: Record<string, unknown>;
};

/**
 * Never throws and never rejects: an analytics write must not be able to fail
 * a render or an order. Callers on a render path can fire-and-forget.
 */
export async function recordEvent(input: RecordEventInput): Promise<void> {
  try {
    await createAdminClient().from("analytics_events").insert({
      event_name: input.name,
      path: input.path ?? "",
      product_id: input.productId ?? null,
      customer_id: input.customerId ?? null,
      session_id: input.sessionId ?? "",
      referrer: input.referrer ?? "",
      metadata: (input.meta ?? {}) as Record<string, unknown>,
    });
  } catch (err) {
    console.error("analytics: event not recorded —", err);
  }
}

export type AnalyticsSummary = {
  total: number;
  last7d: number;
  byEvent: Array<{ name: string; count: number }>;
  daily: Array<{ day: string; count: number }>;
  topProducts: Array<{ slug: string; name: string; views: number }>;
};

/** Aggregate read for the Control Room. Requires an authorized caller. */
export async function getAnalyticsSummary(days = 14): Promise<AnalyticsSummary> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const [totalRes, recentRes, byEventRes, dailyRes, topRes] = await Promise.all([
    supabase.from("analytics_events").select("id", { count: "exact", head: true }),
    supabase
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
    supabase.from("analytics_events").select("event_name").gte("created_at", since),
    supabase.from("analytics_events").select("created_at").gte("created_at", since),
    supabase
      .from("analytics_events")
      .select("product_id, products ( slug, name )")
      .eq("event_name", "VIEW_PRODUCT")
      .gte("created_at", since),
  ]);

  const byEvent = new Map<string, number>();
  for (const row of byEventRes.data ?? []) {
    byEvent.set(row.event_name, (byEvent.get(row.event_name) ?? 0) + 1);
  }

  const daily = new Map<string, number>();
  for (const row of dailyRes.data ?? []) {
    const day = new Date(row.created_at).toISOString().slice(0, 10);
    daily.set(day, (daily.get(day) ?? 0) + 1);
  }

  const products = new Map<string, { slug: string; name: string; views: number }>();
  for (const row of topRes.data ?? []) {
    const p = row.products as unknown as { slug: string; name: string } | null;
    const slug = Array.isArray(p) ? p[0]?.slug : p?.slug;
    const name = Array.isArray(p) ? p[0]?.name : p?.name;
    if (!slug) continue;
    const entry = products.get(slug) ?? { slug, name: name ?? slug, views: 0 };
    entry.views += 1;
    products.set(slug, entry);
  }

  return {
    total: totalRes.count ?? 0,
    last7d: recentRes.count ?? 0,
    byEvent: [...byEvent.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    daily: [...daily.entries()]
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    topProducts: [...products.values()].sort((a, b) => b.views - a.views).slice(0, 10),
  };
}