import fs from "node:fs";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";

/**
 * Reservation lifecycle test — exercises the real functions against the live
 * database, as the database owner, impersonating a real customer by setting the
 * JWT claims the same way PostgREST does.
 *
 * Everything it creates is removed at the end, so the store is left as found.
 */

const raw = fs.readFileSync(".env", "utf8");
const env = {};
for (const l of raw.split("\n")) {
  const i = l.indexOf("=");
  if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

let pass = 0;
let fail = 0;
function check(label, condition, detail = "") {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${detail}`); }
}

const claims = (uid, email) =>
  JSON.stringify({ sub: uid, email, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });

/** Run fn() as a given customer inside a transaction that is thrown away. */
async function asCustomer(uid, email, fn) {
  await c.query("begin");
  await c.query("select set_config('request.jwt.claims', $1, true)", [claims(uid, email)]);
  try { return await fn(); } finally { await c.query("rollback"); }
}

/**
 * Run fn() as a given customer and KEEP the result. The claims are set with
 * is_local=true, so committing resets them and leaves the database clean — the
 * rows persist, the impersonation does not.
 */
async function asCustomerCommitting(uid, email, fn) {
  await c.query("begin");
  await c.query("select set_config('request.jwt.claims', $1, true)", [claims(uid, email)]);
  try {
    const out = await fn();
    await c.query("commit");
    return out;
  } catch (err) {
    await c.query("rollback");
    throw err;
  }
}

// Hex only: this string becomes a uuid, and a base36 suffix is not valid hex.
const SUFFIX = Date.now().toString(16);
const TEST_EMAIL = `reservation-test-${SUFFIX}@example.invalid`;
let TEST_UID = "";
let authUserId = "";
const created = { orders: [], products: [], customers: [] };

async function purgeStale() {
  // Earlier runs of this script may have died before their cleanup ran. Leftover
  // orders would then satisfy a lookup by gateway_order_id and silently make a
  // later assertion pass against the wrong row.
  const orders = await c.query(
    `delete from orders where id in (select o.id from orders o where o.email like 'reservation-%@example.invalid' or o.id in (select oi.order_id from order_items oi join products p on p.id=oi.product_id where p.slug like 'reservation-test-%'))`,
  );
  const variants = await c.query(
    `delete from product_variants where product_id in (select id from products where slug like 'reservation-test-%')`,
  );
  const products = await c.query(`delete from products where slug like 'reservation-test-%'`);
  const customers = await c.query(`delete from customers where email like 'reservation-test-%@example.invalid'`);
  if (orders.rowCount || variants.rowCount || products.rowCount || customers.rowCount) {
    console.log(`  purged stale fixtures: ${orders.rowCount} orders, ${products.rowCount} products, ${customers.rowCount} customers`);
  }

  // And the Auth users behind them.
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: page } = await service.auth.admin.listUsers({ perPage: 200 });
  const stale = (page?.users ?? []).filter((u) => (u.email ?? "").startsWith("reservation-test-"));
  for (const u of stale) await service.auth.admin.deleteUser(u.id);
  if (stale.length) console.log(`  purged ${stale.length} stale auth users`);
}

async function seed() {
  // customers.supabase_user_id references auth.users, so a real Auth account is
  // required. Created here and deleted in cleanup, so the fixture is isolated
  // from the store's single real customer.
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await service.auth.admin.createUser({
    email: TEST_EMAIL,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create the fixture Auth user: ${error.message}`);
  authUserId = data.user.id;
  TEST_UID = authUserId;

  const { rows } = await c.query(
    `insert into customers (supabase_user_id, email, name, phone)
     values ($1, $2, 'Reservation Test', '9000000000')
     returning id`,
    [TEST_UID, TEST_EMAIL],
  );
  created.customers.push(rows[0].id);

  const p = await c.query(
    `insert into products (slug, name, collection_id, archive_number, price, currency, status, drop_status, edition_label)
     select 'reservation-test-'||$1, 'Reservation Test Object', c.id, 'TEST / 999', 129900, 'INR', 'PUBLISHED', 'PRE_ORDER', 'TEST'
     from collections c limit 1
     returning id`,
    [SUFFIX],
  );
  if (p.rowCount === 0) throw new Error("no collection to seed into");
  created.products.push(p.rows[0].id);

  await c.query(`insert into product_variants (product_id, size, sku, stock) values ($1,'M','RES-TEST-'||$2, 5)`, [p.rows[0].id, SUFFIX]);
}

