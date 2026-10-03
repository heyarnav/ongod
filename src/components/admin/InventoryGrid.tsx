"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Row = {
  id: string;
  name: string;
  archiveNumber: string;
  collectionName: string;
  variants: Array<{ id: string; size: string; stock: number }>;
};

export function InventoryGrid({ products }: { products: Row[] }) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<string | null>(null);

  async function setStock(variantId: string, stock: number) {
    setSavingId(variantId);
    // Derive the productId from the row via lookup on save — the API accepts a
    // full setVariants payload, so we read the current row state from the DOM
    // dataset attached below.
    await fetch(`/api/admin/inventory/${variantId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stock }),
    });
    setSavingId(null);
    router.refresh();
  }

  if (products.length === 0) {
    return <p className="mt-8 border border-line p-6 font-mono text-[11px] text-faint">No active objects.</p>;
  }

  return (
    <ul className="mt-8 border border-line">
      {products.map((p, i) => (
        <li key={p.id} className={`p-4 ${i > 0 ? "border-t border-line" : ""}`}>
          <div className="flex flex-wrap items-baseline gap-x-4">
            <p className="font-mono text-[11px] tracking-[0.15em] text-bone">
              {p.collectionName} / {p.archiveNumber} — {p.name}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {p.variants.map((v) => (
              <div key={v.id} className="flex items-center border border-line/70">
                <span className="border-r border-line/70 px-2 py-1.5 font-mono text-[10px] text-faint">
                  {v.size}
                </span>
                <button
                  onClick={() => setStock(v.id, Math.max(0, v.stock - 1))}
                  className="px-2 py-1.5 font-mono text-[11px] text-faint hover:text-crimson"
                  aria-label={`decrease ${v.size}`}
                >
                  −
                </button>
                <span
                  className={`min-w-8 text-center font-mono text-[11px] ${
                    v.stock === 0 ? "text-crimson" : "text-bone"
                  }`}
                >
                  {savingId === v.id ? "…" : v.stock}
                </span>
                <button
                  onClick={() => setStock(v.id, v.stock + 1)}
                  className="px-2 py-1.5 font-mono text-[11px] text-faint hover:text-bone"
                  aria-label={`increase ${v.size}`}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
