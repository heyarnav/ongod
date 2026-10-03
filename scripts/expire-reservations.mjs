#!/usr/bin/env node
/**
 * Release expired stock holds.
 *
 *   npm run orders:expire
 *
 * place_order() sweeps automatically before every new order, and Vercel Cron
 * can hit GET /api/cron/expire. This is the by-hand version, for a machine
 * where neither is running.
 */
import fs from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const raw = fs.readFileSync(join(root, ".env"), "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^["'](.*)["']$/, "$1");
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
} catch {
  /* environment may already be injected */
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.\n" +
      "expire_reservations() is revoked from anon and authenticated, so this\n" +
      "script needs the service role key to call it.",
  );
  process.exit(1);
}

const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await admin.rpc("expire_reservations", { p_limit: 500 });

if (error) {
  console.error("sweep failed:", error.message);
  process.exit(1);
}

const expired = Number(data ?? 0);
console.log(expired === 0 ? "no reservations had expired." : `released ${expired} reservation(s).`);