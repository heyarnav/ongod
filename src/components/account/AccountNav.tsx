"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const LINKS = [
  { href: "/account", label: "OVERVIEW" },
  { href: "/account/orders", label: "ORDERS" },
  { href: "/account/addresses", label: "ADDRESSES" },
];

export function AccountNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    // Supabase Auth owns the session. This used to call DELETE
    // /api/auth/customer, a route that no longer exists, so it navigated to the
    // login page with the session still valid and the layout guard bounced the
    // visitor straight back in — a sign-out button that signed nobody out.
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/account/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-5">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`font-mono text-[10px] tracking-archive transition-colors ${
            pathname === l.href ? "text-crimson" : "text-bone/65 hover:text-bone"
          }`}
        >
          {l.label}
        </Link>
      ))}
      <button
        onClick={signOut}
        className="font-mono text-[10px] tracking-archive text-bone/121 transition-colors hover:text-crimson"
      >
        SIGN OUT
      </button>
    </div>
  );
}
