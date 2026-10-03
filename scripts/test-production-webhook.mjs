#!/usr/bin/env node
/**
 * Prove the DEPLOYED webhook accepts a correctly signed capture.
 *
 *   node scripts/test-production-webhook.mjs [base-url]
 *
 * This is the closest thing to Razorpay's own "Send Test Event" that can be
 * produced from here: a real gateway order, a real HMAC made with the webhook
 * secret from .env, POSTed at the deployed endpoint.
 *
 * What it establishes, and what it still does not:
 *   - the production route exists, is reachable, and is NOT asleep (the serverless
 *     cold-start case, where the first request to a fresh lambda fails);
 *   - the RAZORPAY_WEBHOOK_SECRET in .env is the SAME one Vercel is using — a
 *     mismatch here is the single most likely reason a real webhook would be
 *     silently refused after deployment;
 *   - the whole chain works end to end: signature -> mark_order_paid -> the
 *     order row the customer and the Control Room both read.
 *
 * What it is NOT: it does not prove Razorpay's servers can reach you. Only the
 * dashboard's "Send Test Event" proves that.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
try {
  const raw = fs.readFileSync(join(root, ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^["'](.*)["']$/, "$1");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
} catch { /* injected environment */ }

const BASE = (process.argv[2] ?? "https://wearongod.vercel.app").replace(/\/$/, "");
const SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const operatorEmail = process.env.OPERATOR_EMAIL ?? "arnavkumar.me@gmail.com";

let pass = 0, fail = 0;
const check = (l, ok, d = "") => {
  if (ok) { pass++; console.log(`  PASS  ${l}`); } else { fail++; console.log(`  FAIL  ${l} ${d}`); }
};

if (!SECRET || !KEY_ID || !KEY_SECRET) {
  console.error("Razorpay keys or the webhook secret are missing from .env.");
  process.exit(1);
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

console.log(`\nproduction webhook check — ${BASE}\n`);

// A real gateway order, so the id in the payload is one Razorpay issued.
const { default: Razorpay } = await import("razorpay");
const rzp = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
const gz = await rzp.orders.create({ amount: 100, currency: "INR", receipt: `prodtest-${Date.now()}` });
console.log(`  created gateway order ${gz.id}`);

// And a local order holding that gateway id plus its stock hold.
const { data: product } = await admin
  .from("products")
  .select("id")
  .eq("slug", "human-001-form")
  .maybeSingle();
const { data: variant } = await admin
  .from("product_variants")
  .select("id, stock")
  .eq("product_id", product.id)
  .eq("size", "M")
  .maybeSingle();

const stockBefore = variant.stock;
await admin.from("product_variants").update({ stock: stockBefore - 1 }).eq("id", variant.id);

const { data: order, error: ordErr } = await admin
  .from("orders")
  .insert({
    order_number: `OG-TEST-${Date.now().toString().slice(-6)}`,
    customer_id: null,
    status: "PENDING",
    payment_status: "PENDING",
    subtotal: 100,
    shipping_amount: 0,
    total: 100,
    currency: "INR",
    shipping_name: "Production Webhook Probe",
    shipping_phone: "9000000000",
    shipping_address_line_1: "1 Probe Street",
    shipping_city: "Pune",
    shipping_state: "Maharashtra",
    shipping_postal_code: "411001",
    email: operatorEmail,
    gateway_order_id: gz.id,
    reservation_expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
  })
  .select("id, order_number, payment_status")
  .single();
if (ordErr) { console.error("could not create the probe order:", ordErr.message); process.exit(1); }
console.log(`  created order ${order.order_number}`);

// ── the payload Razorpay would send ──────────────────────────────────────────
const payload = {
  event: "payment.captured",
  payload: {
    payment: {
      entity: {
        id: `pay_probe_${Date.now()}`,
        order_id: gz.id,
        status: "captured",
        amount: 100,
        currency: "INR",
      },
    },
  },
};
const body = JSON.stringify(payload);

// 1. Warm the function. Vercel can cold-start a freshly deployed route and the
//    FIRST request to a cold lambda is the classic place a webhook dies.
console.log("\n  cold-start warm-up:");
const coldStart = await fetch(`${BASE}/api/webhooks/razorpay`, { method: "GET" });
check("the route answers at all on a cold function", coldStart.status === 200, `got ${coldStart.status}`);

// 2. Forged signature must be refused.
const forged = await fetch(`${BASE}/api/webhooks/razorpay`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-razorpay-signature": "0".repeat(64) },
  body,
});
check("a forged signature is refused in production", forged.status === 401, `got ${forged.status}`);

// 3. The real thing.
const signature = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
const res = await fetch(`${BASE}/api/webhooks/razorpay`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-razorpay-signature": signature },
  body,
});
check("a correctly signed capture is accepted in production", res.status === 200, `got ${res.status} ${(await res.clone().text()).slice(0, 160)}`);

// 4. The order actually moved.
const { data: after } = await admin
  .from("orders")
  .select("status, payment_status, gateway_payment_id, paid_at")
  .eq("id", order.id)
  .single();
check("the order flipped to PAID", after.status === "PAID" && after.payment_status === "PAID", `${after.status}/${after.payment_status}`);
check("the payment id was stored", after.gateway_payment_id === payload.payload.payment.entity.id, String(after.gateway_payment_id));
check("paid_at was stamped", !!after.paid_at);

// 5. Idempotency, since Razorpay retries.
const again = await fetch(`${BASE}/api/webhooks/razorpay`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-razorpay-signature": signature },
  body,
});
check("a retried delivery is idempotent", again.status === 200, `got ${again.status}`);

// cleanup
await admin.from("orders").delete().eq("id", order.id);
await admin.from("product_variants").update({ stock: stockBefore }).eq("id", variant.id);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);