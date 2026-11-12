import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { clientEnv } from "@/lib/env.client";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/lib/supabase/types";

/**
 * Service-role Supabase client — bypasses Row Level Security entirely.
 *
 * SECURITY.md §8: this credential must never reach the browser and must only
 * be used for operations that genuinely require acting outside a specific
 * user's row-level scope (system-initiated audit/history writes, the profile
 * bootstrap trigger's supporting function, scheduled ingestion jobs). It is
 * not yet called from anywhere in this bootstrap phase — no feature needs it
 * yet — but the boundary is established now so every future use goes through
 * one reviewed, server-only entry point rather than being reinvented ad hoc.
 *
 * Never import this module from a client component; `server-only` makes that
 * a build-time error rather than a runtime leak.
 */
export function createAdminClient() {
  if (!serverEnv.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. This client must only be constructed in a " +
        "trusted server-side context where the service-role key is configured.",
    );
  }

  return createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
