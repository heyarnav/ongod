"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/**
 * Control Room shell.
 *
 * The section index is the operator's whole world: catalogue, realms, stock,
 * orders, customers, media and settings. Analytics lives on the dashboard
 * rather than behind its own screen. There is no issues section — the
 * complaint system was removed from the architecture.
 */
const SECTIONS = [
  { href: "/admin", label: "Dashboard", num: "00" },
  { href: "/admin/products", label: "Products", num: "01" },
  { href: "/admin/collections", label: "Collections", num: "02" },
  { href: "/admin/inventory", label: "Inventory", num: "03" },
  { href: "/admin/orders", label: "Orders", num: "04" },
  { href: "/admin/customers", label: "Customers", num: "05" },
  { href: "/admin/media", label: "Media", num: "06" },
  { href: "/admin/settings", label: "Settings", num: "07" },
];

export function AdminShell({
  children,
  operator,
}: {
  children: ReactNode;
  operator?: { name?: string; email?: string };
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    // Supabase Auth owns the session — there is no separate server session to
    // destroy. The cookie the middleware maintains is cleared with it.
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-abyss">
      {/* Top bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-abyss/90 px-5 backdrop-blur-sm">
        <div className="flex items-center gap-5">
          <Link href="/" className="font-serif text-lg text-bone" data-cursor="[ VIEW SITE ]">
            on god.
          </Link>
          <span className="font-mono text-[10px] tracking-[0.3em] text-faint">CONTROL ROOM</span>
        </div>
        <div className="flex items-center gap-4">
          {operator?.email && (
            <span className="hidden font-mono text-[10px] tracking-[0.2em] text-faint sm:block">
              {operator.email}
            </span>
          )}
          <button
            onClick={logout}
            className="border border-line px-3 py-1.5 font-mono text-[10px] tracking-[0.25em] text-faint transition-colors hover:border-crimson/60 hover:text-crimson"
          >
            LOG OUT
          </button>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-3.5rem)]">
        {/* Sidebar — beside the content, not above it */}
        <nav className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col border-r border-line px-4 py-6 md:flex">
          {SECTIONS.map((s) => {
            const active = s.href === "/admin" ? pathname === "/admin" : pathname.startsWith(s.href);
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`group flex items-center gap-3 px-3 py-2.5 font-mono text-[11px] tracking-[0.2em] transition-colors ${
                  active ? "text-crimson" : "text-faint hover:text-bone"
                }`}
              >
                <span className={`text-[9px] ${active ? "text-crimson" : "text-faint/60"}`}>{s.num}</span>
                {s.label.toUpperCase()}
                <span
                  className={`ml-auto h-px w-4 transition-all ${active ? "bg-crimson" : "bg-line group-hover:bg-bone/46"}`}
                />
              </Link>
            );
          })}
          <div className="mt-auto px-3">
            <p className="font-mono text-[9px] leading-relaxed text-faint/60">
              EST. 2026
              <br />
              HUMAN / CELESTIAL / DIVINE
            </p>
          </div>
        </nav>

        <div className="min-w-0 flex-1">
          {/* Mobile section index */}
          <div className="flex gap-4 overflow-x-auto border-b border-line px-5 py-3 md:hidden">
            {SECTIONS.map((s) => {
              const active = s.href === "/admin" ? pathname === "/admin" : pathname.startsWith(s.href);
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className={`whitespace-nowrap font-mono text-[10px] tracking-[0.2em] ${
                    active ? "text-crimson" : "text-faint"
                  }`}
                >
                  {s.label.toUpperCase()}
                </Link>
              );
            })}
          </div>

          <main className="px-5 py-8 md:px-10">{children}</main>
        </div>
      </div>
    </div>
  );
}