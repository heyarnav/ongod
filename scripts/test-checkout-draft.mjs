import fs from "node:fs";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

/**
 * The cross-context checkout round trip.
 *
 * The bug this was written for: the cart lives in localStorage and the form in
 * sessionStorage, so a shopper who follows the emailed confirmation link in
 * Gmail's in-app viewer, on their phone, or in a private window arrives at
 * /checkout with nothing, and is told they have nothing to buy, moments after
 * proving they own the inbox.
 *
 * "Different browser" is reproduced honestly here. This script never reads
 * localStorage or sessionStorage — the whole exchange is HTTP with cookie jars.
 * Leg 1 (asking for the code) and leg 2 (following the link) use SEPARATE jars,
 * which is precisely the property that makes a browser a browser: leg 2 has no
 * cookie, no cache and no storage belonging to leg 1.
 *
 * What is asserted:
 *   - asking for a code creates NO order and moves NO stock
 *   - the restored basket matches what was asked for: line count, product id,
 *     size and quantity on every line
 *   - the restored form matches: email, name, phone and the whole address
 *   - the price comes from the server, not from what the client claimed
 *   - a different customer holding the same token gets nothing
 *   - an expired draft is refused rather than restored
 */

const raw = fs.readFileSync(".env", "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const BASE = process.env.BASE ?? "http://localhost:3000";

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
const eq = (label, actual, expected) =>
  check(label, actual === expected, `expected ${JSON.stringify(expected)} / got ${JSON.stringify(actual)}`);
const deepEq = (label, actual, expected) =>
  check(
    label,
    JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}\n          got      ${JSON.stringify(actual)}`,
  );

const service = createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * A cookie jar is a browser. Building a fresh one gives a context with nothing
 * in it — no cookies, and by extension no session and no browser storage.
 */
function browser() {
  const jar = {};
  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
      setAll: (list) => {
        for (const { name, value } of list) jar[name] = value;
      },
    },
  });
  const header = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  return { supabase, header, jar };
}

/** Verify a token in a given browser, exactly as a clicked link would. */
async function followLink(as, hashedToken, email) {
  for (const type of ["signup", "email", "magiclink"]) {
    const attempt = await as.supabase.auth.verifyOtp({ token_hash: hashedToken, type });
    if (!attempt.error) return attempt.data;
  }
  throw new Error(`could not verify a link for ${email}`);
}

/**
 * Wait for the deferred draft to land.
 *
 * The row is written inside after(), which runs after the response has already
 * been sent — deliberately, so the shopper's wait is not the database's. A
 * fixed sleep is a race: on a cold function the throttle query, the ledger
 * insert and the draft insert are three sequential round trips. Poll instead.
 */
async function waitForDraft(token, attempts = 40, delayMs = 400) {
  for (let i = 0; i < attempts; i++) {
    const { data } = await service
      .from("checkout_drafts")
      .select("token, email, cart, form, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (data) return data;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

const created = { orders: [], products: [], collections: [], users: [], tokens: [] };

try {
  console.log(`\ncheckout draft — cross-context round trip  (${BASE})\n`);

  // ── Fixtures ──────────────────────────────────────────────────────────────
  const stamp = Date.now();
  const email = `draft-${stamp}@example.com`;
  const otherEmail = `draft-other-${stamp}@example.com`;

  const { data: user, error: userErr } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    password: "x".repeat(24),
  });
  if (userErr) throw new Error(`createUser failed: ${userErr.message}`);
  created.users.push(user.user.id);

  const { data: other, error: otherErr } = await service.auth.admin.createUser({
    email: otherEmail,
    email_confirm: true,
    password: "x".repeat(24),
  });
  if (otherErr) throw new Error(`createUser(other) failed: ${otherErr.message}`);
  created.users.push(other.user.id);

  const { data: customers, error: custErr } = await service
    .from("customers")
    .insert([
      { supabase_user_id: user.user.id, email, name: "Draft Tester", phone: "9000000009" },
      { supabase_user_id: other.user.id, email: otherEmail, name: "Other Tester", phone: "9000000008" },
    ])
    .select("id, email");
  if (custErr) throw new Error(`customer insert failed: ${custErr.message}`);
  const mine = customers.find((c) => c.email === email);

  const { data: collection, error: collErr } = await service
    .from("collections")
    .insert({
      name: "DRAFT",
      slug: `draft-${stamp}`,
      number: "901",
      description: "fixture",
      sort_order: 9998,
      published: false,
    })
    .select("id")
    .single();
  if (collErr) throw new Error(`collection insert failed: ${collErr.message}`);
  created.collections.push(collection.id);

  const { data: products, error: prodErr } = await service
    .from("products")
    .insert([
      { collection_id: collection.id, name: "DRAFT ONE", slug: `draft-one-${stamp}`, archive_number: "901", description: "fixture", price: 111000, currency: "INR", status: "PUBLISHED", drop_status: "PRE_ORDER", featured: false },
      { collection_id: collection.id, name: "DRAFT TWO", slug: `draft-two-${stamp}`, archive_number: "902", description: "fixture", price: 222000, currency: "INR", status: "PUBLISHED", drop_status: "FULFILLING", featured: false },
    ])
    .select("id, name, price");
  if (prodErr) throw new Error(`product insert failed: ${prodErr.message}`);
  created.products.push(products.map((p) => p.id));

  for (const p of products) {
    await service.from("product_variants").insert([
      { product_id: p.id, size: "M", sku: `D1-${stamp}-M`, stock: 5, active: true },
      { product_id: p.id, size: "L", sku: `D2-${stamp}-L`, stock: 4, active: true },
    ]);
  }

  const [one, two] = products;

  // Two lines, deliberately different products, sizes and quantities.
  const cart = [
    { productId: one.id, size: "M", quantity: 2 },
    { productId: two.id, size: "L", quantity: 3 },
  ];

  const form = {
    name: "Draft Tester",
    phone: "9000000009",
    address1: "17 Persistence Lane",
    address2: "Flat 4B",
    city: "Pune",
    state: "Maharashtra",
    pincode: "411048",
  };

  // ── Leg 1: the browser where the checkout was filled in ────────────────────
  console.log("1. asking for a code records a draft and creates nothing");
  const first = browser();

  const beforeStock = await service
    .from("product_variants")
    .select("size, stock")
    .in("product_id", created.products)
    .order("size");

  const otpRes = await fetch(`${BASE}/api/checkout/otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, cart, form }),
  });
  const otpBody = await otpRes.json();
  eq("the OTP endpoint answers 200", otpRes.status, 200);
  eq("it answers ok", otpBody.ok, true);
  check("it returns a draft token", typeof otpBody.draftToken === "string" && otpBody.draftToken.length === 43, otpBody.draftToken ?? "(none)");
  created.tokens.push(otpBody.draftToken);

  // The row is written inside after(), so wait for it rather than assume.
  const draftRow = await waitForDraft(otpBody.draftToken);
  check("the draft was persisted", Boolean(draftRow), draftRow ? "row present" : "no row after 16s");
  eq("it is bound to the address being verified", draftRow?.email, email);

  const { count: ordersAfterOtp } = await service
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", mine.id);
  eq("NO order was created by asking for a code", ordersAfterOtp, 0);

  const afterStock = await service
    .from("product_variants")
    .select("size, stock")
    .in("product_id", created.products)
    .order("size");
  deepEq("NO stock was held by asking for a code", afterStock, beforeStock);

  // ── Leg 2: a browser that has never seen any of this ──────────────────────
  console.log("\n2. following the link from a browser with no session and no storage");
  const second = browser();
  check("leg 2 starts with no cookies", Object.keys(second.jar).length === 0);

  const { data: link } = await service.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (link?.error) throw new Error(`generateLink failed: ${link.error.message}`);
  await followLink(second, link.properties.hashed_token, email);
  check("leg 2 now holds its own session", Object.keys(second.jar).length > 0, `${Object.keys(second.jar).length} cookie(s)`);

  // ── The restore ───────────────────────────────────────────────────────────
  const restoreRes = await fetch(`${BASE}/api/checkout/draft?draft=${otpBody.draftToken}`, {
    headers: { cookie: second.header() },
  });
  const restored = await restoreRes.json();
  eq("the draft is restored", restoreRes.status, 200);
  check("it is ok", restored.ok === true);

  eq("the email survives", restored.email, email);
  eq("the line count survives", restored.lines?.length, cart.length);
  check(
    "nothing was dropped",
    restored.unavailable?.length === 0,
    restored.unavailable?.map((u) => `${u.name}: ${u.reason}`).join("; ") || "none",
  );

  const restoredOne = (restored.lines ?? []).find((l) => l.productId === one.id);
  const restoredTwo = (restored.lines ?? []).find((l) => l.productId === two.id);

  check("both products survive", Boolean(restoredOne) && Boolean(restoredTwo));
  eq("line 1 product id", restoredOne?.productId, cart[0].productId);
  eq("line 1 size", restoredOne?.size, cart[0].size);
  eq("line 1 quantity", restoredOne?.quantity, cart[0].quantity);
  eq("line 2 product id", restoredTwo?.productId, cart[1].productId);
  eq("line 2 size", restoredTwo?.size, cart[1].size);
  eq("line 2 quantity", restoredTwo?.quantity, cart[1].quantity);

  // ── The form ──────────────────────────────────────────────────────────────
  console.log("\n3. the address survives");
  for (const key of ["name", "phone", "address1", "address2", "city", "state", "pincode"]) {
    eq(`the ${key} survives`, restored.form?.[key], form[key]);
  }

  // ── Pricing comes from the server ─────────────────────────────────────────
  console.log("\n4. pricing is the server's, not the client's");
  eq("line 1 price is re-read from the catalogue", restoredOne?.price, one.price);
  eq("line 2 price is re-read from the catalogue", restoredTwo?.price, two.price);

  // Prove it by sending a deliberately wrong price in a second draft.
  const tampered = browser();
  const tamperRes = await fetch(`${BASE}/api/checkout/otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      cart: [{ productId: one.id, size: "M", quantity: 1, price: 1 }],
      form,
    }),
  });
  const tamperBody = await tamperRes.json();
  created.tokens.push(tamperBody.draftToken);
  await waitForDraft(tamperBody.draftToken);

  const tamperRestore = await fetch(`${BASE}/api/checkout/draft?draft=${tamperBody.draftToken}`, {
    headers: { cookie: second.header() },
  }).then((r) => r.json());
  eq(
    "a client claiming ₹1 does not get charged ₹1",
    tamperRestore.lines?.[0]?.price,
    one.price,
  );

  // ── Someone else's token ──────────────────────────────────────────────────
  console.log("\n5. the token is not authority on its own");
  const third = browser();
  const { data: otherLink } = await service.auth.admin.generateLink({ type: "magiclink", email: otherEmail });
  await followLink(third, otherLink.properties.hashed_token, otherEmail);

  const stolen = await fetch(`${BASE}/api/checkout/draft?draft=${otpBody.draftToken}`, {
    headers: { cookie: third.header() },
  });
  eq("another signed-in customer is refused", stolen.status, 410);
  const stolenBody = await stolen.json();
  check("and learns nothing", stolenBody.lines === undefined, JSON.stringify(stolenBody));

  const anonymous = await fetch(`${BASE}/api/checkout/draft?draft=${otpBody.draftToken}`);
  eq("an anonymous reader is refused", anonymous.status, 401);

  // ── Expiry ────────────────────────────────────────────────────────────────
  console.log("\n6. an expired draft is refused, not restored");
  await service
    .from("checkout_drafts")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("token", otpBody.draftToken);

  const expired = await fetch(`${BASE}/api/checkout/draft?draft=${otpBody.draftToken}`, {
    headers: { cookie: second.header() },
  });
  eq("an expired draft reads as expired", expired.status, 410);
  eq("and is not restorable", (await expired.json()).error, "DRAFT_EXPIRED");

  const garbage = await fetch(`${BASE}/api/checkout/draft?draft=not-a-token`, {
    headers: { cookie: second.header() },
  });
  eq("a malformed token reads the same way", garbage.status, 410);

  console.log(`\n${failed === 0 ? "ALL PASS" : "FAILURES"} — ${passed} passed, ${failed} failed\n`);
} finally {
  for (const t of created.tokens) {
    if (t) await service.from("checkout_drafts").delete().eq("token", t);
  }
  for (const id of created.orders) {
    await service.from("order_items").delete().eq("order_id", id);
    await service.from("orders").delete().eq("id", id);
  }
  // Stock back before the rows go, so cleanup never leaves a fixture holding.
  await service.from("product_variants").delete().in("product_id", created.products);
  for (const id of created.products) await service.from("products").delete().eq("id", id);
  for (const id of created.collections) await service.from("collections").delete().eq("id", id);
  await service.from("customers").delete().like("email", `draft-%@example.com`);
  for (const id of created.users) await service.auth.admin.deleteUser(id);
  // The Postgrest builder is thenable rather than a real Promise in this
  // client version, so .catch() is not available on it.
  try {
    await service.rpc("prune_checkout_drafts");
  } catch {
    /* housekeeping, best-effort */
  }
  try {
    await service.rpc("prune_checkout_otp_requests");
  } catch {
    /* housekeeping, best-effort */
  }
  console.log(
    `cleanup\n  removed ${created.tokens.filter(Boolean).length} draft(s), ${created.products.length} product(s), ${created.users.length} auth user(s)\n`,
  );
}

process.exit(failed === 0 ? 0 : 1);
