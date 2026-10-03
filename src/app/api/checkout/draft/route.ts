import { NextRequest, NextResponse } from "next/server";
import { requireCustomer } from "@/lib/supabase/session";
import {
  readCheckoutDraft,
  revalidateDraftCart,
  DRAFT_TTL_MINUTES,
} from "@/lib/checkout-draft-server";

/**
 * Give a signed-in shopper back the checkout they started before verifying.
 *
 * This is the other half of the draft written by /api/checkout/otp. The emailed
 * link may be opened in any browser at all — the point is that the basket is
 * not in that browser. So it is read from the server, keyed by a token that only
 * travelled in a link that was emailed to them.
 *
 * Two refusals, both indistinguishable to the caller:
 *
 *   - no session. The shopper has not verified, so there is nobody to restore
 *     for. The link lands here only after /auth/callback has run.
 *   - no matching draft. Wrong token, someone else's, or expired all read as
 *     DRAFT_EXPIRED, because a distinct answer per case turns this into an
 *     oracle for guessing whether a token exists and whose it is.
 *
 * Prices, preorder status, publication and per-variant stock are re-read from
 * the catalogue here rather than taken from the draft, which recorded only what
 * the shopper was looking at. Anything no longer buyable comes back separately
 * so the page can name it instead of quietly presenting a smaller order.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireCustomer();
  if (!auth.ok) {
    return NextResponse.json({ error: "SIGN_IN_REQUIRED" }, { status: 401 });
  }

  const token = req.nextUrl.searchParams.get("draft") ?? "";
  const draft = await readCheckoutDraft(token, auth.customer.email);

  if (!draft) {
    return NextResponse.json({ error: "DRAFT_EXPIRED" }, { status: 410 });
  }

  const { lines, unavailable } = await revalidateDraftCart(draft.cart);

  return NextResponse.json({
    ok: true,
    email: auth.customer.email,
    lines,
    unavailable,
    form: draft.form,
    ttlMinutes: DRAFT_TTL_MINUTES,
  });
}
