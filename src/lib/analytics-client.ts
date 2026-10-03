/**
 * ANALYTICS — the browser half.
 *
 * A client may name an event and nothing more. productId and meta are
 * accepted for call-site readability but deliberately NOT sent: the server
 * records the authoritative version of anything that counts, so a browser
 * can neither inflate a conversion nor attribute it to a product it never
 * viewed. See lib/analytics.ts.
 */

const CLIENT_EVENTS = new Set([
  "VIEW_PAGE",
  "ADD_TO_CART",
  "OPEN_DRAWER",
  "CHECKOUT_START",
]);

type TrackOptions = {
  productId?: string;
  meta?: Record<string, unknown>;
};

export function track(name: string, _options?: TrackOptions): void {
  if (typeof navigator === "undefined") return;
  if (!CLIENT_EVENTS.has(name)) return;

  try {
    const body = JSON.stringify({ name, path: window.location.pathname });

    if (typeof navigator.sendBeacon === "function") {
      navigator.sendBeacon(
        "/api/analytics",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }

    void fetch("/api/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Telemetry is never worth breaking a purchase over.
  }
}