import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { requireAdmin } from "@/lib/supabase/session";
import { AdminShell } from "@/components/admin/AdminShell";

/**
 * Server-side guard for every /admin route except /admin/login.
 *
 * `requireAdmin()` revalidates the JWT against Supabase Auth and then checks
 * for a row in `admin_users`. Middleware only performs a cheap redirect, so
 * this — not the cookie — is the actual authorization boundary.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect("/admin/login");

  return <AdminShell operator={auth.admin}>{children}</AdminShell>;
}