"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart, cartSubtotal } from "@/lib/cart/store";
import { formatINR } from "@/lib/format";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { RegistrationMark } from "@/components/ui/marks";
import {
  ADDRESS_LABEL_TEXT,
  formatAddress,
  type SavedAddress,
} from "@/lib/addresses";
import { createClient } from "@/lib/supabase/browser";
import { describeSendFailure, describeVerifyFailure } from "@/lib/auth-errors";
import { openRazorpayCheckout } from "@/components/checkout/RazorpayModal";
import { clearDraft, loadDraft, saveDraft, type CheckoutDraft } from "@/lib/checkout-draft";
import type { CartLine } from "@/types";

/** A line as the server returns it after re-pricing and re-checking stock. */
type RestoredCartLine = CartLine & { available?: boolean; reason?: string };

/**
 * Checkout — one form, three phases, no redirect.
 *
 * The old flow threw the shopper away to /account/login the moment they hit
 * pay: address typed, then an OTP email, then a code, then back to an empty
 * form. This version keeps the form mounted through the entire flow. The OTP
 * panel appears BESIDE the fields, not instead of them, so nothing typed is
 * ever retyped.
 *
 *   details  →  the form
 *   verify   →  a six-digit code, inline, countdown, resend
 *   paying   →  the Razorpay sheet
 *
 * Identity is still Supabase Auth and only Supabase Auth. The difference is
 * when proof is demanded and where it is typed, not what creates the account:
 * `getCustomer()` still materialises the profile row, the server still derives
 * the customer from `auth.uid()`, and no order or inventory move happens until
 * the address has been proven.
 */

export type Acknowledgement = {
  hasPreOrder: boolean;
  editionLabel: string;
  dispatchPeriod: string;
};

type Phase = "details" | "verify" | "paying" | "done" | "error";

type Fields = CheckoutDraft;

const EMPTY: Fields = {
  name: "",
  phone: "",
  email: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  pincode: "",
  picked: null,
  keepAddress: false,
  acknowledged: false,
};

const RESEND_SECONDS = 45;

