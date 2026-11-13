import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { JobNotificationSummary, JobPostRow } from "@/db/jobs";

type DB = SupabaseClient<Database>;

export type JobApplicationRow = Database["public"]["Tables"]["job_applications"]["Row"];
export type JobApplicationWithJob = JobApplicationRow & {
  job_posts: (JobPostRow & { job_notifications: JobNotificationSummary | null }) | null;
};
export type StatusHistoryRow =
  Database["public"]["Tables"]["job_application_status_history"]["Row"];

// `profileId` is always the server-resolved session user id; the
// `job_applications_all_own` RLS policy is the independent second layer.

export async function listApplications(
  db: DB,
  profileId: string,
): Promise<JobApplicationWithJob[]> {
  const { data } = await db
    .from("job_applications")
    .select("*, job_posts(*, job_notifications(*, organizations!inner(id, name, state_id)))")
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false });
  return (data as JobApplicationWithJob[] | null) ?? [];
}

export async function getApplicationForPost(
  db: DB,
  profileId: string,
  jobPostId: string,
): Promise<JobApplicationRow | null> {
  const { data } = await db
    .from("job_applications")
    .select("*")
    .eq("profile_id", profileId)
    .eq("job_post_id", jobPostId)
    .maybeSingle();
  return data;
}

export async function getApplication(
  db: DB,
  profileId: string,
  applicationId: string,
): Promise<JobApplicationRow | null> {
  const { data } = await db
    .from("job_applications")
    .select("*")
    .eq("profile_id", profileId)
    .eq("id", applicationId)
    .maybeSingle();
  return data;
}

export async function listStatusHistory(
  db: DB,
  applicationIds: string[],
): Promise<StatusHistoryRow[]> {
  if (applicationIds.length === 0) return [];
  const { data } = await db
    .from("job_application_status_history")
    .select("*")
    .in("application_id", applicationIds)
    .order("changed_at", { ascending: true });
  return data ?? [];
}

export async function insertApplication(
  db: DB,
  profileId: string,
  jobPostId: string,
): Promise<{ data: JobApplicationRow | null; error: PostgrestError | null }> {
  const { data, error } = await db
    .from("job_applications")
    .insert({ profile_id: profileId, job_post_id: jobPostId })
    .select("*")
    .single();
  return { data, error };
}

export async function updateApplication(
  db: DB,
  profileId: string,
  applicationId: string,
  patch: Pick<JobApplicationRow, "status" | "applied_on" | "application_number" | "notes">,
): Promise<{ data: JobApplicationRow | null; error: PostgrestError | null }> {
  const { data, error } = await db
    .from("job_applications")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .eq("id", applicationId)
    .select("*")
    .maybeSingle();
  return { data, error };
}

export async function deleteApplication(
  db: DB,
  profileId: string,
  applicationId: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await db
    .from("job_applications")
    .delete()
    .eq("profile_id", profileId)
    .eq("id", applicationId);
  return { error };
}
