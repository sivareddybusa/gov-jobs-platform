import { z } from "zod";

/**
 * Browser-safe environment variables only.
 *
 * Every variable here is intentionally exposed to client-side code (Next.js only
 * inlines `NEXT_PUBLIC_*` variables into the browser bundle). Never add a secret
 * to this schema — see lib/env.server.ts for anything that must stay server-only
 * (SECURITY.md §8, §19).
 */
const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  // Base URL of this app itself, used to build absolute auth callback links
  // (email confirmation, password recovery) since Server Actions don't have
  // reliable access to the request origin (Phase 3). Not a secret.
  NEXT_PUBLIC_SITE_URL: z.string().url(),
});

export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  NEXT_PUBLIC_SITE_URL: process.env["NEXT_PUBLIC_SITE_URL"],
});
