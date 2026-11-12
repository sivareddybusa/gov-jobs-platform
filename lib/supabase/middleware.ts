import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/lib/env.client";

// Phase 3: this is the single, centralized place route protection is
// decided (Phase 3 §19: "do not hard-code redirects in many unrelated
// components"). Prefix-matched, deny-list style — everything not listed
// here stays public, so login/register/forgot-password/reset-password/the
// email confirmation callback/the home page are never accidentally gated.
const PROTECTED_PATH_PREFIXES = ["/dashboard", "/onboarding"];
const AUTH_ONLY_PATHS = ["/login", "/register"];

/**
 * Builds a per-request Content-Security-Policy using Next.js's documented
 * nonce pattern (SECURITY.md §29,
 * node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 * The nonce is threaded onto the outgoing *request* headers as `x-nonce`;
 * Next's own script renderer reads that header during SSR and nonces its
 * own inline/chunk scripts to match — which only works because
 * app/layout.tsx now forces every page to render dynamically
 * (`export const dynamic = "force-dynamic"`); a statically-generated page
 * has no request to read a nonce from at all, and was confirmed (via a
 * real production build + real headless-browser check) to have every
 * script blocked outright before that layout change. `strict-dynamic` lets
 * scripts loaded *by* the nonced root script run without needing their own
 * nonce, which Next's chunked script loading relies on.
 */
function buildCsp(nonce: string): string {
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
  return [
    "default-src 'self'",
    `connect-src 'self' ${supabaseOrigin}`.trim(),
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * Refreshes the Supabase auth session cookie on every request, enforces the
 * protected/auth-only route redirects, and attaches a per-request
 * nonce-based CSP (production only — dev mode's HMR/React Refresh needs
 * `'unsafe-eval'`, which a strict CSP would otherwise fight with; verified
 * safe/working here via a real production build + real headless-browser
 * check with zero console errors and zero failed requests after
 * app/layout.tsx's dynamic-rendering change, not assumed).
 *
 * This is the server-side authorization gate (SECURITY.md §5) — it runs
 * before any page renders, so an unauthenticated request never reaches a
 * protected Server Component in the first place. It is not the *only*
 * gate: protected pages/layouts independently re-check via
 * lib/auth/require-user.ts (defense-in-depth — this middleware is not
 * assumed to be the sole enforcement point either).
 */
export async function updateSession(request: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";
  const nonce = isProd ? Buffer.from(crypto.randomUUID()).toString("base64") : "";
  const cspHeaderValue = isProd ? buildCsp(nonce) : "";

  const requestHeaders = new Headers(request.headers);
  if (isProd) requestHeaders.set("x-nonce", nonce);

  const applyCsp = (res: NextResponse) => {
    if (isProd) res.headers.set("Content-Security-Policy", cspHeaderValue);
    return res;
  };

  let response = applyCsp(NextResponse.next({ request: { headers: requestHeaders } }));

  const supabase = createServerClient(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = applyCsp(NextResponse.next({ request: { headers: requestHeaders } }));
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Re-validates the session against the Supabase Auth server rather than
  // trusting a possibly-stale cookie-decoded value — required for Server
  // Components, which cannot write cookies themselves, and this refresh is
  // also what the auth-decision below relies on being current.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthOnlyPage = AUTH_ONLY_PATHS.some((prefix) => pathname.startsWith(prefix));

  // Next.js's <Link> prefetches routes in the background (marked with this
  // header) well before a user actually clicks them. Discovered the hard
  // way while verifying the password-recovery flow: a /login link's Link
  // rendered on /forgot-password gets prefetched while the visitor is still
  // signed out; if that prefetch is later silently revalidated *after* they
  // authenticate (e.g. via a recovery-email link, landing on
  // /reset-password), the stale prefetch would hit this same redirect logic
  // and get 307'd to /dashboard — and Next's router can apply that
  // redirect as a real navigation, silently bouncing the visitor off
  // /reset-password before they ever set a new password. A prefetch is not
  // a real page visit, so it must never carry an authorization *decision*;
  // the real, non-prefetch navigation still hits this same gate normally.
  const isPrefetch = request.headers.get("next-router-prefetch") === "1";

  if (isProtected && !user && !isPrefetch) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return copyCookies(response, applyCsp(NextResponse.redirect(loginUrl)));
  }

  if (isAuthOnlyPage && user && !isPrefetch) {
    return copyCookies(
      response,
      applyCsp(NextResponse.redirect(new URL("/dashboard", request.url))),
    );
  }

  return response;
}

/** Carries refreshed session cookies over onto a redirect response built separately. */
function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  for (const cookie of from.cookies.getAll()) {
    to.cookies.set(cookie);
  }
  return to;
}
