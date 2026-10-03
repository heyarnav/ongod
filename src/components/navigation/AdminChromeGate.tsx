"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Hides storefront chrome (announcement, footer) inside /admin. */
export function AdminChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <>{children}</>;
}
