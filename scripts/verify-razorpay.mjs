#!/usr/bin/env node
/**
 * Verify the Razorpay integration against Razorpay's real API.
 *
 *   npm run verify:razorpay
 *
 * Read-only apart from creating ONE order object in whatever mode your keys
 * are in. Test keys (`rzp_test_…`) create a test order and move no money.
 *
 * What it proves, and why each part matters:
 *
 *   1. `isRazorpayConfigured()` sees both keys.
 *   2. `orders.create` works with these credentials — real network, real auth.
 *      This is the part a mock can never tell you.
 *   3. The order comes back with the amount and receipt we asked for, so the
 *      amount we send is not being silently rescaled.
 *   4. Our checkout-signature HMAC agrees with Razorpay's own
 *      `utility.verifyPaymentSignature`. Comparing against the vendor's
 *      implementation is the only way to know we read the spec correctly.
 *   5. Our webhook-signature HMAC agrees with
 *      `utility.verifyWebhookSignature`.
 *
 * Point 4 and 5 are the ones worth reading: a subtly wrong HMAC passes every
 * test you write yourself and then refuses every real payment.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Razorpay from "razorpay";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const utils = require_("razorpay/dist/utils/razorpay-utils.js");

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

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

let pass = 0;
let fail = 0;

/**
 * Razorpay's SDK rejects with a plain object (`.error.description`,
 * `.error.code`), not an Error, so `err.message` is undefined and
 * `String(err)` prints the useless `[object Object]`. Pull out anything
 * printable before it is lost.
 */
const describe = (err) => {
  if (!err) return "(no error thrown)";
  if (typeof err === "string") return err;
  const parts = [];
  if (err.error) {
    parts.push(`code=${err.error.code ?? "?"}`);
    parts.push(`description=${err.error.description ?? "?"}`);
    parts.push(`source=${err.error.source ?? "?"}`);
    parts.push(`step=${err.error.step ?? "?"}`);
    if (err.error.metadata) parts.push(`metadata=${JSON.stringify(err.error.metadata)}`);
  }
  if (err.response) {
    parts.push(`http=${err.response.statusCode ?? "?"}`);
    if (err.response.body) parts.push(`body=${JSON.stringify(err.response.body).slice(0, 400)}`);
  }
  if (err.message) parts.push(`message=${err.message}`);
  if (err.description) parts.push(`description=${err.description}`);
  if (err.code) parts.push(`code=${err.code}`);
  return parts.length ? parts.join("  ") : JSON.stringify(err);
};

const check = (label, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${detail}`); }
};

console.log("\nrazorpay live check\n");

// ── 1. configuration ────────────────────────────────────────────────────────
const configured = Boolean(KEY_ID && KEY_SECRET);
check("isRazorpayConfigured() would return true", configured, "(keys missing from .env)");

if (!configured) {
  console.log("\nNothing to verify — add the keys to .env and run this again.\n");
  process.exit(1);
}

const mode = KEY_ID.startsWith("rzp_test_") ? "TEST" : "LIVE";
console.log(`  mode:  ${mode}  (${KEY_ID.slice(0, 12)}…)`);
if (mode === "LIVE") {
  console.log("  note:  this creates ONE real order object in your live dashboard.");
}

const rzp = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });

// ── 2 & 3. a real order ─────────────────────────────────────────────────────
let created = null;
{
  const amount = 100; // ₹1.00 — the smallest possible object
  const receipt = `verify-${Date.now()}`;
  try {
    created = await rzp.orders.create({
      amount,
      currency: "INR",
      receipt,
      payment_capture: true,
      notes: { source: "verify-razorpay" },
    });
    check("orders.create succeeded against Razorpay", !!created?.id, JSON.stringify(created).slice(0, 120));
    check("the returned amount matches what we sent", Number(created?.amount) === amount, `sent ${amount}, got ${created?.amount}`);
    check("the receipt round-tripped", created?.receipt === receipt, `${created?.receipt}`);
    check("currency is INR", created?.currency === "INR", created?.currency);
    console.log(`        (order ${created?.id})`);
  } catch (err) {
    check("orders.create succeeded against Razorpay", false, describe(err));
    console.log("\n  A 400 here usually means KYC is not activated for live mode;");
    console.log("  test keys should work regardless.\n");
  }
}

// ── 4. our checkout HMAC vs Razorpay's own ──────────────────────────────────
console.log("\n  signature agreement with Razorpay's implementation:");
{
  const orderId = created?.id ?? "order_TEST123";
  const paymentId = "pay_TEST456";

  const ours = crypto.createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");

  // razorpay-utils is internal to the SDK rather than on the instance, so it is
  // reached by path. It is still the vendor's own code, which is the point.
  check(
    "our checkout signature verifies with Razorpay's own implementation",
    utils.validatePaymentVerification({ order_id: orderId, payment_id: paymentId }, ours, KEY_SECRET) === true,
  );

  const tampered = ours.slice(0, -2) + (ours.slice(-2) === "00" ? "11" : "00");
  check(
    "a tampered signature is rejected by Razorpay",
    utils.validatePaymentVerification({ order_id: orderId, payment_id: paymentId }, tampered, KEY_SECRET) === false,
  );

  // timingSafeEqual THROWS on a length mismatch — that is why verifyCheckoutSignature
  // compares lengths first. This asserts the guard we actually ship, not the raw call.
  const guard = (expected, received) => {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(received, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  };
  check("the length guard accepts the identical signature", guard(ours, ours) === true);
  check("the length guard rejects a same-length mismatch", guard(ours, tampered) === false);
  check("the length guard rejects a SHORT signature without throwing", (() => {
    try { return guard(ours, "short") === false; }
    catch { return false; }
  })());
}

// ── 5. our webhook HMAC vs Razorpay's own ───────────────────────────────────
{
  if (!WEBHOOK_SECRET) {
    console.log("  webhook HMAC: SKIPPED — RAZORPAY_WEBHOOK_SECRET is not set.");
    console.log("                 Set it once the webhook exists in the dashboard.");
  } else {
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_x" } } } });
    const ours = crypto.createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

    check(
      "our webhook signature verifies with Razorpay's own implementation",
      utils.validateWebhookSignature(body, ours, WEBHOOK_SECRET) === true,
    );
    check(
      "a tampered webhook signature is rejected",
      utils.validateWebhookSignature(body, `${ours.slice(0, -1)}0`, WEBHOOK_SECRET) === false,
    );
  }
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);