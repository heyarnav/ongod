#!/usr/bin/env node
/**
 * Migration runner.
 *
 * Applies every supabase/migrations/*.sql in filename order inside one
 * transaction each, recording what ran in supabase_migrations.schema_migrations
 * so re-running is a no-op. This is the only thing in the repository that is
 * allowed to change the shape of the database.
 *
 *   npm run db:migrate            apply anything not yet applied
 *   npm run db:reset              drop the schema and reapply from zero
 *   npm run db:seed               re-run only the seed migration
 *
 * Connects with SUPABASE_DB_URL — a direct Postgres connection used by scripts
 * alone. No application module ever reads it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const MIGRATIONS_DIR = join(root, "supabase", "migrations");

const { Client } = pg;

function loadEnv() {
  try {
    const raw = readFileSync(join(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["'](.*)["']$/, "$1");
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  } catch {
    /* .env is optional — CI may inject the environment directly. */
  }
}

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function ensureLedger(client) {
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version    text primary key,
      applied_at timestamptz not null default now()
    );
  `);
}

async function appliedVersions(client) {
  const { rows } = await client.query(
    "select version from supabase_migrations.schema_migrations",
  );
  return new Set(rows.map((r) => r.version));
}

async function dropSchema(client) {
  console.log("  dropping public schema…");
  // Storage policies live in the storage schema and reference public.is_admin(),
  // so drop the policies before the functions they depend on.
  await client.query("drop schema if exists public cascade;");
  await client.query("drop schema if exists supabase_migrations cascade;");
}

async function main() {
  loadEnv();

  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.error(
      "SUPABASE_DB_URL is not set.\n" +
        "Add it to .env — Supabase Dashboard → Connection string → Session pooler.\n" +
        "It is used only by scripts, never by the application.",
    );
    process.exit(1);
  }

  const reset = process.argv.includes("--reset");
  const seedOnly = process.argv.includes("--seed-only");

  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("connected.");

  try {
    if (reset) await dropSchema(client);

    await ensureLedger(client);

    const files = migrationFiles();
    if (files.length === 0) {
      console.log("no migrations found.");
      return;
    }

    const done = await appliedVersions(client);
    const pending = seedOnly
      ? files.filter((f) => f.includes("seed"))
      : files.filter((f) => !done.has(f));

    if (pending.length === 0) {
      console.log(`nothing to do — ${files.length} migrations, all applied.`);
      return;
    }

    for (const file of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`  applying ${file} … `);
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query(
          "insert into supabase_migrations.schema_migrations (version) values ($1)",
          [file],
        );
        await client.query("commit");
        console.log("ok");
      } catch (err) {
        await client.query("rollback");
        console.log("FAILED");
        console.error(`\n  ${file}\n  ${err.message}\n`);
        process.exit(1);
      }
    }

    console.log(`\ndone — ${pending.length} migration(s) applied.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});