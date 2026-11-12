import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { JobNotificationSummary, JobPostRow } from "@/db/jobs";

export type SavedJobRow = Database["public"]["Tables"]["saved_jobs"]["Row"] & {
  job_posts: (JobPostRow & { job_notifications: JobNotificationSummary | null }) | null;
};

/**
 * `profileId` must always be the server-resolved session user id (same
 * ownership-scoping rationale as db/user-qualifications.ts) —
 * `saved_jobs_all_own` RLS policy is the independent second layer.
 */
export async function listSavedJobs(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<SavedJobRow[]> {
  const { data } = await supabase
    .from("saved_jobs")
    .select("*, job_posts(*, job_notifications(*, organizations!inner(id, name, state_id)))")
    .eq("profile_id", profileId)
    .order("saved_at", { ascending: false });
  return (data as SavedJobRow[] | null) ?? [];
}

export async function isJobSaved(
  supabase: SupabaseClient<Database>,
  profileId: string,
  jobPostId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("saved_jobs")
    .select("id")
    .eq("profile_id", profileId)
    .eq("job_post_id", jobPostId)
    .maybeSingle();
  return data !== null;
}

export async function saveJob(
  supabase: SupabaseClient<Database>,
  profileId: string,
  jobPostId: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from("saved_jobs")
    .insert({ profile_id: profileId, job_post_id: jobPostId });
  return { error };
}

export async function unsaveJob(
  supabase: SupabaseClient<Database>,
  profileId: string,
  jobPostId: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from("saved_jobs")
    .delete()
    .eq("profile_id", profileId)
    .eq("job_post_id", jobPostId);
  return { error };
}
