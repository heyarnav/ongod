import "server-only";

import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CartLine } from "@/types";

/**
 * The server half of a checkout that is halfway through proving an email.
 *
 * The client keeps a cart in localStorage and a form in sessionStorage. Both
 * are per-browser, so an emailed confirmation link opened in Gmail's in-app
 * viewer, on a phone, or in a private window arrives at /checkout with nothing
 * at all — and the shopper is told they have nothing to buy, moments after
 * proving they own the inbox. This module is the fix: the intent to buy is
 * recorded here, on the server, before the mail goes out.
 *
 * Three rules this module exists to enforce:
 *
 *   1. The token is the ONLY thing that ever travels in a URL. No address, no
 *      name, no product, no price. It is 32 bytes of CSPRNG output, base64url,
 *      and it means nothing to anyone who did not receive the email.
 *   2. The token alone is not authority. Every read requires a session whose
 *      email matches the draft, so a token that leaks through browser history,
 *      a shared link or a Referer header still restores nothing.
 *   3. No order, no reservation, no stock is touched. place_order() still runs
 *      only when the shopper proceeds to payment. Asking for a code must never
 *      be able to create an order — that would let anyone manufacture orders by
 *      typing an address into a form.
 */

export const DRAFT_TTL_MINUTES = 30;

/** Matches the token shape so junk never reaches the database. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

/** A draft is a shopping intention, not a warehouse transfer. */
const MAX_LINES = 20;
const MAX_QUANTITY = 10;
/** Generous for a name and a couple of address lines, and nothing more. */
const MAX_TEXT = 200;

export type DraftForm = {
  name: string;
  phone: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
};

export type DraftCartLine = { productId: string; size: string; quantity: number };

export type RestoredLine = CartLine & { available: boolean; reason?: string };

export type RestoreResult =
  | { status: "ok"; lines: RestoredLine[]; unavailable: RestoredLine[]; form: DraftForm }
  | { status: "expired" };

export function newDraftToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Strip a draft down to what is safe to store. Anything unrecognised becomes an
 * empty string rather than passing through, so a hostile client cannot stuff a
 * row with arbitrary JSON.
 */
function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, MAX_TEXT);
}

export function normaliseCart(input: unknown): DraftCartLine[] {
  if (!Array.isArray(input)) return [];
  const out: DraftCartLine[] = [];
  for (const raw of input.slice(0, MAX_LINES)) {
    const line = raw as Record<string, unknown>;
    const productId = typeof line?.productId === "string" ? line.productId : "";
    const size = typeof line?.size === "string" ? line.size : "";
    const quantity = typeof line?.quantity === "number" ? line.quantity : 0;
    if (!productId || !size || !Number.isFinite(quantity)) continue;
    out.push({ productId, size: size.slice(0, 12), quantity: Math.max(1, Math.min(MAX_QUANTITY, Math.floor(quantity))) });
  }
  return out;
}

export function normaliseForm(input: unknown): DraftForm {
  const f = (input ?? {}) as Record<string, unknown>;
  return {
    name: cleanText(f.name),
    phone: cleanText(f.phone),
    address1: cleanText(f.address1),
    address2: cleanText(f.address2),
    city: cleanText(f.city),
    state: cleanText(f.state),
    pincode: cleanText(f.pincode),
  };
}

/**
 * Record the intent to buy. Called from the OTP route inside after(), so a
 * throttled or failed send mints nothing.
 *
 * The token is PASSED IN, not generated here. That is deliberate and it was a
 * real bug once: the caller has to answer the browser synchronously, before
 * after() has run, so it must already know the handle it is about to hand out.
 * Generating one in each place produced a token the shopper was given and a
 * different token the row was stored under — a handle to nothing, and every
 * restore silently 410'd.
 */
