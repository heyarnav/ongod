"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { createClient } from "@/lib/supabase/browser";
import { describeSendFailure, describeVerifyFailure } from "@/lib/auth-errors";

/**
 * Control Room sign-in.
 *
 * Passwordless, like the customer register: a one-time code sent to the
 * operator's address. What may be requested, and by whom, is decided server-side
 * by POST /api/admin/login-code, which mails a code only when `admin_users`
 * already grants that address — so this page cannot be used to create accounts,
 * to spend the email quota, or to discover which addresses are operators.
 *
 * The code proves who you are. It grants nothing. `requireAdmin()` in the
 * dashboard layout is still the boundary, which is why the grant is re-checked
 * below after verification: a session without a grant is signed straight back
 * out instead of bouncing between /admin and /admin/login forever.
 *
 * The password still exists in Supabase Auth and is deliberately unused here —
 * it stays as an escape hatch for signing in via the API if mail is down.
 */
type Phase = "email" | "code";

export default function AdminLoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // An operator who is already signed in has nothing to do here. Checked
  // against the grant as well as the session, because redirecting on "has a
  // session" alone would bounce an ordinary customer between /admin and this
  // page for ever: the layout sends them back here, this page sends them back.
  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(async ({ data }) => {
        if (!data.session) return;
        const { data: grant } = await createClient()
          .from("admin_users")
          .select("role")
          .eq("user_id", data.session.user.id)
          .maybeSingle();
        if (grant) router.replace("/admin");
      })
      .catch(() => {});
  }, [router]);

  function report(failure: { message: string; tone: "error" | "notice" }) {
    if (failure.tone === "notice") {
      setNotice(failure.message);
      setError(null);
    } else {
      setError(failure.message);
      setNotice(null);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await fetch("/api/admin/login-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      // Advance whatever the server said. The route answers identically for an
      // operator, an ordinary customer and an address that does not exist, and
      // this must not reintroduce the difference the server removed.
      setPhase("code");
      setNotice("If that address holds the role, a code is on its way.");
    } catch (err) {
      report(describeSendFailure(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();

    try {
      const { data, error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });
      if (err) throw err;
      const user = data.user;
      if (!user) throw new Error("no session");

      // A valid session is not access. Confirm the grant before walking in, so
      // an account without one gets a plain refusal rather than a redirect loop.
      const { data: grant } = await supabase
        .from("admin_users")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!grant) {
        await supabase.auth.signOut();
        setError("That account has no Control Room access.");
        setPhase("email");
        setCode("");
        setBusy(false);
        return;
      }

      router.replace("/admin");
      router.refresh();
    } catch (err) {
      report(describeVerifyFailure(err));
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
          No password. A one-time code goes to the address that holds the role.
        </p>

        {error && (
          <p className="mt-6 border border-crimson/60 bg-crimson/10 px-4 py-3 font-mono text-[11px] text-crimson">
            {error}
          </p>
        )}
        {notice && (
          <p className="mt-6 border border-line px-4 py-3 font-mono text-[11px] text-faint">
            {notice}
          </p>
        )}

        {phase === "email" ? (
          <form onSubmit={send} className="mt-8 space-y-4">
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
            <button
              type="submit"
              disabled={busy}
              className="w-full border border-crimson bg-crimson px-4 py-3 font-mono text-[10px] tracking-[0.3em] text-bone transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "SENDING…" : "SEND CODE →"}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-8 space-y-4">
            <p className="font-mono text-[10px] leading-relaxed text-faint">
              Enter the six-digit code sent to {email}.
            </p>
            <label className="block">
              <span className="font-mono text-[9px] tracking-[0.3em] text-faint">CODE</span>
              <input
                inputMode="numeric"
                required
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${inputCls} mt-2 text-center text-lg tracking-[0.5em]`}
              />
            </label>
            <button
              type="submit"
              disabled={busy || code.length < 6}
              className="w-full border border-crimson bg-crimson px-4 py-3 font-mono text-[10px] tracking-[0.3em] text-bone transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "VERIFYING…" : "ENTER CONTROL ROOM →"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPhase("email");
                setCode("");
                setError(null);
                setNotice(null);
              }}
              className="w-full font-mono text-[10px] tracking-[0.25em] text-faint hover:text-bone"
            >
              ← USE A DIFFERENT ADDRESS
            </button>
          </form>
        )}

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
