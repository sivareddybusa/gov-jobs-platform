import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env.client";
import type { Database } from "@/lib/supabase/types";

/**
 * Per-request server Supabase client, scoped to the current user's session via
 * their auth cookies. Still subject to Row Level Security (it uses the anon
 * key, not the service-role key) — this is the client server actions/route
 * handlers should use for anything done "as the current user" (SECURITY.md §14).
 *
 * Must be created fresh per request (cookies() is request-scoped) — never
 * cached or reused across requests/users.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component that can't set cookies — safe to
            // ignore as long as middleware.ts is refreshing the session.
          }
        },
      },
    },
  );
}
