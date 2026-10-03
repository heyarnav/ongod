#!/usr/bin/env node
/**
 * Set a Supabase Auth password directly, without sending an email.
 *
 *   npm run admin:password you@yourdomain.com
 *
 * WHY THIS EXISTS
 * Supabase's built-in email provider allows 2 emails per hour, project-wide
 * (dashboard: Authentication -> Rate Limits). That cap cannot be raised without
 * custom SMTP or a Send Email hook, so "forgot password" dies with
 * "email rate limit exceeded" no matter how many times you click. This script
 * bypasses email entirely: the service role writes the password straight to the
 * auth user, then proves it by actually signing in.
 *
 * The password is typed at a hidden prompt. It is never an argument, never in
 * .env, and never written to disk. Supabase stores only its bcrypt hash.
 *
 * Piped input is accepted for scripting: line 1 is the password, line 2 is the
 * confirmation. On a terminal it prompts twice with nothing echoed.
 */
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("-")) ?? "").trim();

const MIN = 12;

function fail(message, hint) {
  console.error(`\n  ${message}\n`);
  if (hint) console.error(`  ${hint}\n`);
  process.exit(1);
}

/**
 * A question whose answer is not echoed. Only used on a real terminal — a pipe
 * has no echo to suppress, and two readline instances cannot share one pipe
 * (the second would see nothing), so piped input is read in one pass instead.
 */
function askHidden(prompt) {
  return new Promise((done) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl._writeToOutput = function () {
      // Swallow the typed characters; only the asterisks below are shown.
      this.output.write("*");
    };
    // Printed here rather than passed to question(), because readline may emit
    // the prompt in its own chunk, which the override above would discard.
    process.stdout.write(prompt);
    rl.question("", (answer) => {
      rl.output.write("\n");
      rl.close();
      done(answer);
    });
  });
}

/** Piped input: line 1 is the password, line 2 (if present) the confirmation. */
async function pipedPasswords() {
  let buffer = "";
  for await (const chunk of process.stdin) buffer += chunk;
  const lines = buffer.split("\n").map((l) => l.replace(/\r$/, ""));
  return {
    password: lines[0] ?? "",
    confirm: lines.length > 1 ? lines[1] : null,
  };
}

if (!url || !serviceKey) {
  fail(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.",
    "Copy .env.example to .env and fill them in.",
  );
}

if (!email || !email.includes("@")) {
  fail("No email given.", "Usage: npm run admin:password you@yourdomain.com");
}

const service = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: list } = await service.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const user = (list?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === email.toLowerCase(),
  );
  if (!user) {
    fail(
      `No Supabase Auth user for ${email}.`,
      "Create it first: dashboard -> Authentication -> Users -> Add user.\n" +
        "  Or grant and create nothing: npm run admin:grant only works on\n" +
        "  accounts that already exist in Auth.",
    );
  }

  // ── collect the password: hidden double prompt, or one pass over a pipe ─
  let password;
  let confirm = null;
  if (process.stdin.isTTY) {
    password = await askHidden("  password: ");
    confirm = await askHidden("  again:    ");
  } else {
    const piped = await pipedPasswords();
    password = piped.password;
    confirm = piped.confirm;
  }

  if (confirm !== null && password !== confirm) {
    fail("The two entries did not match.", "Nothing was changed.");
  }

  if (password.length < MIN) {
    fail(
      `That is ${password.length} characters; at least ${MIN} are required.`,
      "Nothing was changed.",
    );
  }

  const { error } = await service.auth.admin.updateUserById(user.id, { password });
  if (error) fail(`Could not set the password: ${error.message}`);

  // ── prove it, rather than claim it ───────────────────────────────────
  let verified = "skipped (anon key missing)";
  if (anonKey) {
    const anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error: signInError } = await anon.auth.signInWithPassword({
      email,
      password,
    });
    verified = signInError
      ? `FAILED — ${signInError.message}`
      : `ok — ${data.user.id}, expires ${data.session.expires_at}`;
    await anon.auth.signOut();
  }

  const { data: grant } = await service
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  console.log(`\n  password set for: ${email}`);
  console.log(`  auth id:          ${user.id}`);
  console.log(`  sign-in check:    ${verified}`);
  console.log(
    `  control room:     ${grant ? `granted (${grant.role})` : "NO GRANT — run npm run admin:grant"}`,
  );
  if (String(verified).startsWith("FAILED")) {
    console.log("\n  The password was written but does not sign in. Do not trust it.");
    process.exit(1);
  }
  console.log("\n  Sign in at /admin/login with it. It is not recoverable from disk.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
