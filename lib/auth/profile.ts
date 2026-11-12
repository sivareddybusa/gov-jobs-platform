import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type OwnProfile = Database["public"]["Tables"]["profiles"]["Row"];

/**
 * Loads the profile belonging to `userId` — always the server-resolved
 * `auth.getUser().id` from the caller (see lib/auth/require-user.ts), never
 * an ID read from a request body or query string. RLS additionally enforces
 * this at the database layer regardless (DATABASE.md §26): a request for
 * any other user's profile through this same client would simply return no
 * row, not another user's data.
 */
export async function getOwnProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<OwnProfile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();

  if (error) return null;
  return data;
}

/**
 * PRD.md's MVP onboarding fields (DOB, category, state, education) — see
 * lib/validation/onboarding.ts. A profile missing any of these is
 * "incomplete" and drives the onboarding redirect (DATABASE.md §3: this is
 * an application-layer distinction, not a database-level constraint, since
 * these fields are intentionally nullable in the schema).
 */
export function isProfileComplete(profile: OwnProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.date_of_birth && profile.category_id && profile.state_id && profile.education_level_id,
  );
}
