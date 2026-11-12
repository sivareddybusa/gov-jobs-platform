"use client";
import "client-only";

import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env.client";
import type { Database } from "@/lib/supabase/types";

/**
 * Browser Supabase client — uses only the public anon key, which is safe to
 * expose because it has no access beyond what Row Level Security grants it
 * (DATABASE.md §26, SECURITY.md §8). Never import the service-role key here.
 */
export function createClient() {
  return createBrowserClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    clientEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
