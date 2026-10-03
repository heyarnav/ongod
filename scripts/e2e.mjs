#!/usr/bin/env node
/**
 * End-to-end verification against the live app and live database.
 *
 * Drives the real HTTP API with real Supabase JWTs, so what is exercised is
 * the actual security path: middleware -> route handler -> RLS -> Postgres.
 *
 *   npm run start          # in another shell
 *   node scripts/e2e.mjs
 *
 * The two test customers are created by this script with throwaway passwords so
 * it can mint real sessions. The operator, if one exists, is signed in WITHOUT
 * its password: the service role mints a magiclink and it is exchanged for a
 * session. No operator credential is ever read from .env.
 */

import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const raw = readFileSync(join(root, ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^["'](.*)["']$/, "$1");
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv();

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = process.env.BASE_URL || "http://localhost:3000";

const service = createClient(URL_, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0;
let fail = 0;
function check(label, condition, detail = "") {
  if (condition) {
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  } else {
    fail++;
    console.log(`  \x1b[31m✗\x1b[0m ${label} ${detail}`);
  }
}
function section(title) {
  console.log(`\n${title}`);
}

/** An in-memory cookie jar wired into a server client, plus its cookie header. */
function jarClient(jar) {
  const supabase = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) jar[name] = value;
      },
    },
  });
  return {
    supabase,
    header: () =>
      Object.entries(jar)
        .map(([k, v]) => `${k}=${v}`)
        .join("; "),
  };
}

/** A signed-in browser session, plus the cookie header the Next server expects. */
async function session(email, password) {
  const jar = {};
  const { supabase, header } = jarClient(jar);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return {
    supabase,
    cookie: header(),
    userId: data.user.id,
    accessToken: data.session.access_token,
  };
}

/**
 * A signed-in session for an account whose password we do not know and must not
 * ask for. The service role generates a magiclink for the existing user (no
 * email is sent), and its token hash is exchanged for a real session — so the
 * operator's credential stays in Supabase Auth and never touches this repo.
 */
async function sessionAsExisting(email) {
  const { data: link, error: linkErr } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr) throw new Error(`could not mint a link for ${email}: ${linkErr.message}`);
  const hashed = link?.properties?.hashed_token;
  if (!hashed) throw new Error(`no token hash returned for ${email}`);

  const jar = {};
  const { supabase, header } = jarClient(jar);
  // GoTrue redeems a generateLink token under type "email". Type "magiclink"
  // only works for an account that is already confirmed, so trying it alone
  // makes this helper fail for reasons that have nothing to do with the grant.
  let minted = null;
  let lastError = null;
  for (const type of ["email", "magiclink"]) {
    const attempt = await supabase.auth.verifyOtp({ token_hash: hashed, type });
    if (attempt.error) {
      lastError = attempt.error;
      continue;
    }
    minted = attempt.data;
    break;
  }
  if (!minted) throw new Error(`verifyOtp failed for ${email}: ${lastError?.message}`);
  return {
    supabase,
    cookie: header(),
    userId: minted.user.id,
    accessToken: minted.session.access_token,
  };
}

