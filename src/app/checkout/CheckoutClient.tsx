"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart, cartSubtotal } from "@/lib/cart/store";
import { formatINR } from "@/lib/format";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { RegistrationMark } from "@/components/ui/marks";
import {
  ADDRESS_LABEL_TEXT,
  formatAddress,
  type SavedAddress,
} from "@/lib/addresses";

/**
 * Pre-order acknowledgement values are passed from the server page wrapper;
 * this client component receives them as props.
 */
export type Acknowledgement = {
  hasPreOrder: boolean;
  editionLabel: string;
  dispatchPeriod: string;
};

type Phase = "form" | "submitting" | "done" | "error";

type Fields = {
  name: string;
  phone: string;
  email: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  pincode: string;
};

const EMPTY: Fields = {
  name: "",
  phone: "",
  email: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  pincode: "",
};

export function CheckoutClient({
  acknowledgement,
  addresses,
  canSave,
  customerEmail,
}: {
  acknowledgement: Acknowledgement;
  addresses: SavedAddress[];
  canSave: boolean;
  /** The signed-in account. Checkout is not available without one. */
  customerEmail: string;
}) {
  const { lines, clear } = useCart();
  const subtotal = cartSubtotal(lines);
  const [phase, setPhase] = useState<Phase>("form");
  const [message, setMessage] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  // The address fields are controlled so choosing a saved address can fill
  // them in; the picker and the form can never disagree about what ships.
  const [fields, setFields] = useState<Fields>({ ...EMPTY, email: customerEmail });
  const [picked, setPicked] = useState<string | null>(null);
  const [keepAddress, setKeepAddress] = useState(false);

  function set<K extends keyof Fields>(key: K, value: string) {
    setFields((f) => ({ ...f, [key]: value }));
  }

  /** Fill the form from a saved address. Manual edits clear the selection. */
  function applyAddress(a: SavedAddress) {
    setPicked(a.id);
    setFields((f) => ({
      ...f,
      // Only fill a recipient the customer has not already typed.
      name: f.name || a.name,
      phone: f.phone || a.phone,
      address1: a.line1,
      address2: a.line2,
      city: a.city,
      state: a.state,
      pincode: a.postalCode,
    }));
  }

  function editManually() {
    setPicked(null);
    setFields((f) => ({ ...f, address1: "", address2: "", city: "", state: "", pincode: "" }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!lines.length) return;
    setPhase("submitting");
    setMessage("");

    const payload = {
      customer: {
        name: fields.name,
        email: fields.email,
        phone: fields.phone,
        addressLine1: fields.address1,
        addressLine2: fields.address2,
        city: fields.city,
        state: fields.state,
        postalCode: fields.pincode,
        country: "IN",
      },
      items: lines.map((l) => ({
        productId: l.productId,
        size: l.size,
        quantity: l.quantity,
      })),
      // The server re-checks ownership of this id; an id that is not the
      // customer's is ignored rather than trusted.
      addressId: picked,
      saveAddress: canSave && keepAddress,
    };

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "CHECKOUT_FAILED");

      if (data.gateway === "razorpay" && data.gatewayOrderId) {
        // Future: open Razorpay Checkout here with data.keyId + data.gatewayOrderId.
        setMessage(
          `ORDER ${data.orderNumber} REGISTERED. YOUR PRE-ORDER IS CONFIRMED. PAYMENT GATEWAY ACTIVATION PENDING.`,
        );
      } else {
        setMessage(
          `ORDER ${data.orderNumber} ENTERED INTO THE REGISTER. YOUR PRE-ORDER IS CONFIRMED. PAYMENT ACTIVATION PENDING.`,
        );
      }
      clear();
      setPhase("done");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "THE ARCHIVE REJECTED THE REQUEST.");
      setPhase("error");
    }
  }

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
        <Link
          href="/archive"
          className="mt-12 inline-block border border-bone/41 px-8 py-3 font-mono text-[10px] tracking-archive text-bone hover:border-crimson hover:text-crimson"
        >
          RETURN TO THE ARCHIVE
        </Link>
      </div>
    );
  }

  if (!lines.length) {
    return (
      <div className="mx-auto min-h-[60vh] max-w-[720px] px-5 pt-36 text-center">
        <ArchiveLabel tone="faint">NOTHING TO ACQUIRE.</ArchiveLabel>
        <Link href="/shop" className="mt-8 inline-block border border-bone/41 px-8 py-3 font-mono text-[10px] tracking-archive text-bone hover:border-crimson hover:text-crimson">
          EXAMINE OBJECTS
        </Link>
      </div>
    );
  }

  const inputCls =
    "w-full border border-bone/26 bg-transparent px-3 py-2.5 font-mono text-xs text-bone placeholder:text-bone/41 focus:border-crimson/60 focus:outline-none";

  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-32 pt-28 md:px-10 md:pt-36">
      <ArchiveLabel tone="crimson">FINAL REGISTER</ArchiveLabel>
      <h1 className="mt-6 font-serif-d text-5xl font-light tracking-wide text-bone md:text-6xl">
        CHECKOUT
      </h1>

      <form onSubmit={onSubmit} className="mt-14 grid grid-cols-1 gap-14 md:grid-cols-12">
        <div className="space-y-3 md:col-span-7">
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
                      picked === a.id
                        ? "border-crimson/60"
                        : "border-transparent hover:border-bone/26"
                    }`}
                  >
                    <input
                      type="radio"
                      name="saved-address"
                      checked={picked === a.id}
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
                  {picked ? "USE A DIFFERENT ADDRESS" : "ENTER A NEW ADDRESS"}
                </button>
              </div>
            </div>
          )}

          <input
            name="address1"
            required
            value={fields.address1}
            onChange={(e) => {
              set("address1", e.target.value);
              setPicked(null);
            }}
            placeholder="ADDRESS LINE 1"
            className={inputCls}
          />
          <input
            name="address2"
            value={fields.address2}
            onChange={(e) => {
              set("address2", e.target.value);
              setPicked(null);
            }}
            placeholder="ADDRESS LINE 2 (OPTIONAL)"
            className={inputCls}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <input
              name="city"
              required
              value={fields.city}
              onChange={(e) => {
                set("city", e.target.value);
                setPicked(null);
              }}
              placeholder="CITY"
              className={inputCls}
            />
            <input
              name="state"
              required
              value={fields.state}
              onChange={(e) => {
                set("state", e.target.value);
                setPicked(null);
              }}
              placeholder="STATE"
              className={inputCls}
            />
            <input
              name="pincode"
              required
              value={fields.pincode}
              onChange={(e) => {
                set("pincode", e.target.value);
                setPicked(null);
              }}
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
                checked={keepAddress}
                onChange={(e) => setKeepAddress(e.target.checked)}
                className="mt-0.5 accent-[#7F1518]"
              />
              SAVE THIS ADDRESS TO MY REGISTER
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
              RAZORPAY PAYMENT WILL ACTIVATE HERE. ORDER IS RECORDED SERVER-SIDE; SECRETS REMAIN SERVER-SIDE.
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
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="mt-0.5 accent-[#7F1518]"
                    required
                  />
                  I UNDERSTAND AND ACCEPT
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={phase === "submitting" || (acknowledgement.hasPreOrder && !acknowledged)}
              data-cursor="CONTINUE"
              className="mt-6 w-full border border-bone/46 py-4 font-mono text-[11px] tracking-archive text-bone transition-colors hover:border-crimson hover:text-crimson disabled:cursor-not-allowed disabled:opacity-40"
            >
              {phase === "submitting" ? "REGISTERING…" : "CONTINUE TO PAYMENT"}
            </button>

            {acknowledgement.hasPreOrder && !acknowledged && phase !== "submitting" && (
              <p className="mt-3 text-center font-mono text-[9px] tracking-widest text-bone/46">
                ACKNOWLEDGE THE PRE-ORDER TIMELINE TO CONTINUE
              </p>
            )}

            {phase === "error" && (
              <p className="mt-4 text-center font-mono text-[10px] tracking-widest text-crimson">
                {message}
              </p>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
}