export function CheckoutClient({
  acknowledgement,
  addresses: initialAddresses,
  canSave: initialCanSave,
  customerEmail,
  signedInInitially,
}: {
  acknowledgement: Acknowledgement;
  addresses: SavedAddress[];
  canSave: boolean;
  /** Empty string when nobody is signed in yet — this is now allowed. */
  customerEmail: string;
  /** Lets the form skip straight to payment for someone already signed in. */
  signedInInitially: boolean;
}) {
  const router = useRouter();
  const { lines, clear } = useCart();
  const subtotal = cartSubtotal(lines);

  const [phase, setPhase] = useState<Phase>("details");
  const [message, setMessage] = useState("");
  // Someone who arrives with a session has already proven this inbox, so the
  // panel below would only be asking them to prove it a second time.
  const [verified, setVerified] = useState(signedInInitially);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fields, setFields] = useState<Fields>(() => {
    const draft = loadDraft();
    if (!draft) return { ...EMPTY, email: customerEmail };
    // A draft never overrides a known address: the session is the authority on
    // who this is, and a stale draft must not repoint the order.
    return { ...draft, email: customerEmail || draft.email };
  });
  const [addresses, setAddresses] = useState<SavedAddress[]>(initialAddresses);
  const [canSave, setCanSave] = useState(initialCanSave);

  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  /** The uuid of an order that exists but has not been paid. Null until one does. */
  const [unpaidOrderId, setUnpaidOrderId] = useState<string | null>(null);
  /** Opaque handle on the server-held basket, minted when the code is sent. */
  const [draftToken, setDraftToken] = useState<string | null>(null);
  /** The link was followed and we are asking the server what it kept. */
  const [restoring, setRestoring] = useState(false);
  /** The link was followed but the held basket is gone. Not "empty cart". */
  const [draftExpired, setDraftExpired] = useState(false);
  /** Pieces the server could not honour, named rather than silently dropped. */
  const [dropped, setDropped] = useState<{ name: string; reason: string }[]>([]);
  const hydrated = useRef(false);

  /**
   * Whether the persisted cart has been read back yet.
   *
   * The cart lives in localStorage, which does not exist on the server — so
   * every server render of this page believes the cart is empty, and the HTML
   * that arrives says "NOTHING TO ACQUIRE." That is not a cosmetic flash: the
   * shopper who followed their emailed confirmation link waits through a cold
   * function plus a rehydration and is told they have nothing, on a page they
   * just proved they are allowed to buy from. If the bundle is slow the wrong
   * answer simply stays on screen.
   *
   * So nothing here may claim to know what is in the cart until the store says
   * it has finished reading.
   *
   * Deliberately starting at false rather than reading `hasHydrated()` as
   * initial state: on the server that call already answers true, because
   * zustand falls back to a no-op storage that resolves immediately. Asked the
   * question during render, it would hand back the one answer that is always
   * wrong.
   */
  const [cartKnown, setCartKnown] = useState(false);
  useEffect(() => {
    const done = () => setCartKnown(true);
    if (useCart.persist.hasHydrated()) {
      done();
      return;
    }
    const unsubscribe = useCart.persist.onFinishHydration(done);
    return unsubscribe;
  }, []);

  // ── Draft persistence ──────────────────────────────────────────────────────
  // Every keystroke. A refresh mid-OTP must not cost the address.
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    saveDraft(fields);
  }, [fields]);

  // ── Resend countdown ───────────────────────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /**
   * Ask the server whether a session exists. 401 means "not yet" and mutates
   * nothing, so this is safe to call speculatively — which is exactly what the
   * panel below does while it waits for the shopper's inbox.
   */
  const adoptSession = useCallback(async () => {
    const res = await fetch("/api/checkout/otp/verify", { cache: "no-store" });
    if (!res.ok) return false;

    const data = await res.json();
    if (data.addresses) setAddresses(data.addresses as SavedAddress[]);
    setCanSave(true);
    if (data.email) setFields((f) => ({ ...f, email: data.email }));
    return true;
  }, []);

  /** Everything that happens *after* the proof, whichever shape it arrived in. */
  const continueToPayment = useCallback(() => {
    setCode("");
    setNotice(null);
    setError(null);
    setVerified(true);
    setPhase("details");
    // Refreshes the server components so the wrapper's view matches, without
    // touching anything typed on this page.
    router.refresh();
  }, [router]);

  /**
   * Phase 2 also completes from the email's LINK, not only from the code.
   *
   * Supabase sends the six-digit code only to an address that already has an
   * account. A first-time shopper — that is, nearly every customer — gets the
   * confirm-signup link instead, so a panel that demands six digits would
   * strand every new customer at the last step. Both shapes end the same way:
   * the session cookie is written. So we watch the cookie rather than the
   * input, which means the flow completes whether the shopper types the code,
   * clicks the link in this tab, or clicks it in a different one.
   */
  useEffect(() => {
    if (phase !== "verify") return;

    let settled = false;
    const check = async () => {
      if (settled) return;
      try {
        if (await adoptSession()) {
          settled = true;
          continueToPayment();
        }
      } catch {
        // Still anonymous. The next tick tries again.
      }
    };

    // Covers the shopper who already clicked the link in another tab before we
    // ever started waiting.
    check();

    const timer = setInterval(check, 3000);
    window.addEventListener("focus", check);
    return () => {
      settled = true;
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [phase, adoptSession, continueToPayment]);

  function set<K extends keyof Fields>(key: K, value: string | boolean | null) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  /**
   * Pick the checkout back up, from wherever the emailed link was opened.
   *
   * This runs once, on arrival at /checkout?draft=… — which is exactly where
   * /auth/callback sends someone who followed the link in another browser,
   * another device, an in-app mail viewer or a private window. In all of those
   * places the basket is not in localStorage and the form is not in
   * sessionStorage, so without this the shopper lands on a page claiming they
   * have nothing to buy, seconds after proving they own the inbox.
   *
   * Three outcomes, and none of them is allowed to look like an empty cart:
   *   - restored: the basket and the form come back
   *   - partial: what came back, plus a note naming what could not be honoured
   *   - expired: a recovery panel, because the server kept it for 30 minutes
   *
   * The token is dropped from the URL afterwards so a later refresh does not
   * re-apply a half-hour-old basket over whatever the shopper has edited since.
   */
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("draft");
    if (!token) return;

    let cancelled = false;
    setRestoring(true);

    (async () => {
      try {
        const res = await fetch(`/api/checkout/draft?draft=${encodeURIComponent(token)}`, {
          cache: "no-store",
        });

        if (res.status === 401) {
          // Not signed in in THIS browser yet — the link may have been opened
          // before the cookie landed, or the shopper is still anonymous here.
          // Leave the token in the URL; continueToPayment() retries on the tick.
          setRestoring(false);
          return;
        }
        if (res.status === 410) {
          if (!cancelled) {
            setDraftExpired(true);
            setRestoring(false);
          }
          return;
        }
        if (!res.ok) {
          setRestoring(false);
          return;
        }

        const data = (await res.json()) as {
          lines?: RestoredCartLine[];
          unavailable?: { name: string; reason?: string }[];
          form?: Partial<Fields>;
        };

        if (cancelled) return;

        const lines = Array.isArray(data.lines) ? data.lines : [];
        if (lines.length) useCart.setState({ lines: lines as CartLine[] });
        setDropped(
          (data.unavailable ?? []).map((u) => ({
            name: u.name || "A PIECE",
            reason: u.reason || "No longer available.",
          })),
        );
        if (data.form) {
          setFields((f) => ({
            ...f,
            name: data.form?.name || f.name,
            phone: data.form?.phone || f.phone,
            address1: data.form?.address1 || f.address1,
            address2: data.form?.address2 ?? f.address2,
            city: data.form?.city || f.city,
            state: data.form?.state || f.state,
            pincode: data.form?.pincode || f.pincode,
          }));
        }
        setDraftToken(token);
        setDraftExpired(false);
        setRestoring(false);
        setVerified(true);

        router.replace("/checkout", { scroll: false });
      } catch {
        if (!cancelled) setRestoring(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Once, on arrival. Anything else would fight the shopper's own edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fill the form from a saved address. Manual edits clear the selection. */
  function applyAddress(a: SavedAddress) {
    setFields((f) => ({
      ...f,
      name: f.name || a.name,
      phone: f.phone || a.phone,
      address1: a.line1,
      address2: a.line2,
      city: a.city,
      state: a.state,
      pincode: a.postalCode,
      picked: a.id,
    }));
  }

  function editManually() {
    setFields((f) => ({
      ...f,
      picked: null,
      address1: "",
      address2: "",
      city: "",
      state: "",
      pincode: "",
    }));
  }

  // ── Step 1 → 2. Send the code ──────────────────────────────────────────────
  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || cooldown > 0) return;
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch("/api/checkout/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The cart and the form go to the server HERE, before the mail goes
        // out, so the link can restore them wherever it is opened. Nothing is
        // ordered and no stock is held by this.
        body: JSON.stringify({
          email: fields.email.trim(),
          cart: lines.map((l) => ({ productId: l.productId, size: l.size, quantity: l.quantity })),
          form: {
            name: fields.name,
            phone: fields.phone,
            address1: fields.address1,
            address2: fields.address2,
            city: fields.city,
            state: fields.state,
            pincode: fields.pincode,
          },
        }),
      });
      if (!res.ok) throw new Error("SEND_FAILED");

      const sent = (await res.json()) as { draftToken?: string | null };
      if (sent?.draftToken) setDraftToken(sent.draftToken);

      setPhase("verify");
      setCooldown(RESEND_SECONDS);
      setNotice(
        `Check ${fields.email.trim()} — enter the code there, or open the link in that message.`,
      );
    } catch {
      // The endpoint answers 200 even when it is throttling us, so a failure
      // here is a transport problem rather than a verdict on the address.
      setError("The code could not be sent. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  // ── Step 2 → 3. Prove the address, keep everything else ────────────────────
  const confirmCode = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const token = code.replace(/\D/g, "");
      if (token.length !== 6 || busy) return;

      setBusy(true);
      setError(null);

      try {
        const supabase = createClient();
        const { error: verifyError } = await supabase.auth.verifyOtp({
          email: fields.email.trim(),
          token,
          type: "email",
        });
        if (verifyError) throw verifyError;

        // Ask the server who it thinks we are. The browser claiming a session
        // is not evidence of one, and this call also materialises the customer
        // row that place_order() requires to exist.
        if (!(await adoptSession())) throw new Error("SESSION_NOT_READY");

        continueToPayment();
      } catch (err) {
        // The form is deliberately untouched here: a wrong code must cost the
        // shopper nothing except the code they retyped.
        const described = describeVerifyFailure(err);
        setError(described.message);
      } finally {
        setBusy(false);
      }
    },
    [adoptSession, busy, code, continueToPayment, fields.email],
  );

  // ── Step 3. Create the order, then take payment ────────────────────────────
  async function placeOrder() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const payload = {
      customer: {
        name: fields.name.trim(),
        email: fields.email.trim(),
        phone: fields.phone.trim(),
        addressLine1: fields.address1.trim(),
        addressLine2: fields.address2.trim(),
        city: fields.city.trim(),
        state: fields.state.trim(),
        postalCode: fields.pincode.trim(),
        country: "IN",
      },
      items: lines.map((l) => ({
        productId: l.productId,
        size: l.size,
        quantity: l.quantity,
      })),
      addressId: fields.picked,
      saveAddress: canSave && fields.keepAddress,
      reservationMinutes: 30,
    };

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "CHECKOUT_FAILED");

      setOrderNumber(data.orderNumber);
      setUnpaidOrderId(data.orderId ?? null);

      // The cart is NOT emptied here, and that used to be the single most
      // expensive line in this file. An order exists at this point but no
      // money has moved, and clearing the basket meant that anyone who closed
      // the payment sheet — or simply refreshed — came back to a page that
      // said they had nothing to buy, on an order they had already created and
      // could not find. The basket is theirs until the money is.
      setPhase("paying");

      // Gateway dormant: the order exists and holds its stock, and the customer
      // is told exactly that rather than being shown a payment sheet that
      // cannot work.
      if (data.gateway !== "razorpay" || !data.gatewayOrderId || !data.keyId) {
        setPhase("done");
        setMessage(
          data.gatewayError === "GATEWAY_UNAVAILABLE"
            ? `ORDER ${data.orderNumber} IS HELD. THE PAYMENT SERVICE IS UNREACHABLE — YOUR PIECE IS RESERVED, PLEASE RETRY PAYMENT.`
            : `ORDER ${data.orderNumber} REGISTERED. YOUR PRE-ORDER IS CONFIRMED. PAYMENT GATEWAY ACTIVATION PENDING.`,
        );
        return;
      }

      const result = await openRazorpayCheckout({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        orderId: data.gatewayOrderId,
        orderNumber: data.orderNumber,
        customerName: fields.name,
        customerEmail: fields.email,
        customerPhone: fields.phone,
      });

      if (!result) {
        // Dismissed, not declined. The order still exists, still holds its
        // stock, and the basket is still full — so this is a pause, not a
        // failure, and the retry below reopens the SAME order rather than
        // making a second one.
        setPhase("error");
        setMessage(
          `PAYMENT NOT COMPLETED. ORDER ${data.orderNumber} STILL HOLDS YOUR PIECE — RETRY PAYMENT, OR CLOSE THIS PAGE AND PAY FROM YOUR ACCOUNT.`,
        );
        return;
      }

      // The browser's callback is NOT proof. This asks the server to verify the
      // signature; the webhook is still the authority.
      await fetch("/api/checkout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: data.orderNumber,
          razorpayOrderId: result.razorpay_order_id,
          razorpayPaymentId: result.razorpay_payment_id,
          razorpaySignature: result.razorpay_signature,
        }),
      }).catch(() => undefined);

      // Paid. Only now is it safe to let go of the basket and the form draft —
      // until this point they are the only record that the order on the
      // server corresponds to anything.
      clearDraft();
      clear();

      router.push(`/checkout/success?order=${encodeURIComponent(data.orderNumber)}`);
    } catch (err) {
      setPhase("error");
      const raw = err instanceof Error ? err.message : "";
      setMessage(
        /STOCK_DEPLETED/.test(raw)
          ? "THAT SIZE IS GONE. NOTHING WAS CHARGED — RETURN TO THE ARCHIVE."
          : "THE ARCHIVE REJECTED THE REQUEST. NOTHING WAS CHARGED.",
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * Reopen payment for the order that already exists.
   *
   * Deliberately NOT placeOrder() again. Calling it would POST /api/checkout a
   * second time, which creates a second order and takes a second hold on the
   * same stock — one abandoned PENDING order per retry, all of them holding
   * inventory until the sweep releases it.
   *
   * /api/checkout/gateway already exists for exactly this and is careful about
   * it: it returns the order's own gateway_order_id rather than creating a
   * second Razorpay order (two of them is how a shopper pays twice), and it
   * refuses once the hold has lapsed, because paying for an expired hold would
   * take stock another shopper has since been given.
   */
  async function retryPayment() {
    if (busy || !unpaidOrderId) return;
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/checkout/gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: unpaidOrderId }),
      });
      const data = await res.json();

      if (!res.ok) {
        // An expired hold is the one case where the cart genuinely has to go
        // back in play: this order can no longer be paid, so the shopper needs
        // a fresh one, and the basket is exactly the state that makes that a
        // single click rather than a re-entered address.
        setMessage(
          data?.error === "RESERVATION_EXPIRED"
            ? `THE HOLD ON ORDER ${orderNumber} HAS LAPSED AND THE PIECE IS RELEASED. NOTHING WAS CHARGED — YOUR CART IS STILL INTACT, SO PLACE THE ORDER AGAIN.`
            : `PAYMENT COULD NOT BE REOPENED. NOTHING WAS CHARGED — YOUR CART IS STILL INTACT.`,
        );
        return;
      }

      const result = await openRazorpayCheckout({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        orderId: data.gatewayOrderId,
        orderNumber,
        customerName: fields.name,
        customerEmail: fields.email,
        customerPhone: fields.phone,
      });

      if (!result) {
        setMessage(
          `PAYMENT NOT COMPLETED. ORDER ${orderNumber} STILL HOLDS YOUR PIECE — RETRY PAYMENT, OR CLOSE THIS PAGE AND PAY FROM YOUR ACCOUNT.`,
        );
        return;
      }

      await fetch("/api/checkout/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber,
          razorpayOrderId: result.razorpay_order_id,
          razorpayPaymentId: result.razorpay_payment_id,
          razorpaySignature: result.razorpay_signature,
        }),
      }).catch(() => undefined);

      clearDraft();
      clear();
      router.push(`/checkout/success?order=${encodeURIComponent(orderNumber)}`);
    } catch {
      setMessage("PAYMENT COULD NOT BE REOPENED. NOTHING WAS CHARGED — YOUR CART IS STILL INTACT.");
    } finally {
      setBusy(false);
    }
  }

  // ── Terminal: order placed, no gateway ─────────────────────────────────────
  if (phase === "done") {
    return (
      <div className="mx-auto min-h-[70vh] max-w-[720px] px-5 pb-32 pt-36 text-center md:px-10">
        <RegistrationMark className="mx-auto h-5 w-5" />
        <h1 className="mt-8 font-serif-d text-4xl font-light text-bone md:text-5xl">
          OBJECT ACQUIRED.
        </h1>
        <p className="mx-auto mt-6 max-w-md font-mono text-[11px] leading-relaxed text-bone/65">
          {message}
        </p>
        <div className="mt-12 flex flex-wrap items-center justify-center gap-4">
          <Link
            href={`/account/orders?highlight=${encodeURIComponent(orderNumber)}`}
            className="inline-block border border-bone/41 px-8 py-3 font-mono text-[10px] tracking-archive text-bone hover:border-crimson hover:text-crimson"
          >
            VIEW ORDER
          </Link>
          <Link
            href="/archive"
            className="inline-block px-8 py-3 font-mono text-[10px] tracking-archive text-bone/41 hover:text-bone"
          >
            RETURN TO THE ARCHIVE
          </Link>
        </div>
      </div>
    );
  }

  if (!cartKnown || restoring) {
    // Deliberately says nothing about the cart. Anything else here is a lie
    // the server told before localStorage was read, or before it has asked the
    // server what it held for this shopper.
    return (
      <div className="mx-auto min-h-[60vh] max-w-[720px] px-5 pt-36 text-center">
        <ArchiveLabel tone="faint">READING THE REGISTER.</ArchiveLabel>
      </div>
    );
  }

  // The link was followed, but the basket the server kept for it is gone. This
  // is NOT the same as having never had a cart, and it must never read that
  // way: the shopper proved they were buying something.
  if (draftExpired) {
    return (
      <div className="mx-auto min-h-[60vh] max-w-[720px] px-5 pt-36 text-center">
        <ArchiveLabel tone="crimson">THE HELD BASKET HAS EXPIRED.</ArchiveLabel>
        <p className="mx-auto mt-6 max-w-md font-mono text-[10px] leading-relaxed tracking-widest text-bone/73">
          YOUR ADDRESS IS CONFIRMED. WE KEPT THE CART FOR 30 MINUTES WHILE YOU VERIFIED
          IT, AND THAT HOLD HAS NOW LAPSED. NOTHING WAS CHARGED — REBUILD THE CART AND
          CHECKOUT WILL NOT ASK FOR A CODE AGAIN.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/shop"
            className="inline-block border border-bone/41 px-8 py-3 font-mono text-[10px] tracking-archive text-bone hover:border-crimson hover:text-crimson"
          >
            REBUILD THE CART
          </Link>
          <Link
            href="/account/orders"
            className="inline-block px-8 py-3 font-mono text-[10px] tracking-archive text-bone/41 hover:text-bone"
          >
            YOUR ORDERS
          </Link>
        </div>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="mx-auto min-h-[60vh] max-w-[720px] px-5 pt-36 text-center">
        <ArchiveLabel tone="faint">NOTHING TO ACQUIRE.</ArchiveLabel>

        {/* The most common way to arrive here is a shopper who followed the
            emailed confirmation link and opened it somewhere the cart does not
            follow — another device, another browser, a private window. The
            address is proven; the basket simply is not with us. Saying so beats
            a dead end, and it is also true that the next visit will not ask them
            to verify again. */}
        {signedInInitially && (
          <p className="mx-auto mt-6 max-w-md font-mono text-[10px] leading-relaxed tracking-widest text-bone/73">
            YOUR ADDRESS IS CONFIRMED — YOUR CART IS NOT WITH US. RE-ADD AN OBJECT AND
            CHECKOUT WILL NOT ASK FOR A CODE AGAIN.
          </p>
        )}

        <Link href="/shop" className="mt-8 inline-block border border-bone/41 px-8 py-3 font-mono text-[10px] tracking-archive text-bone hover:border-crimson hover:text-crimson">
          EXAMINE OBJECTS
        </Link>
      </div>
    );
  }

  const inputCls =
    "w-full border border-bone/26 bg-transparent px-3 py-2.5 font-mono text-xs text-bone placeholder:text-bone/41 focus:border-crimson/60 focus:outline-none";

  const showOtp = phase === "verify";
  const isVerified = verified;

  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-32 pt-28 md:px-10 md:pt-36">
      <div className="flex items-center justify-between">
        <ArchiveLabel tone="crimson">FINAL REGISTER</ArchiveLabel>
        <RegistrationMark />
      </div>
      <h1 className="mt-6 font-serif-d text-5xl font-light tracking-wide text-bone md:text-6xl">
        CHECKOUT
      </h1>

      {/* Progress — three steps, none of which navigates away. */}
      <ol className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 font-mono text-[9px] tracking-archive">
        {[
          { n: "01", label: "CHECKOUT", done: true },
          { n: "02", label: "VERIFY EMAIL", done: showOtp || isVerified },
          { n: "03", label: "PAYMENT", done: false },
        ].map((s, i) => (
          <li key={s.n} className="flex items-center gap-6">
            {i > 0 && <span className="text-bone/26">—</span>}
            <span className={s.done ? "text-bone" : "text-bone/41"}>
              {s.n} {s.label}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-14 grid grid-cols-1 gap-14 md:grid-cols-12">
        <div className="space-y-3 md:col-span-7">
          {/* ── STEP 2 renders ABOVE the fields, which stay mounted and
              populated underneath. This is the whole point of the flow. ── */}
          {showOtp && (
            <div className="mb-6 border border-crimson/60">
              <div className="border-b border-bone/12 px-4 py-3">
                <ArchiveLabel tone="crimson">02 / VERIFY YOUR EMAIL</ArchiveLabel>
              </div>
              <div className="p-4">
                <p className="font-mono text-[11px] leading-relaxed text-bone/73">
                  We&apos;ve sent a six-digit code to{" "}
                  <span className="text-bone">{fields.email.trim()}</span>. If your inbox
                  gives you a link instead, open it.
                </p>

                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmCode(e);
                  }}
                  placeholder="000000"
                  aria-label="Six-digit verification code"
                  className="mt-4 w-full border border-bone/26 bg-transparent px-3 py-4 text-center font-mono text-xl tracking-[0.5em] text-bone focus:border-crimson/60 focus:outline-none"
                />

                {error && (
                  <p className="mt-3 border border-crimson/60 bg-crimson/10 px-3 py-2 font-mono text-[10px] leading-relaxed text-crimson">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="mt-3 border border-bone/26 px-3 py-2 font-mono text-[10px] leading-relaxed text-bone/73">
                    {notice}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => confirmCode()}
                    disabled={busy || code.length !== 6}
                    data-cursor="VERIFY"
                    className="border border-crimson bg-crimson px-5 py-2.5 font-mono text-[10px] tracking-archive text-bone transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {busy ? "VERIFYING…" : "VERIFY & CONTINUE →"}
                  </button>
                  <button
                    type="button"
                    onClick={() => sendCode()}
                    disabled={busy || cooldown > 0}
                    data-cursor="RESEND"
                    className="font-mono text-[10px] tracking-widest text-bone/41 transition-colors hover:text-bone disabled:opacity-50"
                  >
                    {cooldown > 0 ? `RESEND IN ${cooldown}s` : "SEND A NEW CODE"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPhase("details");
                      setCode("");
                      setError(null);
                    }}
                    className="font-mono text-[10px] tracking-widest text-bone/41 hover:text-bone"
                  >
                    ← USE A DIFFERENT ADDRESS
                  </button>
                </div>
              </div>
            </div>
          )}

          {isVerified && (
            <div className="mb-6 border border-bone/26 bg-bone/[0.03] px-4 py-3">
              <ArchiveLabel>EMAIL VERIFIED ✓ — CONTINUE TO PAYMENT BELOW</ArchiveLabel>
            </div>
          )}

          {/* The basket was restored from the server and part of it could not
              be honoured. Naming those pieces is the honest move — presenting a
              quietly smaller order would look like we changed their mind. */}
          {dropped.length > 0 && (
            <div className="mb-6 border border-crimson/60 bg-crimson/5 px-4 py-3">
              <ArchiveLabel tone="crimson">SOME PIECES CHANGED WHILE YOU WERE AWAY</ArchiveLabel>
              <ul className="mt-2 space-y-1 font-mono text-[10px] leading-relaxed tracking-widest text-bone/73">
                {dropped.map((d) => (
                  <li key={d.name}>
                    {d.name} — {d.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ArchiveLabel tone="faint">RECIPIENT</ArchiveLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="name"
              required
              value={fields.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="FULL NAME"
              className={inputCls}
            />
            <input
              name="phone"
              required
              value={fields.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="PHONE"
              className={inputCls}
            />
          </div>
          <input
            name="email"
            type="email"
            required
            value={fields.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="EMAIL"
            className={inputCls}
          />
          <p className="font-mono text-[9px] leading-relaxed tracking-widest text-bone/41">
            WE WILL EMAIL YOU TO CONFIRM THE ORDER BEFORE ANYTHING IS CREATED. NOTHING IS
            CHARGED UNTIL YOU COMPLETE PAYMENT.
          </p>

          <div className="pt-4">
            <ArchiveLabel tone="faint">SHIPPING ADDRESS</ArchiveLabel>
          </div>

          {/* a signed-in customer reuses a saved destination instead of retyping */}
          {addresses.length > 0 && (
            <div className="mb-4 border border-bone/26">
              <p className="border-b border-bone/12 px-4 py-3 font-mono text-[10px] tracking-archive text-bone/73">
                USE A SAVED ADDRESS
              </p>
              <div className="p-2">
                {addresses.map((a) => (
                  <label
                    key={a.id}
                    data-cursor="SELECT"
                    className={`flex cursor-pointer items-start gap-3 border px-3 py-2.5 transition-colors ${
                      fields.picked === a.id
                        ? "border-crimson/60"
                        : "border-transparent hover:border-bone/26"
                    }`}
                  >
                    <input
                      type="radio"
                      name="saved-address"
                      checked={fields.picked === a.id}
                      onChange={() => applyAddress(a)}
                      className="mt-0.5 accent-[#7F1518]"
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] tracking-widest text-crimson">
                          {ADDRESS_LABEL_TEXT[a.label as keyof typeof ADDRESS_LABEL_TEXT] ??
                            a.label}
                        </span>
                        {a.isDefault && (
                          <span className="font-mono text-[9px] tracking-widest text-bone/41">
                            DEFAULT
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block font-mono text-[10px] leading-relaxed text-bone/69">
                        {formatAddress(a)}
                      </span>
                    </span>
                  </label>
                ))}
                <button
                  type="button"
                  onClick={editManually}
                  data-cursor="ENTER"
                  className="w-full px-3 py-2 text-left font-mono text-[10px] tracking-widest text-bone/41 transition-colors hover:text-bone/73"
                >
                  {fields.picked ? "USE A DIFFERENT ADDRESS" : "ENTER A NEW ADDRESS"}
                </button>
              </div>
            </div>
          )}

          <input
            name="address1"
            required
            value={fields.address1}
            onChange={(e) => set("address1", e.target.value)}
            placeholder="ADDRESS LINE 1"
            className={inputCls}
          />
          <input
            name="address2"
            value={fields.address2}
            onChange={(e) => set("address2", e.target.value)}
            placeholder="ADDRESS LINE 2 (OPTIONAL)"
            className={inputCls}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <input
              name="city"
              required
              value={fields.city}
              onChange={(e) => set("city", e.target.value)}
              placeholder="CITY"
              className={inputCls}
            />
            <input
              name="state"
              required
              value={fields.state}
              onChange={(e) => set("state", e.target.value)}
              placeholder="STATE"
              className={inputCls}
            />
            <input
              name="pincode"
              required
              value={fields.pincode}
              onChange={(e) => set("pincode", e.target.value)}
              placeholder="PINCODE"
              className={inputCls}
            />
          </div>

          {canSave && (
            <label
              data-cursor="SAVE"
              className="mt-2 flex cursor-pointer items-start gap-3 font-mono text-[10px] tracking-widest text-bone/61"
            >
              <input
                type="checkbox"
                checked={fields.keepAddress}
                onChange={(e) => set("keepAddress", e.target.checked)}
                className="mt-0.5 accent-[#7F1518]"
              />
              SAVE THIS ADDRESS TO MY ACCOUNT
            </label>
          )}
        </div>

        <aside className="md:col-span-5">
          <div className="border border-bone/26 p-6">
            <ArchiveLabel tone="faint">MANIFEST</ArchiveLabel>
            <div className="mt-4 space-y-3">
              {lines.map((l) => (
                <div key={`${l.productId}-${l.size}`} className="flex items-baseline justify-between gap-4 font-mono text-[10px] tracking-widest">
                  <span className="text-bone/73">
                    {l.collectionName} / {l.archiveNumber} — {l.name} ({l.size}) × {l.quantity}
                    {l.dropStatus === "PRE_ORDER" && (
                      <span className="ml-2 text-crimson">· PRE-ORDER</span>
                    )}
                  </span>
                  <span className="shrink-0 text-bone/167">{formatINR(l.price * l.quantity)}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex justify-between border-t border-bone/26 pt-4 font-mono text-xs text-bone">
              <span className="tracking-archive">TOTAL</span>
              <span>{formatINR(subtotal)}</span>
            </div>
            <p className="mt-4 font-mono text-[9px] leading-relaxed tracking-widest text-bone/41">
              TOTALS ARE RECALCULATED SERVER-SIDE. YOUR PIECE IS HELD FOR 30 MINUTES ONCE THE
              ORDER IS ENTERED, WHETHER OR NOT PAYMENT COMPLETES.
            </p>

            {acknowledgement.hasPreOrder && (
              <div className="mt-6 border border-crimson/40 p-4">
                <ArchiveLabel tone="crimson">PRE-ORDER ACKNOWLEDGEMENT</ArchiveLabel>
                <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-wide text-bone/73">
                  THIS ITEM IS PART OF A PRE-ORDER RELEASE AND WILL NOT SHIP IMMEDIATELY
                  AFTER PURCHASE.
                </p>
                {acknowledgement.dispatchPeriod && (
                  <p className="mt-2 font-mono text-[10px] tracking-wide text-bone/167">
                    ESTIMATED DISPATCH: {acknowledgement.dispatchPeriod}
                  </p>
                )}
                <p className="mt-3 font-mono text-[9px] tracking-widest text-bone/126">
                  PRE-ORDER TERMS &amp; REMEDIES —{" "}
                  <a href="/policies" target="_blank" className="text-bone/161 underline underline-offset-4 hover:text-crimson">
                    READ
                  </a>
                </p>
                <p className="mt-2 font-mono text-[10px] leading-relaxed tracking-wide text-bone/73">
                  BY CONTINUING, YOU ACKNOWLEDGE THE PRE-ORDER PRODUCTION TIMELINE.
                </p>
                <label
                  data-cursor="ACKNOWLEDGE"
                  className="mt-4 flex cursor-pointer items-start gap-3 font-mono text-[10px] tracking-widest text-bone/161"
                >
                  <input
                    type="checkbox"
                    checked={fields.acknowledged}
                    onChange={(e) => set("acknowledged", e.target.checked)}
                    className="mt-0.5 accent-[#7F1518]"
                    required={!showOtp}
                  />
                  I UNDERSTAND AND ACCEPT
                </label>
              </div>
            )}

            {error && !showOtp && (
              <p className="mt-4 border border-crimson/60 bg-crimson/10 px-3 py-2 font-mono text-[10px] leading-relaxed tracking-widest text-crimson">
                {error}
              </p>
            )}
            {phase === "error" && message && (
              <p className="mt-4 border border-crimson/60 bg-crimson/10 px-3 py-2 font-mono text-[10px] leading-relaxed tracking-widest text-crimson">
                {message}
              </p>
            )}

            {/* The retry reopens the order already made. Restarting checkout
                instead would create a second one and hold the stock twice. */}
            {phase === "error" && unpaidOrderId && (
              <button
                type="button"
                onClick={retryPayment}
                disabled={busy}
                data-cursor="RETRY"
                className="mt-4 w-full border border-crimson bg-crimson py-4 font-mono text-[11px] tracking-archive text-bone transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? "REOPENING…" : `RETRY PAYMENT — ORDER ${orderNumber}`}
              </button>
            )}

            {/* One button, two destinations: verify the address, then pay. */}
            {!isVerified ? (
              <button
                type="button"
                onClick={() => sendCode()}
                disabled={busy || !fields.email}
                data-cursor="CONTINUE"
                className="mt-6 w-full border border-bone/46 py-4 font-mono text-[11px] tracking-archive text-bone transition-colors hover:border-crimson hover:text-crimson disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "SENDING…" : "CONTINUE TO PAYMENT →"}
              </button>
            ) : (
              <button
                type="button"
                onClick={placeOrder}
                disabled={busy || (acknowledgement.hasPreOrder && !fields.acknowledged)}
                data-cursor="PAY"
                className="mt-6 w-full border border-crimson bg-crimson py-4 font-mono text-[11px] tracking-archive text-bone transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {busy ? "PROCESSING…" : "PAY & PLACE ORDER →"}
              </button>
            )}

            {!isVerified && (
              <p className="mt-3 text-center font-mono text-[9px] leading-relaxed tracking-widest text-bone/41">
                STEP 1 OF 2 — CONFIRM YOUR EMAIL FIRST. YOUR ORDER IS NOT CREATED UNTIL YOU
                VERIFY.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}