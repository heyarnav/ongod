import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Session refresh + admin gate.
 *
 * IMPORTANT: this is a routing convenience, NOT the security boundary.
 *
 * It runs on every matched request so an expiring JWT gets refreshed before a
 * server component or route handler needs it. The admin redirect below uses
 * `getClaims()`, which validates the token locally and makes NO network call —
 * deliberately. An earlier version called `getUser()` here, which meant a slow
 * or unreachable auth server would bounce a legitimately signed-in operator
 * back to the login page.
 *
 * The real authorization is `requireAdmin()`, called by the Control Room layout
 * and by every admin API route. It revalidates the session against Supabase Auth
 * and then requires a row in `admin_users`. A forged cookie reaches this
 * middleware, sails past it, and is then refused at the layout or the route.
 */
export async function middleware(req: NextRequest) {
  let response = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Unconfigured Supabase: let the request through and let the server-side
    // helpers raise a clear error rather than silently redirecting in a loop.
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          req.cookies.set(name, value);
        }
        response = NextResponse.next({ request: req });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { pathname } = req.nextUrl;
  const isAdminArea = pathname.startsWith("/admin") && pathname !== "/admin/login";

  if (isAdminArea) {
    // Local, signature-only check: does this request carry a usable session?
    // `getClaims()` does not contact the auth server.
    const { data } = await supabase.auth.getClaims();

    if (!data?.claims?.sub) {
      const redirectUrl = req.nextUrl.clone();
      redirectUrl.pathname = "/admin/login";
      redirectUrl.search = `?from=${encodeURIComponent(pathname)}`;
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image files, so the session cookie
    // is refreshed for any page or API route that might read auth state.
    "/((?!_next/static|_next/image|favicon.ico|images/|models/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|glb)$).*)",
  ],
};