import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type UserQualificationRow = Database["public"]["Tables"]["user_qualifications"]["Row"] & {
  qualifications: { id: string; name: string; code: string } | null;
};

/**
 * Lists `profileId`'s own qualifications, joined with the qualification's
 * display name for the UI. `profileId` must always be the server-resolved
 * session user id (DATABASE.md §7's `user_qualifications`, RLS
 * `user_qualifications_all_own`).
 */
export async function listUserQualifications(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<UserQualificationRow[]> {
  const { data } = await supabase
    .from("user_qualifications")
    .select("*, qualifications(id, name, code)")
    .eq("profile_id", profileId)
    .order("created_at");
  return (data as UserQualificationRow[] | null) ?? [];
}

export async function addUserQualification(
  supabase: SupabaseClient<Database>,
  profileId: string,
  input: {
    qualificationId: string;
    institution?: string | undefined;
    yearCompleted?: number | undefined;
  },
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("user_qualifications").insert({
    profile_id: profileId,
    qualification_id: input.qualificationId,
    institution: input.institution ?? null,
    year_completed: input.yearCompleted ?? null,
  });
  return { error };
}

/**
 * Deletes one qualification row, scoped to both its own id and `profileId`
 * so a caller can never delete another user's row by guessing/observing its
 * id — RLS's `user_qualifications_all_own` policy (`profile_id = auth.uid()`)
 * is the independent second layer that enforces the same thing regardless.
 */
export async function removeUserQualification(
  supabase: SupabaseClient<Database>,
  profileId: string,
  id: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from("user_qualifications")
    .delete()
    .eq("id", id)
    .eq("profile_id", profileId);
  return { error };
}