async function placeReservation(minutes = 30) {
  const productId = created.products[0];
  const { rows: vrows } = await c.query(`select id from product_variants where product_id=$1 and size='M'`, [productId]);
  const variantId = vrows[0].id;

  const result = await asCustomerCommitting(TEST_UID, TEST_EMAIL, async () => {
    // The function returns jsonb, which Postgres will not expand with `.*`,
    // so the fields are read out of the single column it produces.
    const r = await c.query(
      `select public.place_order(
         $1::jsonb,
         $2::jsonb,
         null, true, $3::int) as placed`,
      [
        JSON.stringify([{ product_id: productId, size: "M", quantity: 2 }]),
        JSON.stringify({
          name: "Reservation Test",
          phone: "9000000000",
          address_line_1: "123 MG Road",
          address_line_2: "",
          city: "Bangalore",
          state: "Karnataka",
          postal_code: "560034",
          country: "IN",
        }),
        minutes,
      ],
    );
    return r.rows[0].placed;
  });

  created.orders.push(result.order_id);
  return { ...result, variantId };
}

const stockNow = async () => {
  const { rows } = await c.query(
    `select pv.stock from product_variants pv where pv.product_id=$1 and pv.size='M'`,
    [created.products[0]],
  );
  return rows[0].stock;
};

console.log("\nseeding test fixtures…");
await purgeStale();
await seed();
console.log(`  customer ${TEST_EMAIL}\n`);

// ── 1. Reservation holds stock and stamps a deadline ────────────────────────
console.log("1. reservation holds stock");
{
  const before = await stockNow();
  const order = await placeReservation(30);
  const after = await stockNow();
  check("stock decremented by the ordered quantity", before - after === 2, `${before} -> ${after}`);

  const { rows } = await c.query(
    `select status, payment_status, reservation_expires_at, shipping_address_line_1, shipping_city, email
       from orders where id=$1`,
    [order.order_id],
  );
  const o = rows[0];
  check("status starts PENDING", o.status === "PENDING", o.status);
  check("payment_status starts PENDING", o.payment_status === "PENDING", o.payment_status);
  check("reservation_expires_at is set", !!o.reservation_expires_at);
  const mins = (new Date(o.reservation_expires_at) - new Date()) / 60000;
  check("deadline is ~30 minutes out", mins > 28 && mins <= 30, `${mins.toFixed(1)} min`);
  check("shipping snapshot frozen onto the order", o.shipping_address_line_1 === "123 MG Road" && o.shipping_city === "Bangalore");
  check("order email is the session email, not client input", o.email === TEST_EMAIL);

  const { rows: addr } = await c.query(`select count(*)::int n from addresses where customer_id=$1`, [created.customers[0]]);
  check("save_address=true wrote the address book", addr[0].n === 1, `${addr[0].n}`);
}

