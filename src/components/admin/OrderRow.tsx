"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chip, StatusChip } from "@/components/admin/AdminTable";
import { ORDER_STATUSES, ORDER_STATUS_LABEL } from "@/lib/drop";

type Item = {
  id: string;
  name: string;
  size: string;
  quantity: number;
  price: number;
  dropStatus: string;
  editionLabel: string;
  trackingNote: string;
};

type Order = {
  id: string;
  number: string;
  customerName: string;
  email: string;
  phone: string;
  address: string;
  total: number;
  paymentStatus: string;
  status: string;
  razorpayPaymentId: string;
  trackingNumber: string;
  trackingUrl: string;
  createdAt: string;
  items: Item[];
};

export function OrderRow({ order, first }: { order: Order; first: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState(order.trackingNumber);
  const [trackingUrl, setTrackingUrl] = useState(order.trackingUrl);

  const hasPreOrder = order.items.some((i) => i.dropStatus === "PRE_ORDER");

  async function saveTracking() {
    setBusy(true);
    await fetch(`/api/admin/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trackingNumber: tracking,
        trackingUrl: trackingUrl,
        // Recording tracking usually coincides with handing over to the carrier.
        ...(order.status === "PACKED" && tracking ? { status: "SHIPPED" } : {}),
      }),
    });
    setBusy(false);
    router.refresh();
  }

  async function setStatus(status: string) {
    setBusy(true);
    await fetch(`/api/admin/orders/${order.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <li className={first ? "" : "border-t border-line"}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-left transition-colors hover:bg-graphite/40"
      >
        <span className="w-32 font-mono text-[11px] text-bone">{order.number}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-faint">
          {order.customerName} · {order.items.length} item{order.items.length === 1 ? "" : "s"}
          {hasPreOrder && <span className="ml-2 text-crimson">· PRE-ORDER</span>}
        </span>
        <span className="font-mono text-[11px] text-bone">
          ₹{(order.total / 100).toLocaleString("en-IN")}
        </span>
        <StatusChip status={order.status} />
        <span className="w-4 text-center font-mono text-[10px] text-faint">
          {open ? "−" : "+"}
        </span>
      </button>

      {open && (
        <div className="border-t border-line/60 bg-abyss/60 px-4 py-5">
          <div className="grid gap-6 md:grid-cols-2">
            {/* customer + items */}
            <div>
              <p className="font-mono text-[9px] tracking-[0.3em] text-faint">RECIPIENT</p>
              <div className="mt-2 space-y-0.5 font-mono text-[11px] text-bone/161">
                <p>{order.customerName}</p>
                <p className="text-faint">{order.email}</p>
                <p className="text-faint">{order.phone}</p>
                <p className="mt-2 leading-relaxed text-faint">{order.address}</p>
              </div>

              <p className="mt-5 font-mono text-[9px] tracking-[0.3em] text-faint">MANIFEST</p>
              <ul className="mt-2 space-y-1.5">
                {order.items.map((it) => (
                  <li key={it.id} className="font-mono text-[11px] text-bone/161">
                    {it.name} / {it.size} × {it.quantity}
                    <span className="ml-2 text-faint">
                      ₹{(it.price / 100).toLocaleString("en-IN")}
                    </span>
                    {it.dropStatus && (
                      <span className="ml-2">
                        <Chip tone={it.dropStatus === "PRE_ORDER" ? "warn" : "off"}>
                          {it.editionLabel || it.dropStatus.replace(/_/g, " ")}
                        </Chip>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {/* status workflow */}
            <div>
              <p className="font-mono text-[9px] tracking-[0.3em] text-faint">PAYMENT</p>
              <div className="mt-2 flex items-center gap-3">
                <StatusChip status={order.paymentStatus} />
                {order.razorpayPaymentId && (
                  <span className="truncate font-mono text-[9px] text-faint/70">
                    {order.razorpayPaymentId}
                  </span>
                )}
                <span className="ml-auto font-mono text-[9px] text-faint">
                  {new Date(order.createdAt).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "2-digit",
                  })}
                </span>
              </div>

              <p className="mt-5 font-mono text-[9px] tracking-[0.3em] text-faint">
                ORDER STATUS
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {ORDER_STATUSES.map((s) => (
                  <button
                    key={s}
                    disabled={busy || order.status === s}
                    onClick={() => setStatus(s)}
                    className={`border px-2.5 py-1.5 font-mono text-[9px] tracking-[0.15em] transition-colors disabled:cursor-default ${
                      order.status === s
                        ? "border-crimson text-crimson"
                        : "border-line text-faint hover:border-bone/126 hover:text-bone disabled:hover:border-line disabled:hover:text-faint"
                    }`}
                  >
                    {ORDER_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>

              <p className="mt-5 font-mono text-[9px] tracking-[0.3em] text-faint">TRACKING</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  className="w-full border border-line bg-void px-2.5 py-1.5 font-mono text-[11px] text-bone outline-none placeholder:text-faint/40 focus:border-crimson/60"
                  placeholder="TRACKING NUMBER"
                  value={tracking}
                  onChange={(e) => setTracking(e.target.value)}
                />
                <input
                  className="w-full border border-line bg-void px-2.5 py-1.5 font-mono text-[11px] text-bone outline-none placeholder:text-faint/40 focus:border-crimson/60"
                  placeholder="CARRIER URL"
                  value={trackingUrl}
                  onChange={(e) => setTrackingUrl(e.target.value)}
                />
              </div>
              <button
                onClick={saveTracking}
                disabled={busy}
                className="mt-2 border border-line px-3 py-1.5 font-mono text-[9px] tracking-[0.2em] text-faint hover:border-bone/126 hover:text-bone disabled:opacity-40"
              >
                SAVE TRACKING
              </button>

              <p className="mt-5 font-mono text-[9px] leading-relaxed text-faint/60">
                {order.status === "PENDING" &&
                  "Awaiting payment activation. The object is reserved at checkout."}
                {order.status === "PAID" && "Payment confirmed. Ready for production."}
                {order.status === "IN_PRODUCTION" && "Being produced as part of the edition."}
                {order.status === "QUALITY_CHECK" && "Under inspection before packaging."}
                {order.status === "PACKED" && "Individually packed. Awaiting dispatch."}
                {order.status === "SHIPPED" && "With the carrier. Tracking sent to the customer."}
                {order.status === "DELIVERED" && "Acquisition complete."}
                {order.status === "CANCELLED" && "Order cancelled."}
              </p>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