export async function createCheckoutDraft(input: {
  token: string;
  email: string;
  cart: unknown;
  form: unknown;
}): Promise<{ token: string; expiresAt: string }> {
  const admin = createAdminClient();
  const token = input.token;
  const expiresAt = new Date(Date.now() + DRAFT_TTL_MINUTES * 60_000).toISOString();

  const { error } = await admin.from("checkout_drafts").insert({
    token,
    email: input.email.trim().toLowerCase(),
    cart: normaliseCart(input.cart),
    form: normaliseForm(input.form),
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);

  // Housekeeping, never in the request path.
  admin.rpc("prune_checkout_drafts").then(() => {}, () => {});

  return { token, expiresAt };
}

/**
 * Read a draft back, for the customer who owns it.
 *
 * Expired, unknown and someone else's draft are all reported as "expired". A
 * distinct answer per case would turn this into an oracle for testing whether a
 * token exists and whose it is.
 */
export async function readCheckoutDraft(
  token: string,
  sessionEmail: string,
): Promise<{ cart: DraftCartLine[]; form: DraftForm } | null> {
  if (!TOKEN_RE.test(token)) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("checkout_drafts")
    .select("email, cart, form, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;
  if (String(data.email).toLowerCase() !== sessionEmail.trim().toLowerCase()) return null;

  return { cart: normaliseCart(data.cart), form: normaliseForm(data.form) };
}

/**
 * Re-price and re-check a restored basket against the live catalogue.
 *
 * The draft records what the shopper was looking at. It does not get to decide
 * what it costs now, whether it is still for sale, or whether it is still in
 * pre-order. Anything that fails is returned separately as `unavailable` so the
 * checkout page can say which pieces changed rather than silently presenting a
 * smaller order as if that is what they asked for.
 */
export async function revalidateDraftCart(
  lines: DraftCartLine[],
): Promise<{ lines: RestoredLine[]; unavailable: RestoredLine[] }> {
  if (!lines.length) return { lines: [], unavailable: [] };

  const admin = createAdminClient();
  const ids = [...new Set(lines.map((l) => l.productId))];

  const { data: products } = await admin
    .from("products")
    // og_image, not image: products has no `image` column, and asking for one is a
    // 400 that silently empties this whole result set — which reads as "every
    // piece has vanished" rather than as the error it is.
    .select("id, slug, name, archive_number, price, currency, drop_status, edition_label, status, og_image, collections ( name, slug )")
    .in("id", ids);

  const byProduct = new Map((products ?? []).map((p) => [p.id as string, p]));
  const kept: RestoredLine[] = [];
  const dropped: RestoredLine[] = [];

  for (const line of lines) {
    const product = byProduct.get(line.productId);
    const collection = (product?.collections ?? null) as { name?: string; slug?: string } | null;

    // A placeholder so the UI can name what is missing rather than showing a
    // blank row for something that used to be there.
    const shell = {
      productId: line.productId,
      slug: product?.slug ?? "",
      name: product?.name ?? "NO LONGER AVAILABLE",
      archiveNumber: product?.archive_number ?? "",
      collectionName: collection?.name ?? "",
      size: line.size,
      // Server price, always. The client's snapshot is never trusted.
      price: Number(product?.price ?? 0),
      quantity: line.quantity,
      image: product?.og_image ?? "",
      maxStock: 0,
      dropStatus: product?.drop_status ?? "",
      editionLabel: product?.edition_label ?? "",
    } as RestoredLine;

    if (!product) {
      dropped.push({ ...shell, available: false, reason: "This piece is no longer listed." });
      continue;
    }
    if (product.status !== "PUBLISHED") {
      dropped.push({ ...shell, available: false, reason: "This piece is no longer published." });
      continue;
    }

    const { data: variants } = await admin
      .from("product_variants")
      .select("size, stock, active")
      .eq("product_id", line.productId)
      .eq("size", line.size)
      .maybeSingle();

    const stock = variants?.active === false ? 0 : Number(variants?.stock ?? 0);
    if (!variants || stock <= 0) {
      dropped.push({ ...shell, available: false, reason: "That size is sold out." });
      continue;
    }

    const quantity = Math.min(line.quantity, stock);
    if (quantity < line.quantity) {
      kept.push({ ...shell, quantity, maxStock: stock, available: true });
      continue;
    }

    kept.push({ ...shell, maxStock: stock, available: true });
  }

  return { lines: kept, unavailable: dropped };
}
