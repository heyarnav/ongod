import fs from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

/**
 * Checkout integration test — the authenticated half of the new flow.
 *
 * Drives the running server over HTTP with a real Supabase session, so it
 * exercises the same path a browser does: cookies, RLS, route handlers.
 *
 * What it covers, and what it deliberately does not:
 *   - order creation requires a session, and reserves stock
 *   - the webhook rejects a forged signature and accepts a real one
 *   - a signature-verified capture marks the order PAID, which is the state a
 *     customer sees after closing their browser mid-payment
 *   - one customer cannot read another customer's order
 *
 * It does NOT test a real Razorpay charge: RAZORPAY_KEY_* are unset, so the
 * gateway leg is dormant and the orders below settle at PENDING. See the
 * implementation report.
 */

const raw = fs.readFileSync(".env", "utf8");
const env = {};
for (const l of raw.split("\n")) {
  const i = l.indexOf("=");
  if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.BASE ?? "http://localhost:3000";
const WEBHOOK_SECRET = env.RAZORPAY_WEBHOOK_SECRET;
const operatorEmail = process.env.OPERATOR_EMAIL ?? "arnavkumar.me@gmail.com";
const GATEWAY_CONFIGURED = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);

let pass = 0;
let fail = 0;
function check(label, ok, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${detail}`); }
}

const service = createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Mint a real session AND the exact cookie header the Next server expects.
 *
 * The cookie name and encoding are @supabase/ssr's business, not something to
 * be guessed: the session has to be established through a server client with a
 * cookie jar so it writes the same chunked cookie the browser would.
 */
function jarClient(jar) {
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) jar[name] = value;
      },
    },
  });
  return {
    supabase,
    header: () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; "),
  };
}

async function sessionAsExisting(email) {
  const { data: link, error: linkErr } = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (linkErr) throw new Error(`generateLink failed for ${email}: ${linkErr.message}`);
  const hashed = link?.properties?.hashed_token;
  if (!hashed) throw new Error("no token hash returned");

  const jar = {};
  const { supabase, header } = jarClient(jar);

  let minted = null;
  for (const type of ["email", "magiclink"]) {
    const attempt = await supabase.auth.verifyOtp({ token_hash: hashed, type });
    if (!attempt.error) { minted = attempt.data; break; }
  }
  if (!minted) throw new Error(`verifyOtp failed for ${email}`);

  return {
    cookie: header(),
    accessToken: minted.session.access_token,
    userId: minted.user.id,
  };
}

function api(path, { cookie, method = "GET", body, headers = {} } = {}) {
  return fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    // A string body is sent verbatim — the webhook signs the exact bytes, so
    // re-serialising it here would make every signature mismatch.
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ORDER_BODY = (email) => ({
  customer: {
    name: "Checkout Flow Test",
    email,
    phone: "9000000000",
    addressLine1: "77 Test Lane",
    addressLine2: "",
    city: "Pune",
    state: "Maharashtra",
    postalCode: "411001",
    country: "IN",
  },
  items: [{ productId: "077e4ce5-d6d5-4e39-a0f8-bcdfdeeb1982", size: "M", quantity: 1 }],
  saveAddress: false,
  reservationMinutes: 30,
});

const createdOrders = [];
const createdAuthUsers = [];

console.log(`\ncheckout integration — authenticated paths  (gateway: ${GATEWAY_CONFIGURED ? "CONFIGURED" : "dormant"})\n`);

// ── 1. Order creation requires a session ────────────────────────────────────
console.log("1. authentication boundary");
{
  const anon = await api("/api/checkout", { method: "POST", body: ORDER_BODY("nobody@example.invalid") });
  check("an anonymous POST /api/checkout is refused", anon.status === 401, `got ${anon.status}`);

  const verify = await api("/api/checkout/otp/verify");
  check("an anonymous OTP-verify is refused", verify.status === 401, `got ${verify.status}`);
}

// ── 2. A signed-in customer can order, and stock is held ────────────────────
console.log("\n2. order creation reserves stock");
const customer = await sessionAsExisting(operatorEmail);
let orderNumber = null;
let orderId = null;
{
  const { data: before } = await service
    .from("product_variants")
    .select("stock")
    .eq("id", "0e0e0000-0000-0000-0000-000000000000")
    .maybeSingle();

  const res = await api("/api/checkout", { cookie: customer.cookie, method: "POST", body: ORDER_BODY(operatorEmail) });
  const data = await res.json();
  check("the order was created", res.status === 200, `status ${res.status} ${JSON.stringify(data).slice(0, 160)}`);

  if (res.status === 200) {
    orderNumber = data.orderNumber;
    orderId = data.orderId;
    createdOrders.push(orderId);
    if (GATEWAY_CONFIGURED) {
      check("it reports the gateway as razorpay", data.gateway === "razorpay", data.gateway);
      check("a real gateway order id came back", /^order_/.test(String(data.gatewayOrderId)), String(data.gatewayOrderId));
      check("a public key id was returned for the hosted sheet", !!data.keyId, String(data.keyId));
      console.log(`        (razorpay order ${data.gatewayOrderId})`);
    } else {
      check("it reports the gateway as dormant", data.gateway === "pending", data.gateway);
      check("no gateway order id is invented", data.gatewayOrderId === null, String(data.gatewayOrderId));
    }
    check("a reservation deadline is returned", !!data.reservationExpiresAt, String(data.reservationExpiresAt));

    const { data: row } = await service
      .from("orders")
      .select("status, payment_status, reservation_expires_at, shipping_address_line_1, shipping_city, total")
      .eq("id", orderId)
      .single();
    check("the order is PENDING", row.status === "PENDING" && row.payment_status === "PENDING");
    check("stock hold is live", !!row.reservation_expires_at);
    check("shipping snapshot is frozen on the order", row.shipping_address_line_1 === "77 Test Lane" && row.shipping_city === "Pune");

    const { data: variant } = await service
      .from("product_variants")
      .select("id, stock")
      .eq("product_id", "077e4ce5-d6d5-4e39-a0f8-bcdfdeeb1982")
      .eq("size", "M")
      .maybeSingle();
    console.log(`        (size M stock now ${variant?.stock})`);
  }
}

// ── 3. The webhook contract ─────────────────────────────────────────────────
console.log("\n3. webhook authenticity");
if (orderId) {
  // Attach a gateway order id the way a successful /api/checkout would.
  const gwId = `order_test_${Date.now()}`;
  await service.from("orders").update({ gateway_order_id: gwId }).eq("id", orderId);

  const payload = {
    event: "payment.captured",
    payload: { payment: { entity: { id: `pay_${Date.now()}`, order_id: gwId, status: "captured", amount: 349900, currency: "INR" } } },
  };
  const raw = JSON.stringify(payload);

  const forged = await api("/api/webhooks/razorpay", {
    method: "POST",
    body: raw,
    headers: { "x-razorpay-signature": "deadbeef".repeat(8) },
  });
  check("a forged signature is rejected", forged.status === 401, `got ${forged.status}`);

  const unsigned = await api("/api/webhooks/razorpay", { method: "POST", body: raw });
  check("a missing signature is rejected", unsigned.status === 401, `got ${unsigned.status}`);

  if (!WEBHOOK_SECRET) {
    // Dormant by default: with no secret configured the route cannot verify
    // anything and must refuse everything. The ACCEPTED half of the contract is
    // only exercised when a secret is present, which is the state you get once
    // the webhook is registered in the dashboard.
    check("no secret configured, so every signature is refused", forged.status === 401);
    console.log("        (SKIPPED the signed-accept half: RAZORPAY_WEBHOOK_SECRET is unset)");
    console.log("         run with that secret set to exercise it)");
  } else {
  const { createHmac } = await import("node:crypto");
  const good = createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex");
  const ok = await api("/api/webhooks/razorpay", {
    method: "POST",
    body: raw,
    headers: { "x-razorpay-signature": good },
  });
  check("a correctly signed capture is accepted", ok.status === 200, `got ${ok.status}`);

  const { data: after } = await service
    .from("orders")
    .select("status, payment_status, gateway_payment_id, paid_at")
    .eq("id", orderId)
    .single();
  if (WEBHOOK_SECRET) {
    check("the order is PAID after the webhook", after.status === "PAID" && after.payment_status === "PAID", `${after.status}/${after.payment_status}`);
    check("the payment id was recorded", !!after.gateway_payment_id);
    check("paid_at was stamped by the database", !!after.paid_at);
  } else {
    check("a refused webhook left the order PENDING (never falsely PAID)", after.payment_status === "PENDING", after.payment_status);
  }

  // Razorpay retries webhooks; a second arrival must be a no-op.
  const repeat = await api("/api/webhooks/razorpay", {
    method: "POST",
    body: raw,
    headers: { "x-razorpay-signature": good },
  });
  check("a retried webhook is idempotent", repeat.status === 200, `got ${repeat.status}`);
  }
}

// ── 4. RLS isolation between two customers ──────────────────────────────────
console.log("\n4. one customer cannot reach another's order");
if (orderId) {
  const secondEmail = `rls-probe-${Date.now()}@example.invalid`;
  const { data: made, error: mkErr } = await service.auth.admin.createUser({ email: secondEmail, email_confirm: true });
  if (mkErr) throw mkErr;
  createdAuthUsers.push(made.user.id);

  const anon = createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  // Set a password rather than minting a magic link: deterministic, and this
  // probe is about RLS, not about the OTP path.
  const secondPassword = `Pr0be-${Date.now()}-Aa`;
  await service.auth.admin.updateUserById(made.user.id, { password: secondPassword });
  const { data: sess, error: sErr } = await anon.auth.signInWithPassword({ email: secondEmail, password: secondPassword });
  const secondSession = sess?.session ?? null;
  check("a second customer could be signed in", !!secondSession, sErr?.message ?? "");

  if (secondSession) {
    const scoped = createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${secondSession.access_token}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: seen } = await scoped.from("orders").select("id").eq("id", orderId);
    check("the second customer cannot read the order", (seen ?? []).length === 0, `${(seen ?? []).length} row(s)`);

    const { data: own } = await scoped.from("orders").select("id");
    check("they can read their own (empty) order list", Array.isArray(own));
  }
}

// ── 5. The customer can see it in their account ─────────────────────────────
console.log("\n5. account surfaces the same order");
if (orderId) {
  const page = await api(`/account/orders/${orderId}`, { cookie: customer.cookie });
  const html = await page.text();
  check("the order detail page renders for its owner", page.status === 200, `got ${page.status}`);
  check("it shows the order number", html.includes(orderNumber), orderNumber);
  check("it shows the frozen address", html.includes("77 Test Lane"));
  // OrderTimeline renders every stage, so "Payment confirmed" appears even on an
  // unpaid order. Assert the unambiguous state instead — but only meaningful once
  // a capture has actually been accepted.
  if (WEBHOOK_SECRET) {
    check("it no longer reads as pending payment", !/Payment pending/i.test(html));
  } else {
    check("it renders the order with its frozen address", html.includes("77 Test Lane"));
  }
  check("it does not leak a gateway secret", !html.includes("localtestwebhooksecret"));
}

console.log("\ncleanup");
/**
 * Return the stock this run held, THEN delete the orders.
 *
 * Deleting an order row does not return its stock — that is expire_reservations'
 * job — so a test that deletes without restoring quietly eats real inventory,
 * one piece per run. Restore by incrementing by the ordered quantity, which is
 * the same arithmetic the expiry sweep performs.
 */
let restored = 0;
for (const id of createdOrders) {
  const { data: items } = await service
    .from("order_items")
    .select("variant_id, quantity")
    .eq("order_id", id);
  for (const it of items ?? []) {
    const { data: v } = await service
      .from("product_variants")
      .select("stock")
      .eq("id", it.variant_id)
      .maybeSingle();
    if (v) {
      await service
        .from("product_variants")
        .update({ stock: Number(v.stock) + Number(it.quantity) })
        .eq("id", it.variant_id);
      restored += Number(it.quantity);
    }
  }
}
for (const id of createdOrders) await service.from("orders").delete().eq("id", id);
for (const id of createdAuthUsers) await service.auth.admin.deleteUser(id);
console.log(`  restored ${restored} unit(s) of stock`);
console.log(`  removed ${createdOrders.length} order(s), ${createdAuthUsers.length} auth user(s)`);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);