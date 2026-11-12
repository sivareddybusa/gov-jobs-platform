import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side "who is this" check for protected Server Components.
 *
 * proxy.ts already redirects unauthenticated requests away from protected
 * paths, but this is called again here as a deliberate second, independent
 * check (SECURITY.md §5: authorization is enforced by layers that must both
 * agree, not by a single gate) — a page must never assume middleware ran
 * correctly for it. Identity is derived from `auth.getUser()`, which
 * re-validates the session against the Supabase Auth server rather than
 * trusting a possibly-stale cookie-decoded value (Phase 3 §8: never derive
 * "current user" from anything the browser merely claims).
 */
export async function requireUser(redirectTo?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = redirectTo ? `/login?redirectTo=${encodeURIComponent(redirectTo)}` : "/login";
    redirect(loginUrl);
  }

  return { supabase, user };
}
