import "server-only";
import { z } from "zod";

/**
 * Server-only environment variables — includes every secret the platform uses.
 *
 * This module imports the `server-only` package, which makes it a build error to
 * import this file from any client component or client bundle. Never re-export
 * these values through a path a client component could import (SECURITY.md §8, §19).
 */
const serverEnvSchema = z.object({
  // Public Supabase config, re-validated here because server code needs it too.
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),

  // Bypasses Row Level Security — server-only, never sent to the browser.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Direct Postgres connection, used for migrations/admin tooling only.
  DATABASE_URL: z.string().min(1).optional(),

  // AI provider key for the Phase 7 extraction pipeline (lib/ingestion/ai-extract.ts)
  // — never used client-side. Google Gemini per TECH_STACK.md's AI section
  // (switched from the originally-planned Anthropic during Phase 7
  // implementation — see that doc for why).
  GEMINI_API_KEY: z.string().min(1).optional(),
});

export const serverEnv = serverEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"],
  SUPABASE_SERVICE_ROLE_KEY: process.env["SUPABASE_SERVICE_ROLE_KEY"],
  DATABASE_URL: process.env["DATABASE_URL"],
  GEMINI_API_KEY: process.env["GEMINI_API_KEY"],
});
