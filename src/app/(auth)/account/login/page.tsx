"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArchiveLabel } from "@/components/ui/ArchiveLabel";
import { RegistrationMark } from "@/components/ui/marks";
import { createClient } from "@/lib/supabase/browser";
import { describeSendFailure, describeVerifyFailure } from "@/lib/auth-errors";

/**
 * Customer sign-in.
 *
 * Supabase Auth is the identity authority: the browser asks Supabase to send a
 * one-time code, then exchanges that code for a session. There is no local
 * OTP table, no hashed code, no custom cookie — the session Supabase issues
 * is the session everything else reads.
 */
type Phase = "email" | "code";

export default function AccountLoginPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  /**
   * Where to send the shopper once they have proved who they are.
   *
   * Same rule as the auth callback: same-origin paths only. An absolute URL
   * read out of a query string would make this an open redirect, and this value
   * is about to be pasted into an email as well as used on this device.
   *
   * Read from window.location rather than useSearchParams so the page does not
   * need a Suspense boundary to stay statically renderable.
   */
  function destination(): string {
    const requested = new URLSearchParams(window.location.search).get("next");
    return requested && requested.startsWith("/") && !requested.startsWith("//")
      ? requested
      : "/account";
  }

  /** A notice is the project's fault; only errors get the crimson treatment. */
  function report(notice: { message: string; tone: "error" | "notice" }) {
    if (notice.tone === "notice") {
      setInfo(notice.message);
      setError(null);
    } else {
      setError(notice.message);
      setInfo(null);
    }
  }

  // Someone already signed in has no business on this page: this used to be
  // where a magic-link visitor ended up, authenticated but stranded.
  useEffect(() => {
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace(destination());
      })
      .catch(() => {});
  }, [router]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          // Links (password reset, magic links) land on the callback, never
          // on a guarded page: the tokens can arrive as a URL fragment, which
          // middleware cannot see, and /account would redirect before they were
          // read. `next` is validated there as same-origin only.
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination())}`,
        },
      });
      if (err) throw err;
      setPhase("code");
      setInfo("A code is on its way. It expires shortly.");
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

    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: "email",
      });
      if (err) throw err;

      router.replace(destination());
      router.refresh();
    } catch (err) {
      report(describeVerifyFailure(err));
      setBusy(false);
    }
  }

  const inputCls =
    "w-full border border-line bg-void px-4 py-3 font-mono text-[12px] text-bone outline-none transition-colors placeholder:text-faint/50 focus:border-crimson/70";

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-[440px] flex-col justify-center px-5 py-28">
      <div className="flex items-center justify-between">
        <ArchiveLabel tone="faint">CUSTOMER REGISTER</ArchiveLabel>
        <RegistrationMark />
      </div>

      <h1 className="mt-6 font-serif-d text-4xl font-light text-bone">
        {phase === "email" ? "ENTER THE ARCHIVE" : "CONFIRM YOUR CODE"}
      </h1>
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-faint">
        {phase === "email"
          ? "No password. We send a one-time code to your email and that is your identity."
          : `Enter the six-digit code sent to ${email}.`}
      </p>

      {error && (
        <p className="mt-6 border border-crimson/60 bg-crimson/10 px-4 py-3 font-mono text-[11px] text-crimson">
          {error}
        </p>
      )}
      {info && (
        <p className="mt-6 border border-line px-4 py-3 font-mono text-[11px] text-faint">
          {info}
        </p>
      )}

      {phase === "email" ? (
        <form onSubmit={send} className="mt-8 space-y-4">
          <label className="block">
            <span className="font-mono text-[9px] tracking-[0.3em] text-faint">EMAIL</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
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
          <label className="block">
            <span className="font-mono text-[9px] tracking-[0.3em] text-faint">CODE</span>
            <input
              inputMode="numeric"
              required
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
              className={`${inputCls} mt-2 text-center text-lg tracking-[0.5em]`}
            />
          </label>
          <button
            type="submit"
            disabled={busy || code.length < 6}
            className="w-full border border-crimson bg-crimson px-4 py-3 font-mono text-[10px] tracking-[0.3em] text-bone transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "VERIFYING…" : "ENTER →"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPhase("email");
              setCode("");
              setError(null);
            }}
            className="w-full font-mono text-[10px] tracking-[0.25em] text-faint hover:text-bone"
          >
            ← USE A DIFFERENT ADDRESS
          </button>
        </form>
      )}

      <p className="mt-10 font-mono text-[10px] leading-relaxed text-faint/60">
        By continuing you agree to the store policies. Your orders, addresses and
        details are visible only to you.
      </p>
    </div>
  );
}