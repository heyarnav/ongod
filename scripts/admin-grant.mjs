#!/usr/bin/env node
/**
 * Grant Control Room access to an operator.
 *
 *   npm run admin:grant you@yourdomain.com
 *
 * This script never sees, creates or stores a password. Supabase Auth is the
 * identity authority, so the credential lives there and only there — create it
 * in the dashboard under Authentication → Users (or send an invite). This
 * script only writes the GRANT: a row in `admin_users` keyed on that account's
 * `auth.users.id`.
 *
 * The two things are deliberately separate:
 *
 *   Supabase Auth  -> who you are          (set in the dashboard)
 *   admin_users    -> what you may see     (set here)
 *
 * Removing this row demotes the account to an ordinary customer immediately.
 *
 * Refuses to add a second operator unless --force is passed: a grant means
 * read access to every order, customer and price.
 */
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  try {
    const raw = readFileSync(join(root, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const v = m[2].trim().replace(/^["'](.*)["']$/, "$1");
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch {
    /* .env is optional — CI may inject the environment directly. */
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const force = process.argv.includes("--force");

// Skip argv[0] (the node binary) and argv[1] (this script path) — otherwise
// the executable path is read as the email address.
const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("-")) ?? "").trim();
const nameIndex = args.indexOf("--name");
const name = nameIndex !== -1 ? args[nameIndex + 1] : "Keeper";

function fail(message, hint) {
  console.error(`\n  ${message}\n`);
  if (hint) console.error(`  ${hint}\n`);
  process.exit(1);
}

if (!url || !serviceKey) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.",
    "Copy .env.example to .env and fill them in.",
  );
}

if (!email || !email.includes("@")) {
  fail(
    "No email given.",
    "Usage: npm run admin:grant you@yourdomain.com",
  );
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // ── the credential must already exist in Supabase ────────────────────
  const { data: list } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  const user = (list?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );

  if (!user) {
    fail(
      `No Supabase Auth user for ${email}.`,
      "Create the account first: Supabase dashboard → Authentication → Users → Add user.\n" +
        "  Set a password there. This script never handles passwords.",
    );
  }

  // ── who already holds the grant? ─────────────────────────────────────
  const { data: existing, error: readError } = await admin
    .from("admin_users")
    .select("user_id, email, name, role");

  if (readError) fail(`Could not read admin_users: ${readError.message}`);

  const mine = (existing ?? []).find((r) => r.user_id === user.id);

  if ((existing ?? []).length > 0 && !mine && !force) {
    console.error("\n  A Control Room operator already exists:\n");
    for (const r of existing ?? []) {
      console.error(`    ${r.email}  (${r.name}, role ${r.role})`);
    }
    console.error(`\n  ${email} is a different account.`);
    console.error(
      "  A grant means read access to every order, customer and price.\n",
    );
    console.error("  To hand the role over, delete the existing admin_users row in");
    console.error("  the Supabase SQL editor and run this again.");
    console.error("  To add a deliberate second operator, re-run with --force.\n");
    process.exit(1);
  }

  const { error } = await admin.from("admin_users").upsert(
    { user_id: user.id, email, name, role: "admin" },
    { onConflict: "user_id" },
  );

  if (error) fail(`failed to write admin_users: ${error.message}`);

  console.log(`\n  granted: ${email}`);
  console.log(`  auth id: ${user.id}`);
  console.log(`  ${mine ? "updated existing grant" : "new operator"}`);
  console.log("\n  Sign in at /admin/login with the password you set in Supabase.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});