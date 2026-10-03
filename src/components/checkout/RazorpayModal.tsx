"use client";

/**
 * Razorpay Checkout, loaded on demand.
 *
 * The script is fetched from Razorpay's CDN only when a payment is actually
 * attempted — never on page load. A shopper who never reaches the payment step
 * does not download a third-party bundle, and the page does not depend on that
 * CDN being reachable in order to render a form.
 *
 * The `Razorpay` global is declared here rather than pulling the package's
 * types into the client: the npm package is the SERVER SDK. The browser gets
 * the hosted sheet.
 */

const SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  modal?: {
    ondismiss?: () => void;
    // Razorpay surfaces this after a completed payment. It is NOT proof of
    // payment — the handler only triggers the server-side verification.
    handler?: (response: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    }) => void;
  };
  retry?: { enabled: boolean };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => { open: () => void };
  }
}

let loading: Promise<void> | null = null;

/** Load checkout.js once per page. Repeated calls share one in-flight request. */
function loadCheckoutJs(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("client only"));
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("RAZORPAY_SCRIPT_FAILED"));
    };
    document.body.appendChild(script);
  });

  return loading;
}

export type PaymentResult = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

/**
 * Open the hosted payment sheet.
 *
 * Resolves with the payment details on success, or null if the customer closed
 * the sheet — a dismissal is not an error and must not be reported as a failed
 * payment, because the order is still awaiting one.
 */
export async function openRazorpayCheckout(opts: {
  key: string;
  amount: number;
  currency: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}): Promise<PaymentResult | null> {
  try {
    await loadCheckoutJs();
  } catch {
    throw new Error("RAZORPAY_SCRIPT_FAILED");
  }

  if (!window.Razorpay) throw new Error("RAZORPAY_SCRIPT_FAILED");

  return new Promise<PaymentResult | null>((resolve, reject) => {
    let settled = false;

    const checkout = new window.Razorpay!({
      key: opts.key,
      amount: opts.amount,
      currency: opts.currency,
      name: "on god.",
      description: `Order ${opts.orderNumber}`,
      order_id: opts.orderId,
      prefill: {
        name: opts.customerName,
        email: opts.customerEmail,
        contact: opts.customerPhone,
      },
      notes: { order_number: opts.orderNumber },
      theme: { color: "#7F1518" },
      retry: { enabled: true },
      modal: {
        ondismiss: () => {
          if (settled) return;
          settled = true;
          resolve(null);
        },
        handler: (response) => {
          if (settled) return;
          settled = true;
          resolve(response);
        },
      },
    });

    checkout.open();
  });
}