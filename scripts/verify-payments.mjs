import fs from "node:fs";
import pg from "pg";

const raw = fs.readFileSync(".env", "utf8");
const env = {};
for (const l of raw.split("\n")) {
  const i = l.indexOf("=");
  if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
}

const c = new pg.Client({ connectionString: env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (label, sql, params = []) => {
  const r = await c.query(sql, params);
  console.log(label.padEnd(44), r.rows[0] ? JSON.stringify(r.rows[0]) : "(none)");
};

await q("orders_update_own removed", "select count(*)::int n from pg_policies where tablename=$1 and policyname=$2", ["orders", "orders_update_own"]);
await q("guard trigger present", "select count(*)::int n from pg_trigger where tgname=$1", ["orders_guard_payment_columns"]);
await q("new order columns", "select string_agg(column_name,',' order by column_name) cols from information_schema.columns where table_name='orders' and column_name in ('reservation_expires_at','paid_at','payment_method','refund_required')");
await q("place_order overloads", "select pg_get_function_identity_arguments(p.oid) args, p.prosecdef from pg_proc p where proname='place_order' order by 1");
await q("payment funcs SECURITY DEFINER", "select count(*)::int n from pg_proc where proname in ('expire_reservations','mark_order_paid','mark_order_payment_failed') and prosecdef");
await q("anon EXECUTE expire_reservations", "select has_function_privilege('anon','expire_reservations(integer)','EXECUTE') allowed");
await q("anon EXECUTE mark_order_paid", "select has_function_privilege('anon','mark_order_paid(text,text,text)','EXECUTE') allowed");
await q("anon EXECUTE mark_payment_failed", "select has_function_privilege('anon','mark_order_payment_failed(text,text)','EXECUTE') allowed");
await q("anon EXECUTE prune_otp", "select has_function_privilege('anon','prune_checkout_otp_requests()','EXECUTE') allowed");
await q("otp ledger RLS on / policies", "select (select relrowsecurity from pg_class where relname='checkout_otp_requests') rls, (select count(*)::int from pg_policies where tablename='checkout_otp_requests') pol");
await q("live open reservations", "select count(*)::int n from orders where reservation_expires_at is not null and payment_status='PENDING'");

await c.end();