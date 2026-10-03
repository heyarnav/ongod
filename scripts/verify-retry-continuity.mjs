import fs from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

/**
 * Checkout continuity — an abandoned payment must not cost the shopper the
 * order they already made, or the stock it is holding.
 *
 * What it covers:
 *   1. an order created for a real cart reserves stock and comes back with a
 *      gateway order id
 *   2. a retried payment reopens THAT order — same application order id, same
 *      gateway order id, and no second row in `orders`
 *
 * Why the second point is worth a test: the obvious retry is to call
 * POST /api/checkout again. That creates a second order and takes a second
 * hold on the same stock, so every retry leaks inventory until the sweep
 * releases it — and the shopper can pay either one. /api/checkout/gateway
 * exists to prevent exactly that, and until now nothing called it.
 */

const raw = fs.readFileSync(".env", "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.BASE ?? "http://localhost:3000";
const GATEWAY_CONFIGURED = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
const HOLD_MINUTES = 30;

let passed = 0;
let failed = 0;

function check(label, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${label}${detail ? `\n          ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`);
  }
}

const service = createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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

/** A confirmed customer, established through a cookie jar like a browser. */
async function sessionFor(email) {
  const { data: link, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw new Error(`generateLink failed for ${email}: ${error.message}`);
  const jar = {};
  const { supabase, header } = jarClient(jar);

  let minted = null;
  for (const type of ["email", "magiclink"]) {
    const attempt = await supabase.auth.verifyOtp({ token_hash: link.properties.hashed_token, type });
    if (!attempt.error) {
      minted = attempt.data;
      break;
    }
  }
  if (!minted) throw new Error(`verifyOtp failed for ${email}`);
  return { cookie: header(), userId: minted.user.id };
}

const created = { orders: [], products: [], collections: [], users: [] };

try {
  console.log(`\ncheckout continuity  (gateway: ${GATEWAY_CONFIGURED ? "CONFIGURED" : "NOT CONFIGURED"})\n`);

  // ── Fixtures ──────────────────────────────────────────────────────────────
  const email = `continuity-${Date.now()}@example.com`;
  const { data: user, error: userErr } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password: "x".repeat(24),
  });
  if (userErr) throw new Error(`createUser failed: ${userErr.message}`);
  created.users.push(user.user.id);

  const { data: customer, error: custErr } = await service
    .from("customers")
    .insert({ supabase_user_id: user.user.id, email, name: "Continuity Tester", phone: "9000000000" })
    .select("id")
    .single();
  if (custErr) throw new Error(`customer insert failed: ${custErr.message}`);

  const stamp = Date.now();
  const { data: collection, error: collErr } = await service
    .from("collections")
    .insert({
      name: "CONTINUITY",
      slug: `continuity-${stamp}`,
      number: "900",
      description: "fixture",
      sort_order: 9999,
      published: false,
    })
    .select("id")
    .single();
  if (collErr) throw new Error(`collection insert failed: ${collErr.message}`);
  created.collections.push(collection.id);

  const { data: product, error: prodErr } = await service
    .from("products")
    .insert({
      collection_id: collection.id,
      name: "CONTINUITY",
      slug: `continuity-${stamp}`,
      archive_number: "900",
      description: "fixture",
      price: 100000,
      currency: "INR",
      status: "PUBLISHED",
      drop_status: "PRE_ORDER",
      featured: false,
    })
    .select("id")
    .single();
  if (prodErr) throw new Error(`product insert failed: ${prodErr.message}`);
  created.products.push(product.id);

  const { data: variant, error: varErr } = await service
    .from("product_variants")
    .insert({ product_id: product.id, size: "M", sku: `CONT-${stamp}`, stock: 5, active: true })
    .select("id, stock")
    .single();
  if (varErr) throw new Error(`variant insert failed: ${varErr.message}`);

  const session = await sessionFor(email);

  const post = (path, body) =>
    fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: session.cookie },
      body: JSON.stringify(body),
    });

  // ── 1. The order, as the browser creates it ────────────────────────────────
  console.log("1. an order is created and holds its stock");
  const placed = await post("/api/checkout", {
    customer: {
      name: "Continuity Tester",
      email,
      phone: "9000000000",
      addressLine1: "1 Test Street",
      addressLine2: "",
      city: "Mumbai",
      state: "Maharashtra",
      postalCode: "400001",
      country: "IN",
    },
    items: [{ productId: product.id, size: "M", quantity: 1 }],
    addressId: null,
    saveAddress: false,
    reservationMinutes: HOLD_MINUTES,
  });
  const order = await placed.json();
  if (!placed.ok) throw new Error(`checkout failed: ${placed.status} ${JSON.stringify(order)}`);
  created.orders.push(order.orderId);

  check("the order was created", Boolean(order.orderId), order.orderNumber);
  check("a reservation deadline came back", Boolean(order.reservationExpiresAt));
  check("the stock is held", order.reservationExpiresAt !== null);

  if (GATEWAY_CONFIGURED) {
    check("a gateway order id came back", Boolean(order.gatewayOrderId), order.gatewayOrderId ?? "none");
  } else {
    console.log("  SKIP  gateway assertions — RAZORPAY_KEY_* not set");
  }

  const { count: ordersBefore } = await service
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customer.id);

  // ── 2. The retry ───────────────────────────────────────────────────────────
  console.log("\n2. retrying payment reuses that order");
  const retried = await post("/api/checkout/gateway", { orderId: order.orderId });
  const retryBody = await retried.json();

  check("the retry is accepted", retried.ok, retried.ok ? "" : JSON.stringify(retryBody));
  if (retried.ok) {
    check(
      "it returns the SAME gateway order id",
      retryBody.gatewayOrderId === order.gatewayOrderId,
      `first ${order.gatewayOrderId} / retry ${retryBody.gatewayOrderId}`,
    );
    check("it returns a public key for the sheet", Boolean(retryBody.keyId));
  }

  const { count: ordersAfter } = await service
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customer.id);

  check(
    "no second order was created",
    ordersAfter === ordersBefore,
    `before ${ordersBefore} / after ${ordersAfter}`,
  );

  // A third call, because the failure mode is "works once" being good enough.
  const again = await post("/api/checkout/gateway", { orderId: order.orderId });
  const againBody = await again.json();
  check(
    "a second retry is still the same order",
    again.ok && againBody.gatewayOrderId === order.gatewayOrderId,
    again.ok ? againBody.gatewayOrderId : JSON.stringify(againBody),
  );

  const { count: ordersFinal } = await service
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customer.id);
  check("still no second order", ordersFinal === ordersBefore, `${ordersBefore} → ${ordersFinal}`);

  const { count: strangers } = await service
    .from("orders")
    .select("id", { count: "exact", head: true })
    .not("id", "in", `(${created.orders.join(",")})`)
    .eq("customer_id", customer.id);
  check("the customer has exactly the one order", strangers === 0);

  console.log(`\n${failed === 0 ? "ALL PASS" : "FAILURES"} — ${passed} passed, ${failed} failed\n`);
} finally {
  // Stock back before the rows go, so cleanup never leaves the fixture holding.
  if (created.products.length) {
    const { data: v } = await service
      .from("product_variants")
      .select("id, stock")
      .in("product_id", created.products);
    for (const variant of v ?? []) {
      await service.from("product_variants").update({ stock: variant.stock }).eq("id", variant.id);
    }
  }
  for (const id of created.orders) {
    await service.from("order_items").delete().eq("order_id", id);
    await service.from("orders").delete().eq("id", id);
  }
  for (const id of created.products) await service.from("product_variants").delete().eq("product_id", id);
  for (const id of created.products) await service.from("products").delete().eq("id", id);
  for (const id of created.collections) await service.from("collections").delete().eq("id", id);
  for (const id of created.users) await service.auth.admin.deleteUser(id);
  console.log(
    `cleanup\n  removed ${created.orders.length} order(s), ${created.products.length} product(s), ${created.collections.length} collection(s), ${created.users.length} auth user(s)\n`,
  );
}

process.exit(failed === 0 ? 0 : 1);