// ── 2. Capture marks PAID and is idempotent ─────────────────────────────────
console.log("\n2. payment capture");
{
  const order = created.orders[0];
  const gwId = `order_test_paid_${SUFFIX}`;
  await c.query(`update orders set gateway_order_id=$1 where id=$2`, [gwId, order]);
  const r1 = (await c.query(`select mark_order_paid($1,$2,$3) as r`, [`pay_${SUFFIX}`, "sig123", gwId])).rows[0].r;
  check("first capture reports not-already-paid", r1.already_paid === false, JSON.stringify(r1));
  check("first capture sets refund_required false", r1.refund_required === false, JSON.stringify(r1));

  const r2 = (await c.query(`select mark_order_paid($1,$2,$3) as r`, [`pay_${SUFFIX}`, "sig123", gwId])).rows[0].r;
  check("second capture is idempotent", r2.already_paid === true, JSON.stringify(r2));

  const { rows } = await c.query(`select status, payment_status, paid_at, gateway_payment_id, reservation_expires_at from orders where id=$1`, [order]);
  check("status is PAID", rows[0].status === "PAID", rows[0].status);
  check("payment_status is PAID", rows[0].payment_status === "PAID", rows[0].payment_status);
  check("paid_at recorded", !!rows[0].paid_at);
  check("payment id stored", rows[0].gateway_payment_id === `pay_${SUFFIX}`);
  check("deadline cleared after capture", rows[0].reservation_expires_at === null);
}

// ── 3. A failed payment does NOT release the hold ───────────────────────────
console.log("\n3. failed payment keeps the reservation");
{
  const order = await placeReservation(30);
  const failGw = `order_test_fail_${SUFFIX}`;
  await c.query(`update orders set gateway_order_id=$1 where id=$2`, [failGw, order.order_id]);
  const before = await stockNow();
  await c.query(`select mark_order_payment_failed($1,$2) as r`, [`pay_bad_${SUFFIX}`, failGw]);
  const after = await stockNow();
  check("stock still held after a failed attempt", before === after, `${before} -> ${after}`);
  const { rows } = await c.query(`select payment_status, reservation_expires_at from orders where id=$1`, [order.order_id]);
  check("payment_status is FAILED", rows[0].payment_status === "FAILED", rows[0].payment_status);
  check("reservation deadline survives for retry", !!rows[0].reservation_expires_at);
}

// ── 4. Expiry returns stock exactly once ────────────────────────────────────
console.log("\n4. expiry returns stock");
{
  // The order left in FAILED by section 3 is the interesting one: under the
  // original sweep predicate it was invisible to expiry and would have held
  // stock forever.
  const orderId = created.orders.at(-1);
  const before = await stockNow();
  const { rows: pre } = await c.query(`select payment_status from orders where id=$1`, [orderId]);
  check("the order under test is FAILED, not PENDING", pre[0]?.payment_status === "FAILED", pre[0]?.payment_status);

  // Force the deadline into the past — the timer itself is not what is tested,
  // the release semantics are.
  await c.query(`update orders set reservation_expires_at = now() - interval '1 minute' where id=$1`, [orderId]);
  await c.query(`select expire_reservations() as n`);
  const after = await stockNow();
  check("stock restored by the expiry sweep", after - before === 2, `${before} -> ${after}`);

  const { rows } = await c.query(`select status, reservation_expires_at from orders where id=$1`, [orderId]);
  check("order is CANCELLED", rows[0]?.status === "CANCELLED", rows[0]?.status);
  check("deadline cleared so it cannot re-expire", rows[0]?.reservation_expires_at === null);

  const n2 = (await c.query(`select expire_reservations() as n`)).rows[0].n;
  check("a second sweep restores nothing further", after === (await stockNow()), `count=${n2}`);
}

console.log("\n4b. a PAID order is never swept");
{
  const before = await stockNow();
  // Backdate the already-captured order's deadline. It must survive untouched.
  await c.query(`update orders set reservation_expires_at = now() - interval '1 day' where id=$1`, [created.orders[0]]);
  await c.query(`select expire_reservations() as n`);
  check("stock unchanged for a paid order", before === (await stockNow()), `${before} -> ${await stockNow()}`);
  const { rows } = await c.query(`select status, payment_status from orders where id=$1`, [created.orders[0]]);
  check("the paid order is still PAID", rows[0].status === "PAID" && rows[0].payment_status === "PAID", `${rows[0].status}/${rows[0].payment_status}`);
}

