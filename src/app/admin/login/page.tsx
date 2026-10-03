"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { createClient } from "@/lib/supabase/browser";

/**
 * Control Room sign-in.
 *
 * Staff use Supabase Auth with a password; customers never do, because
 * customer identity is passwordless email OTP. Signing in here only proves who
 * you are — the actual authorisation is the `admin_users` row that
 * `requireAdmin()` checks on the server, so a customer account that somehow
 * reached this page would still be refused.
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (err) throw err;

      router.replace("/admin");
      router.refresh();
    } catch {
      // Uniform response — never reveal whether an account exists.
      setError("Credentials not recognised.");
      setBusy(false);
    }
  }

  const inputCls =
    "w-full border border-line bg-void px-4 py-3 font-mono text-[12px] text-bone outline-none transition-colors placeholder:text-faint/50 focus:border-crimson/70";

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-[380px]">
        <ArchiveLabel tone="faint">CONTROL ROOM</ArchiveLabel>
        <h1 className="mt-5 font-serif-d text-3xl font-light text-bone">KEEPER ACCESS</h1>
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-faint">
          Staff credentials. Customers sign in with an email code instead.
        </p>

        {error && (
          <p className="mt-6 border border-crimson/60 bg-crimson/10 px-4 py-3 font-mono text-[11px] text-crimson">
            {error}
          </p>
        )}

        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="font-mono text-[9px] tracking-[0.3em] text-faint">EMAIL</span>
            <input
              type="email"
              required
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputCls} mt-2`}
            />
          </label>
          <label className="block">
            <span className="font-mono text-[9px] tracking-[0.3em] text-faint">PASSWORD</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputCls} mt-2`}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full border border-crimson bg-crimson px-4 py-3 font-mono text-[10px] tracking-[0.3em] text-bone transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "VERIFYING…" : "ENTER CONTROL ROOM →"}
          </button>
        </form>

        <button
          type="button"
          onClick={async () => {
            const supabase = createClient();
            await supabase.auth.signOut();
            router.replace("/admin/login");
          }}
          className="mt-6 w-full font-mono text-[10px] tracking-[0.25em] text-faint hover:text-bone"
        >
          SIGN OUT
        </button>
      </div>
    </div>
  );
}