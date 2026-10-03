#!/usr/bin/env node
/**
 * Schema verification — read-only. Confirms that the tables, constraints,
 * functions, policies and bucket the application depends on actually exist in
 * Supabase Postgres, rather than merely existing as text in a .sql file.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { Client } = pg;

const raw = readFileSync(join(root, ".env"), "utf8");
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (m && process.env[m[1]] === undefined) {
    process.env[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, "$1");
  }
}

const EXPECTED_TABLES = [
  "customers",
  "addresses",
  "collections",
  "products",
  "product_variants",
  "product_images",
  "orders",
  "order_items",
  "admin_users",
  "site_settings",
  "analytics_events",
  "journal_entries",
];

const EXPECTED_FUNCTIONS = [
  "current_customer_id",
  "is_admin",
  "place_order",
  "generate_order_number",
  "set_updated_at",
];

let failures = 0;
const ok = (label) => console.log(`  \x1b[32m✓\x1b[0m ${label}`);
const bad = (label, extra = "") => {
  failures++;
  console.log(`  \x1b[31m✗\x1b[0m ${label} ${extra}`);
};

const client = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();

try {
  console.log("\nTABLES");
  const { rows: tables } = await client.query(`
    select c.relname as table_name,
           c.relrowsecurity as rls_enabled,
           c.relforcerowsecurity as rls_forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  `);
  const found = new Set(tables.map((t) => t.table_name));
  for (const t of EXPECTED_TABLES) {
    const row = tables.find((x) => x.table_name === t);
    if (!row) bad(`public.${t} MISSING`);
    else if (!row.rls_enabled) bad(`public.${t} has RLS DISABLED`);
    else ok(`public.${t} (RLS${row.rls_forced ? " forced" : " enabled"})`);
  }
  for (const t of ["issues", "issue_evidence", "issue_images", "payments", "login_codes", "admins"]) {
    if (found.has(t)) bad(`public.${t} should not exist`);
  }

  console.log("\nFUNCTIONS");
  const { rows: fns } = await client.query(`
    select p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  `);
  const fnames = new Set(fns.map((f) => f.proname));
  for (const f of EXPECTED_FUNCTIONS) {
    if (fnames.has(f)) ok(`public.${f}()`);
    else bad(`public.${f}() MISSING`);
  }

  console.log("\nPOLICIES");
  const { rows: pols } = await client.query(`
    select tablename, policyname, cmd
    from pg_policies
    where schemaname = 'public'
    order by tablename, policyname
  `);
  const byTable = new Map();
  for (const p of pols) {
    if (!byTable.has(p.tablename)) byTable.set(p.tablename, []);
    byTable.get(p.tablename).push(`${p.policyname}:${p.cmd}`);
  }
  for (const [table, list] of byTable) {
    console.log(`  ${table} — ${list.length} policy/policies`);
    for (const p of list) console.log(`      ${p}`);
  }
  const noPolicy = EXPECTED_TABLES.filter((t) => !byTable.has(t));
  if (noPolicy.length) bad(`tables with NO policies: ${noPolicy.join(", ")}`);
  else ok("every application table has at least one policy");

  console.log("\nSTORAGE BUCKET");
  const { rows: buckets } = await client.query(
    "select id, public from storage.buckets order by id",
  );
  const media = buckets.find((b) => b.id === "ongod-media");
  if (media?.public) ok("ongod-media exists and is PUBLIC");
  else bad("ongod-media missing or not public");
  if (buckets.some((b) => b.id === "ongod-evidence")) {
    bad("ongod-evidence still exists (issue system was removed)");
  } else {
    ok("ongod-evidence does not exist");
  }

  console.log("\nSEED DATA");
  const { rows: counts } = await client.query(`
    select
      (select count(*) from collections)  as collections,
      (select count(*) from products)     as products,
      (select count(*) from product_variants) as variants,
      (select count(*) from product_images)   as images,
      (select count(*) from site_settings)    as settings,
      (select count(*) from journal_entries)  as journal,
      (select count(*) from customers)        as customers,
      (select count(*) from orders)           as orders
  `);
  const c = counts[0];
  const expect = {
    collections: 3,
    products: 1,
    variants: 6,
    images: 3,
    settings: 16,
    journal: 3,
  };
  for (const [k, v] of Object.entries(expect)) {
    if (Number(c[k]) === v) ok(`${k}: ${c[k]}`);
    else bad(`${k}: expected ${v}, got ${c[k]}`);
  }

  // Customers appear the first time somebody opens their account, and orders
  // the first time somebody checks out — both are real activity, so they are
  // reported rather than asserted.
  console.log(`\n  customers: ${c.customers} (grows on first authenticated visit)`);
  console.log(`  orders: ${c.orders} (grows on first checkout)`);

  console.log("\nHUMAN / 001");
  const { rows: form } = await client.query(
    `select slug, name, archive_number, price, status, drop_status
     from products where slug = 'human-001-form'`,
  );
  if (form.length === 1) {
    const f = form[0];
    const priceOk = f.price === 349900;
    ok(`${f.slug} — ${f.name} / ${f.archive_number} @ ${f.price} (${priceOk ? "minor units ok" : "WRONG PRICE"})`);
    ok(`status=${f.status} drop_status=${f.drop_status}`);
  } else {
    bad("human-001-form not seeded");
  }

  console.log("\nMIGRATION LEDGER");
  const { rows: ledger } = await client.query(
    "select version from supabase_migrations.schema_migrations order by version",
  );
  for (const l of ledger) console.log(`  ${l.version}`);
  const files = readdirSync(join(root, "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (ledger.length === files.length) ok(`${ledger.length} migrations recorded and applied`);
  else bad(`expected ${files.length} migrations, found ${ledger.length}`);

  for (const f of files) {
    if (!ledger.some((l) => l.version === f)) bad(`${f} exists on disk but was never applied`);
  }

  console.log(
    failures === 0
      ? "\n\x1b[32mSCHEMA VERIFIED\x1b[0m\n"
      : `\n\x1b[31m${failures} PROBLEM(S)\x1b[0m\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  await client.end();
}