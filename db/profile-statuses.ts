import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type ProfileStatusRow = Database["public"]["Tables"]["profile_statuses"]["Row"] & {
  statuses: { id: string; name: string; code: string } | null;
};

/**
 * Lists `profileId`'s own special statuses (DATABASE.md §5A), joined with
 * the status's display name. `profileId` must always be the server-resolved
 * session user id (RLS `profile_statuses_all_own`).
 */
export async function listProfileStatuses(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<ProfileStatusRow[]> {
  const { data } = await supabase
    .from("profile_statuses")
    .select("*, statuses(id, name, code)")
    .eq("profile_id", profileId)
    .order("created_at");
  return (data as ProfileStatusRow[] | null) ?? [];
}

export async function addProfileStatus(
  supabase: SupabaseClient<Database>,
  profileId: string,
  statusId: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from("profile_statuses")
    .insert({ profile_id: profileId, status_id: statusId });
  return { error };
}

/**
 * Deletes one status row, scoped to both its own id and `profileId` — same
 * ownership-scoping rationale as db/user-qualifications.ts's
 * removeUserQualification; RLS's `profile_statuses_all_own` policy is the
 * independent second layer.
 */
export async function removeProfileStatus(
  supabase: SupabaseClient<Database>,
  profileId: string,
  id: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from("profile_statuses")
    .delete()
    .eq("id", id)
    .eq("profile_id", profileId);
  return { error };
}
