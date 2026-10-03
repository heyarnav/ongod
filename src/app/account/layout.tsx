import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCustomer } from "@/lib/supabase/session";
import { AccountNav } from "@/components/account/AccountNav";

export const metadata: Metadata = {
  title: "Your Register",
  robots: { index: false, follow: false },
};

/**
 * Account shell.
 *
 * The guard reads the Supabase session, not a bespoke cookie. Every query on
 * the pages below additionally runs under RLS, so this redirect is a
 * convenience rather than the security boundary.
 */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  // /account/login lives in the (auth) route group outside this guard.
  const customer = await getCustomer();
  if (!customer) redirect("/account/login");

  return (
    <div className="mx-auto min-h-[80vh] max-w-[1100px] px-5 pb-32 pt-28 md:px-10 md:pt-36">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.3em] text-crimson">CUSTOMER REGISTER</p>
          <h1 className="mt-3 font-serif-d text-4xl font-light text-bone md:text-5xl">
            {customer.email}
          </h1>
        </div>
        {/* One sign-out control, inside the nav. Two used to render here and
            the other one silently did nothing. */}
        <AccountNav />
      </div>
      <div className="mt-12">{children}</div>
    </div>
  );
}
