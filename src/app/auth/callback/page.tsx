"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

/**
 * Where every emailed link lands.
 *
 * Supabase sends three different shapes depending on the flow and the project's
 * auth settings, and all three have to work or sign-in links are silently dead:
 *
 *   ?code=...                          PKCE, what signInWithOtp sends today
 *   ?token_hash=...&type=...           the verify endpoint's server-side shape
 *   #access_token=...&refresh_token=.. implicit flow. That is a URL fragment,
 *                                      which the server never receives, so it
 *                                      can only be read here, in the browser.
 *
 * The fragment case is why this route exists. A guarded /account cannot help:
 * the fragment is invisible to middleware, so the layout redirects before these
 * tokens are ever read, and the visitor is stranded on the login form while
 * holding a perfectly valid session.
 */
export default function AuthCallbackPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // detectSessionInUrl off: this page is the only thing allowed to read the
    // tokens, so there is exactly one writer of the session cookie.
    const supabase = createClient({ detectSessionInUrl: false });
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));

    // Same-origin paths only. An absolute URL from the query string would make
    // this an open redirect.
    const requested = query.get("next");
    const next =
      requested && requested.startsWith("/") && !requested.startsWith("//")
        ? requested
        : "/account";

    (async () => {
      const code = query.get("code");
      const tokenHash = query.get("token_hash");
      const accessToken = fragment.get("access_token");
      const refreshToken = fragment.get("refresh_token");

      if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        if (err) {
          setError(err.message);
          return;
        }
      } else if (tokenHash) {
        const type = (query.get("type") ?? "email") as
          | "email"
          | "magiclink"
          | "recovery"
          | "invite"
          | "signup";
        const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (err) {
          setError(err.message);
          return;
        }
      } else if (accessToken && refreshToken) {
        const { error: err } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (err) {
          setError(err.message);
          return;
        }
      } else {
        setError("This link is missing its token. Request a new one.");
        return;
      }

      // Do not navigate on faith. A session that was never written looks
      // exactly like success until the next page refuses to render, and the
      // whole point of this route is that it is verifiable.
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        setError("Sign-in could not be completed. Request a new code.");
        return;
      }

      // A hard navigation, deliberately. `router.replace()` moved the URL but
      // left this component mounted, and mixing it with a manual
      // history.replaceState desyncs the router. This page is an entry point
      // that runs once, so a full document load is the honest way to leave it —
      // and it guarantees the tokens are gone from the address bar, which a
      // client-side transition would leave sitting in the fragment.
      window.location.replace(next);
    })();
  }, []);

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-[440px] flex-col justify-center px-5 py-28">
      <h1 className="font-serif-d text-4xl font-light text-bone">
        {error ? "LINK REFUSED" : "COMPLETING SIGN-IN"}
      </h1>
      <p className="mt-3 font-mono text-[11px] leading-relaxed text-faint">
        {error ?? "One moment."}
      </p>
      {error && (
        <a
          href="/account/login"
          className="mt-8 border border-line px-4 py-3 text-center font-mono text-[10px] tracking-[0.3em] text-bone"
        >
          REQUEST A NEW CODE →
        </a>
      )}
    </div>
  );
}
