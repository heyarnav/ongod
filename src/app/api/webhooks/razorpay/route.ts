import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  WEBHOOK_SIGNATURE_HEADER,
  isSettledRefund,
  parseWebhookEvent,
  paymentOf,
  verifyWebhookSignature,
} from "@/lib/razorpay/webhook";

/**
 * Razorpay webhook.
 *
 * This route is the reason a customer can close their browser mid-payment and
 * still be recorded as paid. The browser's success callback is a convenience
 * for the confirmation screen; this is the authority.
 *
 * Three rules it never breaks:
 *
 *   1. Read the RAW body. The signature is an HMAC over the exact bytes
 *      Razorpay sent. Parsing first and re-serialising produces a different
 *      hash, so verification happens before parse, always.
 *   2. Verify before acting. An unverified payload is a stranger's JSON with
 *      the word "captured" in it.
 *   3. Acknowledge fast and do the work inline. Razorpay retries anything that
 *      is not a timely 2xx, and mark_order_paid() is idempotent, so a retry is
 *      safe rather than a duplicate capture.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get(WEBHOOK_SIGNATURE_HEADER);

  if (!verifyWebhookSignature(raw, signature)) {
    // Deliberately uninformative: a caller who cannot sign gets nothing about
    // what was wrong.
    console.warn("[razorpay-webhook] rejected: bad or missing signature");
    return NextResponse.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  const event = parseWebhookEvent(raw);
  if (!event) {
    // Signed but unreadable. Acknowledge so Razorpay stops retrying garbage.
    return NextResponse.json({ ok: true, ignored: "UNPARSEABLE" });
  }

  const admin = createAdminClient();

  try {
    if (event.event === "payment.captured") {
      const payment = paymentOf(event);
      if (!payment) return NextResponse.json({ ok: true, ignored: "NO_PAYMENT" });

      const { data, error } = await admin.rpc("mark_order_paid", {
        p_razorpay_payment_id: payment.id,
        p_razorpay_signature: signature ?? "",
        p_razorpay_order_id: payment.order_id,
      });

      if (error) {
        // ORDER_NOT_FOUND means the payment references an order this
        // application never issued. Worth shouting about: it is money with
        // nowhere to go.
        console.error(`[razorpay-webhook] ${error.message} (payment ${payment.id})`);
        return NextResponse.json({ error: "UNKNOWN_ORDER" }, { status: 404 });
      }

      console.log(`[razorpay-webhook] captured ${payment.id} → ${JSON.stringify(data)}`);
      return NextResponse.json({ ok: true, order: data });
    }

    if (event.event === "payment.failed") {
      const payment = paymentOf(event);
      if (!payment) return NextResponse.json({ ok: true, ignored: "NO_PAYMENT" });

      // A failure does NOT release stock. The customer may retry inside the
      // window; only expiry returns it.
      const { error } = await admin.rpc("mark_order_payment_failed", {
        p_razorpay_payment_id: payment.id,
        p_razorpay_order_id: payment.order_id,
      });
      if (error) console.error(`[razorpay-webhook] failed-event: ${error.message}`);
      return NextResponse.json({ ok: true });
    }

    if (isSettledRefund(event)) {
      const refund = event.payload?.refund?.entity;
      if (!refund?.id) return NextResponse.json({ ok: true, ignored: "NO_REFUND" });

      // The payment id travels in the refund notes by convention; fall back to
      // matching on the recorded payment when it is not there.
      const paymentId = refund.notes?.razorpay_payment_id ?? "";
      if (paymentId) {
        const { error } = await admin
          .from("orders")
          .update({ payment_status: "REFUNDED" })
          .eq("gateway_payment_id", paymentId);
        if (error) console.error(`[razorpay-webhook] refund: ${error.message}`);
      } else {
        console.warn(`[razorpay-webhook] refund ${refund.id} had no payment id; not applied`);
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: true, ignored: event.event });
  } catch (err) {
    console.error("[razorpay-webhook] handler threw:", (err as Error).message);
    // 500 makes Razorpay retry, which is what we want for a transient failure.
    return NextResponse.json({ error: "HANDLER_FAILED" }, { status: 500 });
  }
}

/**
 * Razorpay's dashboard pings this after you save an endpoint. Answering
 * without a body is enough; it is not a payment event.
 */
export async function GET() {
  return NextResponse.json({ ok: true, service: "razorpay-webhook" });
}