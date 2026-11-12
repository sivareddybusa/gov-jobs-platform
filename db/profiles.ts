import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

/**
 * Loads the profile row for `profileId`. `profileId` must always be the
 * server-resolved `auth.getUser().id` (see lib/auth/require-user.ts) — this
 * function never accepts a client-supplied ID as the caller's own identity.
 * RLS (`profiles_select_own`, DATABASE.md §26) additionally enforces the
 * same boundary at the database layer regardless of what the caller passes.
 */
export async function getProfileById(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<ProfileRow | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", profileId).single();
  if (error) return null;
  return data;
}

/**
 * Updates the profile row for `profileId`. The caller (services/profile)
 * is responsible for having already validated the patch and re-verified
 * every referenced FK id — this function only performs the ownership-scoped
 * write. RLS's `profiles_update_own` policy (`id = auth.uid()`) is the
 * second, independent layer that would reject this even if `profileId`
 * here were ever wrong.
 */
export async function updateProfile(
  supabase: SupabaseClient<Database>,
  profileId: string,
  patch: ProfileUpdate,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("profiles").update(patch).eq("id", profileId);
  return { error };
}