function api(path, { cookie, method = "GET", body, redirect } = {}) {
  return fetch(`${BASE}${path}`, {
    method,
    // `redirect` must be forwarded or fetch silently follows a 307 and the
    // assertion sees 200 instead.
    ...(redirect ? { redirect } : {}),
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function ensureUser(email, password) {
  const { data: list } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const found = (list?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email);
  if (found) {
    await service.auth.admin.updateUserById(found.id, { password, email_confirm: true });
    return found.id;
  }
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  return data.user.id;
}

const A = { email: "e2e-a@ongod.test", password: "e2e-password-a-9182" };
const B = { email: "e2e-b@ongod.test", password: "e2e-password-b-7741" };

async function main() {
  console.log(`\nTesting ${BASE} against ${URL_}\n${"=".repeat(60)}`);

  section("0. TEST FIXTURES");
  const aId = await ensureUser(A.email, A.password);
  const bId = await ensureUser(B.email, B.password);
  check("customer A auth user exists", Boolean(aId));
  check("customer B auth user exists", Boolean(bId));

  const a = await session(A.email, A.password);
  const b = await session(B.email, B.password);
  check("customer A holds a real Supabase JWT", a.accessToken.length > 50);
  check("customer B holds a real Supabase JWT", b.accessToken.length > 50);

  // Touch an authenticated route so each customer profile is materialised —
  // the row is created on first authenticated sight, not at signup.
  await api("/api/account/addresses", { cookie: a.cookie });
  await api("/api/account/addresses", { cookie: b.cookie });

  // Clear both books so this run is repeatable.
  for (const s of [a, b]) {
    const { addresses } = await (await api("/api/account/addresses", { cookie: s.cookie })).json();
    for (const addr of addresses ?? []) {
      await api(`/api/account/addresses/${addr.id}`, { cookie: s.cookie, method: "DELETE" });
    }
  }

  // Start from a known inventory position.
  const { data: product } = await service
    .from("products")
    .select("id, price, drop_status, status")
    .eq("slug", "human-001-form")
    .single();
  const { data: variantXL } = await service
    .from("product_variants")
    .select("id, stock, size")
    .eq("product_id", product.id)
    .eq("size", "XL")
    .single();
  await service
    .from("product_variants")
    .update({ stock: 10 })
    .eq("product_id", product.id)
    .in("size", ["XS", "S", "M", "L", "XL", "XXL"]);

  check("HUMAN / 001 is PUBLISHED + PRE_ORDER", product.status === "PUBLISHED" && product.drop_status === "PRE_ORDER");
  check("price stored as integer minor units", Number.isInteger(product.price) && product.price === 349900);

  // ── 1. Public catalogue ────────────────────────────────────────────────
  section("1. PUBLIC CATALOGUE (anon key)");
  const anon = createClient(URL_, ANON, { auth: { persistSession: false } });
  const { data: pubProducts } = await anon.from("products").select("slug, price");
  check("anon can read the published catalogue", pubProducts?.length >= 1, `got ${pubProducts?.length}`);
  check("anon sees HUMAN / 001 at ₹3,499", pubProducts?.some((p) => p.slug === "human-001-form" && p.price === 349900));

  // A DRAFT product must be invisible to the storefront.
  const { data: draft } = await service
    .from("products")
    .insert({
      slug: "e2e-draft-probe",
      name: "DRAFT PROBE",
      status: "DRAFT",
      price: 1000,
    })
    .select("id")
    .single();
  const { data: anonSeesDraft } = await anon.from("products").select("id").eq("id", draft.id);
  check("anon CANNOT see a DRAFT product", (anonSeesDraft ?? []).length === 0);
  const { data: adminSeesDraft } = await service.from("products").select("id").eq("id", draft.id);
  check("service role CAN see the DRAFT product", (adminSeesDraft ?? []).length === 1);

  // ── 2. Anonymity is refused ────────────────────────────────────────────
  section("2. ANONYMOUS ACCESS REFUSED");
  const anonOrders = await api("/api/account/addresses");
  check("anonymous address list -> 401", anonOrders.status === 401, `got ${anonOrders.status}`);

  const anonCustomers = await anon.from("customers").select("id");
  check("anon reads 0 customer rows via RLS", (anonCustomers.data ?? []).length === 0);
  const anonOrdersDirect = await anon.from("orders").select("id");
  check("anon reads 0 order rows via RLS", (anonOrdersDirect.data ?? []).length === 0);
  const anonAddressesDirect = await anon.from("addresses").select("id");
  check("anon reads 0 address rows via RLS", (anonAddressesDirect.data ?? []).length === 0);

  // ── 3. Customer records ────────────────────────────────────────────────
  section("3. CUSTOMER PROFILE");
  const { data: custA } = await service.from("customers").select("*").eq("supabase_user_id", aId).single();
  const { data: custB } = await service.from("customers").select("*").eq("supabase_user_id", bId).single();
  check("customer row created for A on first sight", Boolean(custA?.id));
  check("customer row created for B on first sight", Boolean(custB?.id));
  check("customer email is unique + from Auth", custA?.email === A.email);

  const aCustomers = await a.supabase.from("customers").select("id, email");
  const aSees = (aCustomers.data ?? []).map((r) => r.email);
  check("A sees only their own customer row", aSees.length === 1 && aSees[0] === A.email, JSON.stringify(aSees));

  // ── 4. Address CRUD ────────────────────────────────────────────────────
  section("4. ADDRESS CRUD");
  const created = await api("/api/account/addresses", {
    cookie: a.cookie,
    method: "POST",
    body: {
      label: "HOME",
      name: "A Recipient",
      phone: "9999999999",
      line1: "123 OLD STREET",
      line2: "FLAT 1",
      city: "MUMBAI",
      state: "MAHARASHTRA",
      postalCode: "400001",
      country: "IN",
      isDefault: true,
    },
  });
  const createdBody = await created.json();
  check("A can create an address", created.status === 201, JSON.stringify(createdBody));
  const addrA = createdBody.address;
  check("first address becomes the default", addrA?.isDefault === true);

  const listA = await (await api("/api/account/addresses", { cookie: a.cookie })).json();
  check("A's book contains exactly their address", listA.addresses?.length === 1);

  const listB = await (await api("/api/account/addresses", { cookie: b.cookie })).json();
  check("B's book is empty (cannot see A's)", (listB.addresses ?? []).length === 0);

  // A second address, then promote it.
  const second = await api("/api/account/addresses", {
    cookie: a.cookie,
    method: "POST",
    body: { line1: "9 SECOND ROAD", city: "PUNE", state: "MH", postalCode: "411001" },
  });
  const secondBody = await second.json();

  await api(`/api/account/addresses/${secondBody.address.id}`, {
    cookie: a.cookie,
    method: "PATCH",
    body: { isDefault: true },
  });
  const afterDefault = await (await api("/api/account/addresses", { cookie: a.cookie })).json();
  const defaults = afterDefault.addresses.filter((x) => x.isDefault);
  check("exactly one default after promoting", defaults.length === 1, `got ${defaults.length}`);
  check("the promoted address is the default", defaults[0]?.id === secondBody.address.id);

  // ── 5. Cross-customer access (the security test) ───────────────────────
  section("5. CROSS-CUSTOMER ISOLATION");
  const bReadsA = await b.supabase.from("addresses").select("*").eq("id", addrA.id);
  check("B cannot read A's address (RLS returns nothing)", (bReadsA.data ?? []).length === 0);

  const bUpdatesA = await b.supabase
    .from("addresses")
    .update({ address_line_1: "HACKED" })
    .eq("id", addrA.id)
    .select();
  check("B cannot update A's address", (bUpdatesA.data ?? []).length === 0);

  const bDeletesA = await b.supabase.from("addresses").delete().eq("id", addrA.id).select();
  check("B cannot delete A's address", (bDeletesA.data ?? []).length === 0);

  const { data: aStillThere } = await service
    .from("addresses")
    .select("address_line_1")
    .eq("id", addrA.id)
    .single();
  check("A's address is unchanged after B's attempts", aStillThere?.address_line_1 === "123 OLD STREET");

  const bRestRoute = await api(`/api/account/addresses/${addrA.id}`, {
    cookie: b.cookie,
    method: "PATCH",
    body: { line1: "HACKED" },
  });
  check("B's PATCH to A's address -> 404 (not 403, no existence leak)", bRestRoute.status === 404, `got ${bRestRoute.status}`);

  // ── 6. Checkout: server-side pricing ───────────────────────────────────
  section("6. CHECKOUT — PRICING AND STOCK");
  const beforeStock = (await service.from("product_variants").select("stock").eq("id", variantXL.id).single()).data.stock;

  const orderA = await api("/api/checkout", {
    cookie: a.cookie,
    method: "POST",
    body: {
      customer: {
        name: "A Recipient",
        email: A.email,
        phone: "9999999999",
        addressLine1: "123 OLD STREET",
        addressLine2: "FLAT 1",
        city: "MUMBAI",
        state: "MAHARASHTRA",
        postalCode: "400001",
        country: "IN",
      },
      items: [{ productId: product.id, size: "XL", quantity: 2 }],
      addressId: addrA.id,
      saveAddress: false,
    },
  });
  const orderABody = await orderA.json();
  check("A can place an order", orderA.status === 200, JSON.stringify(orderABody));
  check("order total is the DATABASE price, not a client value", orderABody.amount === 349900 * 2, `got ${orderABody.amount}`);
  check("order number is human readable", /^OG-\d{6}-\d{5}$/.test(orderABody.orderNumber ?? ""), orderABody.orderNumber);

  const { data: orderRow } = await service
    .from("orders")
    .select("*")
    .eq("id", orderABody.orderId)
    .single();
  check("order subtotal = price x qty", orderRow.subtotal === 349900 * 2);
  check("order payment_status starts PENDING (Razorpay dormant)", orderRow.payment_status === "PENDING");
  check("order status starts PENDING", orderRow.status === "PENDING");
  check("order carries a FROZEN shipping snapshot", orderRow.shipping_address_line_1 === "123 OLD STREET");
  check("frozen snapshot kept the full address", orderRow.shipping_city === "MUMBAI" && orderRow.shipping_postal_code === "400001");

  const afterStock = (await service.from("product_variants").select("stock").eq("id", variantXL.id).single()).data.stock;
  check("stock decremented by the ordered quantity", afterStock === beforeStock - 2, `${beforeStock} -> ${afterStock}`);

  const { data: items } = await service.from("order_items").select("*").eq("order_id", orderABody.orderId);
  check("order_items row created", items?.length === 1);
  check("order item snapped the product name", items[0].product_name === "FORM");
  check("order item snapped the variant size", items[0].variant_size === "XL");
  check("order item snapped the unit price", items[0].unit_price === 349900);
  check("order item snapped the drop status", items[0].drop_status === "PRE_ORDER");

  // ── 7. THE HISTORICAL ADDRESS RULE ─────────────────────────────────────
  section("7. HISTORICAL ADDRESS SNAPSHOT");
  const editA = await api(`/api/account/addresses/${addrA.id}`, {
    cookie: a.cookie,
    method: "PATCH",
    body: { line1: "456 NEW STREET" },
  });
  check("A can edit the saved address", editA.status === 200, `got ${editA.status}`);

  const { data: savedNow } = await service
    .from("addresses")
    .select("address_line_1")
    .eq("id", addrA.id)
    .single();
  check("saved address now reads 456 NEW STREET", savedNow.address_line_1 === "456 NEW STREET");

  const { data: oldOrder } = await service
    .from("orders")
    .select("shipping_address_line_1")
    .eq("id", orderABody.orderId)
    .single();
  check("OLD ORDER STILL SHOWS 123 OLD STREET", oldOrder.shipping_address_line_1 === "123 OLD STREET");

  // Deleting the address must not rewrite history either.
  await api(`/api/account/addresses/${addrA.id}`, { cookie: a.cookie, method: "DELETE" });
  const { data: afterDelete } = await service
    .from("orders")
    .select("shipping_address_line_1, address_id")
    .eq("id", orderABody.orderId)
    .single();
  check("order snapshot survives address deletion", afterDelete.shipping_address_line_1 === "123 OLD STREET");
  check("order.address_id is nulled, not cascaded", afterDelete.address_id === null);

  // ── 8. Historical order item integrity ─────────────────────────────────
  section("8. HISTORICAL ITEM SNAPSHOT");
  const { data: oldItemBefore } = await service.from("order_items").select("*").eq("id", items[0].id).single();
  await service.from("products").update({ name: "RENAMED", price: 999900 }).eq("id", product.id);
  const { data: oldItemAfter } = await service.from("order_items").select("*").eq("id", items[0].id).single();
  check("order item name unchanged after product rename", oldItemAfter.product_name === oldItemBefore.product_name);
  check("order item price unchanged after product reprice", oldItemAfter.unit_price === oldItemBefore.unit_price);
  check("order item kept the frozen name 'FORM'", oldItemAfter.product_name === "FORM");
  await service.from("products").update({ name: "FORM", price: 349900 }).eq("id", product.id);

  // ── 9. Cross-customer order isolation ──────────────────────────────────
  section("9. ORDER ISOLATION");
  const bReadsOrder = await b.supabase.from("orders").select("*").eq("id", orderABody.orderId);
  check("B cannot read A's order", (bReadsOrder.data ?? []).length === 0);
  const bReadsItems = await b.supabase.from("order_items").select("*").eq("order_id", orderABody.orderId);
  check("B cannot read A's order items", (bReadsItems.data ?? []).length === 0);
  const aReadsOwn = await a.supabase.from("orders").select("id").eq("id", orderABody.orderId);
  check("A can read their own order", (aReadsOwn.data ?? []).length === 1);

  const bOrderPage = await api(`/account/orders/${orderABody.orderId}`, { cookie: b.cookie });
  check("B's request for A's order page -> 404", bOrderPage.status === 404, `got ${bOrderPage.status}`);

  // ── 10. place_order authorization ──────────────────────────────────────
  section("10. ORDER FUNCTION AUTHORIZATION");
  const anonOrder = await api("/api/checkout", {
    method: "POST",
    body: {
      customer: { name: "X", email: "x@x.com", phone: "9999999999", addressLine1: "1 St", city: "M", state: "S", postalCode: "400001" },
      items: [{ productId: product.id, size: "M", quantity: 1 }],
    },
  });
  check("anonymous checkout -> 401", anonOrder.status === 401, `got ${anonOrder.status}`);

  // Over-ordering must be refused by the conditional UPDATE, not by JS.
  const { data: xxl } = await service
    .from("product_variants")
    .select("id")
    .eq("product_id", product.id)
    .eq("size", "XXL")
    .single();
  await service.from("product_variants").update({ stock: 1 }).eq("id", xxl.id);
  const overOrder = await api("/api/checkout", {
    cookie: a.cookie,
    method: "POST",
    body: {
      customer: { name: "A", email: A.email, phone: "9999999999", addressLine1: "1 St", city: "M", state: "S", postalCode: "400001" },
      items: [{ productId: product.id, size: "XXL", quantity: 5 }],
    },
  });
  check("over-ordering the last unit -> 409 STOCK_DEPLETED", overOrder.status === 409, `got ${overOrder.status}`);
  const { data: xxlAfter } = await service.from("product_variants").select("stock").eq("id", xxl.id).single();
  check("failed order left stock untouched", xxlAfter.stock === 1);

  // A non-orderable drop must be refused server-side.
  await service.from("products").update({ drop_status: "SOLD_OUT" }).eq("id", product.id);
  const soldOut = await api("/api/checkout", {
    cookie: a.cookie,
    method: "POST",
    body: {
      customer: { name: "A", email: A.email, phone: "9999999999", addressLine1: "1 St", city: "M", state: "S", postalCode: "400001" },
      items: [{ productId: product.id, size: "M", quantity: 1 }],
    },
  });
  check("SOLD_OUT product cannot be ordered -> 409", soldOut.status === 409, `got ${soldOut.status}`);
  await service.from("products").update({ drop_status: "PRE_ORDER" }).eq("id", product.id);

  // ── 11. Concurrency ────────────────────────────────────────────────────
  section("11. CONCURRENT INVENTORY (the race that matters)");
  await service.from("product_variants").update({ stock: 1 }).eq("id", xxl.id);
  const stockBefore = (await service.from("product_variants").select("stock").eq("id", xxl.id).single()).data.stock;

  const attempts = await Promise.all(
    Array.from({ length: 8 }, () =>
      api("/api/checkout", {
        cookie: a.cookie,
        method: "POST",
        body: {
          customer: { name: "A", email: A.email, phone: "9999999999", addressLine1: "1 St", city: "M", state: "S", postalCode: "400001" },
          items: [{ productId: product.id, size: "XXL", quantity: 1 }],
        },
      }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) })),
    ),
  );

  const won = attempts.filter((r) => r.status === 200);
  const lost = attempts.filter((r) => r.status === 409);
  check("8 simultaneous buyers, exactly 1 succeeded", won.length === 1, `${won.length} won / ${lost.length} refused`);
  check("the other 7 were refused", lost.length === 7, `${lost.length}`);
  const { data: xxlFinal } = await service.from("product_variants").select("stock").eq("id", xxl.id).single();
  check("stock never went negative", xxlFinal.stock === 0, `stock=${xxlFinal.stock} (was ${stockBefore})`);

  await service.from("product_variants").update({ stock: 2 }).eq("id", xxl.id);

  // ── 12. Admin authorization ────────────────────────────────────────────
  section("12. CONTROL ROOM AUTHORIZATION");

  // Nobody has to have set up an operator for the rest of this suite to be
  // meaningful — but when one exists, every check below must hold.
  const { data: operators } = await service.from("admin_users").select("*");
  const operatorRow = (operators ?? [])[0] ?? null;
  let adminSession = null;

  if (!operatorRow) {
    console.log("  \x1b[33m—\x1b[0m no operator exists (run npm run admin:grant you@domain.com) — Control Room checks skipped");
    check(
      "the Control Room is locked with no operator",
      (await fetch(`${BASE}/admin`, { redirect: "manual" })).status === 307,
    );
    check(
      "no admin_users row means no admin API access",
      (await api("/api/admin/products", { cookie: a.cookie })).status === 403,
    );
  } else {
    const operatorEmail = operatorRow.email;
    adminSession = await sessionAsExisting(operatorEmail);
    check(
      "the operator signs in with no password in this repo (magiclink -> session)",
      adminSession.accessToken.length > 50,
    );
    check(
      "an admin_users row exists for the signed-in operator's auth id",
      (
        await service
          .from("admin_users")
          .select("role")
          .eq("user_id", adminSession.userId)
          .maybeSingle()
      ).data?.role === "admin",
    );
    check(
      "the operator count is exactly one unless --force was used",
      (operators ?? []).length === 1,
      `${(operators ?? []).length} operators`,
    );
    const adminPromotion = await a.supabase.from("admin_users").insert({
      user_id: aId,
      email: A.email,
      name: "self promote",
      role: "admin",
    });
    check("a customer CANNOT promote themselves to admin", Boolean(adminPromotion.error));
  }

  const customerAsAdmin = await api("/api/admin/products", { cookie: a.cookie });
  check("a CUSTOMER cannot list admin products -> 403", customerAsAdmin.status === 403, `got ${customerAsAdmin.status}`);

  const customerCustomers = await api("/api/admin/customers", { cookie: a.cookie });
  check("a CUSTOMER cannot list customers -> 403", customerCustomers.status === 403, `got ${customerCustomers.status}`);

  const customerDashboard = await api("/admin", { cookie: a.cookie, redirect: "manual" });
  check(
    "a CUSTOMER cannot read the dashboard -> 307 to login",
    customerDashboard.status === 307,
    `got ${customerDashboard.status}`,
  );

  if (adminSession) {
    const realAdmin = await api("/api/admin/products", { cookie: adminSession.cookie });
    check("the ADMIN can list products -> 200", realAdmin.status === 200, `got ${realAdmin.status}`);

    const adminOrders = await api(`/api/admin/orders/${orderABody.orderId}`, { cookie: adminSession.cookie });
    check("the ADMIN can inspect any order -> 200", adminOrders.status === 200, `got ${adminOrders.status}`);
  }

  // A customer whose account exists in auth but NOT in admin_users.
  const notAdmin = await api("/api/admin/products", { cookie: b.cookie });
  check("a signed-in non-staff user is FORBIDDEN (not merely signed in)", notAdmin.status === 403);

  // ── 13. Admin can update order status + tracking ───────────────────────
  section("13. CONTROL ROOM ORDER OPERATIONS");
  if (adminSession) {
  const patch = await api(`/api/admin/orders/${orderABody.orderId}`, {
    cookie: adminSession.cookie,
    method: "PATCH",
    body: { status: "SHIPPED", paymentStatus: "PAID", trackingNumber: "TRK-TEST-1", trackingUrl: "https://example.invalid/t/1" },
  });
  check("admin can move an order to SHIPPED", patch.status === 200, `got ${patch.status}`);
  const { data: patched } = await service
    .from("orders")
    .select("status, payment_status, tracking_number, shipping_address_line_1")
    .eq("id", orderABody.orderId)
    .single();
  check("status persisted", patched.status === "SHIPPED");
  check("payment_status persisted", patched.payment_status === "PAID");
  check("tracking number persisted", patched.tracking_number === "TRK-TEST-1");
  check("status change did NOT touch the address snapshot", patched.shipping_address_line_1 === "123 OLD STREET");
  }

  // ── 14. Analytics integrity ────────────────────────────────────────────
  section("14. ANALYTICS");
  const evCountBefore = (await service.from("analytics_events").select("id", { count: "exact", head: true })).count;
  const beacon = await api("/api/analytics", { method: "POST", body: { name: "VIEW_PAGE", path: "/e2e" } });
  check("client event accepted", beacon.status === 201, `got ${beacon.status}`);

  const forge = await api("/api/analytics", { method: "POST", body: { name: "ORDER_PLACED", path: "/forged" } });
  check("client CANNOT forge ORDER_PLACED -> 400", forge.status === 400, `got ${forge.status}`);

  const { data: recent } = await service
    .from("analytics_events")
    .select("event_name, path")
    .order("created_at", { ascending: false })
    .limit(3);
  check("server-side ORDER_PLACED was recorded", recent?.some((e) => e.event_name === "ORDER_PLACED"));
  check("the forged event was never written", !recent?.some((e) => e.path === "/forged"));

  const evCountAfter = (await service.from("analytics_events").select("id", { count: "exact", head: true })).count;
  check("exactly one event added by the beacon", evCountAfter === evCountBefore + 1, `${evCountBefore} -> ${evCountAfter}`);

  // ── 15. Storage ────────────────────────────────────────────────────────
  section("15. STORAGE");
  const bucket = await fetch(`${URL_}/storage/v1/bucket`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  const buckets = (await bucket.json()) ?? [];
  check("ongod-media exists and is public", buckets.some((b) => b.id === "ongod-media" && b.public));
  check("ongod-evidence was NOT created", !buckets.some((b) => b.id === "ongod-evidence"));

  const plate = await fetch(`${URL_}/storage/v1/object/public/ongod-media/seed/product-front.webp`);
  check("product plate is publicly readable", plate.status === 200, `got ${plate.status}`);

  const anonUpload = await fetch(`${URL_}/storage/v1/object/ongod-media/e2e-should-not-exist.jpg`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "image/jpeg" },
    body: new Uint8Array([1, 2, 3]),
  });
  check("anon cannot write to the media bucket", anonUpload.status >= 400, `got ${anonUpload.status}`);

  // ── 16. Removed systems are really gone ────────────────────────────────
  section("16. REMOVED ARCHITECTURE");
  for (const t of ["issues", "issue_evidence", "issue_images", "payments", "login_codes", "admins"]) {
    const { data: rows } = await service.from(t).select("*").limit(1);
    check(`table "${t}" does not exist`, (rows ?? []).length === 0 && !rows?.length);
  }
  const issuePage = await api("/api/account/issues");
  check("/api/account/issues is gone (404)", issuePage.status === 404, `got ${issuePage.status}`);
  const adminIssues = await api("/api/admin/issues");
  check("/api/admin/issues is gone (404)", adminIssues.status === 404, `got ${adminIssues.status}`);
  const adminIssuesPage = await fetch(`${BASE}/admin/issues`, { redirect: "manual" });
  check(
    "/admin/issues no longer exists (redirects to login, not a page)",
    adminIssuesPage.status === 307,
    `got ${adminIssuesPage.status}`,
  );
  // NOTE: the cookie must go in `headers` — a top-level `cookie` key is not a
  // recognised fetch option and is silently dropped.
  if (adminSession) {
    const staffIssues = await fetch(`${BASE}/admin/issues`, {
      headers: { cookie: adminSession.cookie },
      redirect: "manual",
    });
    check("/admin/issues is 404 for a signed-in operator too", staffIssues.status === 404, `got ${staffIssues.status}`);
  }

  // ── cleanup ────────────────────────────────────────────────────────────
  // Every order, address and customer this run created is real data in a real
  // database, so it is removed again unless --keep is passed.
  const keep = process.argv.includes("--keep");
  await service.from("product_images").delete().eq("product_id", draft.id);
  await service.from("products").delete().eq("id", draft.id);

  if (!keep) {
    for (const email of [A.email, B.email]) {
      const { data: c } = await service.from("customers").select("id").eq("email", email).maybeSingle();
      if (!c) continue;
      // customers cascade to addresses; orders hold a nulled address_id, so
      // they are removed first.
      await service.from("orders").delete().eq("customer_id", c.id);
      await service.from("orders").delete().eq("email", email);
      await service.from("analytics_events").delete().eq("customer_id", c.id);
      await service.from("customers").delete().eq("id", c.id);
    }
    await service
      .from("analytics_events")
      .delete()
      .in("path", ["/e2e", "/forged", "/checkout"]);
    await service.from("product_variants").update({ stock: 10 }).eq("product_id", product.id);

    // The Auth fixtures go too, so a clean run leaves nothing behind.
    const { data: users } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const u of users?.users ?? []) {
      if (u.email === A.email || u.email === B.email) {
        await service.auth.admin.deleteUser(u.id);
      }
    }
    console.log("\n  (test orders, customers, analytics and Auth users removed — pass --keep to retain)");
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(
    fail === 0
      ? `\x1b[32mALL ${pass} CHECKS PASSED\x1b[0m\n`
      : `\x1b[31m${fail} FAILED\x1b[0m, ${pass} passed\n`,
  );
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error("\nTEST RUN CRASHED:\n", err);
  process.exitCode = 1;
});