// ── 5. Late payment after expiry is flagged, not lost ───────────────────────
console.log("\n5. late payment is flagged for refund");
{
  const order = await placeReservation(30);
  const lateGw = `order_test_late_${SUFFIX}`;
  await c.query(`update orders set gateway_order_id=$1, reservation_expires_at = now() - interval '1 second' where id=$2`, [lateGw, order.order_id]);
  const r = (await c.query(`select mark_order_paid($1,$2,$3) as r`, [`pay_late_${SUFFIX}`, "siglate", lateGw])).rows[0].r;
  check("late capture sets refund_required", r.refund_required === true, JSON.stringify(r));
  const { rows } = await c.query(`select refund_required, gateway_payment_id from orders where id=$1`, [order.order_id]);
  check("refund_required persisted on the order", rows[0].refund_required === true);
  check("the payment id is still recorded", rows[0].gateway_payment_id === `pay_late_${SUFFIX}`);
}

// ── 6. Payment columns are not client-writable ─────────────────────────────
//
// Two independent defences, tested separately so neither can hide behind the
// other. The connection is the `postgres` role, which the trigger deliberately
// permits, so both cases run under SET LOCAL ROLE authenticated.
console.log("\n6. payment columns are not client-writable");
{
  const orderId = created.orders[0];

  // 6a. RLS alone: orders_update_own was dropped, so no policy allows a
  //     customer to update their own order. Note that RLS does NOT raise here
  //     — a statement with no applicable UPDATE policy silently matches zero
  //     rows. The honest assertion is therefore on rowCount, not on an error.
  await c.query("begin");
  await c.query("set local role authenticated");
  await c.query("select set_config('request.jwt.claims', $1, true)", [claims(TEST_UID, TEST_EMAIL)]);
  const sel = await c.query(`select 1 from orders where id=$1`, [orderId]);
  check("the customer CAN still read their own order", sel.rowCount === 1, `${sel.rowCount}`);
  const upd = await c.query(`update orders set gateway_order_id='attacker' where id=$1`, [orderId]);
  check("a customer UPDATE affects zero rows", upd.rowCount === 0, `${upd.rowCount} row(s)`);
  await c.query("rollback");

  // 6b. The trigger, isolated: grant a throwaway permissive policy inside a
  //     transaction that is rolled back, so only the trigger can be the reason
  //     the write fails.
  await c.query("begin");
  await c.query(`create policy tmp_isolation_probe on orders for update to authenticated using (true) with check (true)`);
  await c.query("set local role authenticated");
  await c.query("select set_config('request.jwt.claims', $1, true)", [claims(TEST_UID, TEST_EMAIL)]);
  let triggerBlocked = false;
  try {
    await c.query(`update orders set gateway_order_id='attacker' where id=$1`, [orderId]);
  } catch (e) {
    triggerBlocked = /ORDER_NOT_WRITABLE/i.test(e.message);
  }
  await c.query("rollback");
  check("the trigger refuses it even with RLS wide open", triggerBlocked, "(expected ORDER_NOT_WRITABLE)");
}

// ── cleanup ────────────────────────────────────────────────────────────────
console.log("\ncleanup");
await c.query(`delete from orders where id = any($1::uuid[])`, [created.orders]);
await c.query(`delete from addresses where customer_id = any($1::uuid[])`, [created.customers]);
await c.query(`delete from product_variants where product_id = any($1::uuid[])`, [created.products]);
await c.query(`delete from products where id = any($1::uuid[])`, [created.products]);
await c.query(`delete from customers where id = any($1::uuid[])`, [created.customers]);
await c.query(`delete from checkout_otp_requests`);
if (authUserId) {
  const service = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await service.auth.admin.deleteUser(authUserId);
}
console.log(`  removed ${created.orders.length} orders, ${created.products.length} products, 1 auth user`);

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
await c.end();
process.exit(fail === 0 ? 0 : 1);