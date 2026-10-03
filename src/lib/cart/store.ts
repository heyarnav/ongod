"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CartLine } from "@/types";

/**
 * Guest cart — no accounts anywhere in the system.
 * Persisted to localStorage under the archive's own key.
 */
type CartState = {
  lines: CartLine[];
  // The manifest drawer — ephemeral UI, never persisted (see partialize).
  drawerOpen: boolean;
  add: (line: CartLine) => void;
  remove: (productId: string, size: string) => void;
  setQuantity: (productId: string, size: string, quantity: number) => void;
  clear: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
};

function sameLine(a: CartLine, b: { productId: string; size: string }) {
  return a.productId === b.productId && a.size === b.size;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      drawerOpen: false,
      add: (line) =>
        set((state) => {
          const existing = state.lines.find((l) => sameLine(l, line));
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                sameLine(l, line)
                  ? {
                      ...l,
                      quantity: Math.min(l.maxStock || 99, l.quantity + line.quantity),
                    }
                  : l,
              ),
            };
          }
          return { lines: [...state.lines, line] };
        }),
      remove: (productId, size) =>
        set((state) => ({
          lines: state.lines.filter((l) => !sameLine(l, { productId, size })),
        })),
      setQuantity: (productId, size, quantity) =>
        set((state) => ({
          lines: state.lines
            .map((l) =>
              sameLine(l, { productId, size })
                ? { ...l, quantity: Math.max(0, Math.min(l.maxStock || 99, quantity)) }
                : l,
            )
            .filter((l) => l.quantity > 0),
        })),
      clear: () => set({ lines: [] }),
      openDrawer: () => set({ drawerOpen: true }),
      closeDrawer: () => set({ drawerOpen: false }),
    }),
    {
      name: "ongod.archive.cart.v1",
      // Only the register persists. The drawer must never reappear on load.
      partialize: (state) => ({ lines: state.lines }),
    },
  ),
);

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.quantity, 0);
}

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.price * l.quantity, 0);
}
