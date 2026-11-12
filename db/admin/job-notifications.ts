import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type JobNotificationRow = Database["public"]["Tables"]["job_notifications"]["Row"];
export type JobNotificationInsert = Database["public"]["Tables"]["job_notifications"]["Insert"];
export type JobNotificationUpdate = Database["public"]["Tables"]["job_notifications"]["Update"];
export type JobPostRow = Database["public"]["Tables"]["job_posts"]["Row"];
export type JobPostInsert = Database["public"]["Tables"]["job_posts"]["Insert"];
export type JobPostUpdate = Database["public"]["Tables"]["job_posts"]["Update"];

/**
 * RLS's `job_notifications_select_reviewer` (`is_admin(auth.uid(), 'reviewer')`)
 * grants the admin surface visibility into unpublished notifications too —
 * this listing is reviewer+ only, gated at the calling page by
 * requireAdminRole('reviewer'), not a client-facing job list.
 */
export async function listJobNotifications(
  supabase: SupabaseClient<Database>,
): Promise<Array<JobNotificationRow & { organizations: { name: string } | null }>> {
  const { data } = await supabase
    .from("job_notifications")
    .select("*, organizations(name)")
    .order("created_at", { ascending: false });
  return (data as Array<JobNotificationRow & { organizations: { name: string } | null }>) ?? [];
}

export async function getJobNotificationById(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<JobNotificationRow | null> {
  const { data } = await supabase.from("job_notifications").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function createJobNotification(
  supabase: SupabaseClient<Database>,
  input: JobNotificationInsert,
): Promise<{ data: JobNotificationRow | null; error: PostgrestError | null }> {
  return supabase.from("job_notifications").insert(input).select("*").single();
}

export async function updateJobNotification(
  supabase: SupabaseClient<Database>,
  id: string,
  patch: JobNotificationUpdate,
): Promise<{ data: JobNotificationRow | null; error: PostgrestError | null }> {
  return supabase.from("job_notifications").update(patch).eq("id", id).select("*").single();
}

export async function listJobPosts(
  supabase: SupabaseClient<Database>,
  jobNotificationId: string,
): Promise<JobPostRow[]> {
  const { data } = await supabase
    .from("job_posts")
    .select("*")
    .eq("job_notification_id", jobNotificationId)
    .order("created_at");
  return data ?? [];
}

export async function getJobPostById(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<JobPostRow | null> {
  const { data } = await supabase.from("job_posts").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function createJobPost(
  supabase: SupabaseClient<Database>,
  input: JobPostInsert,
): Promise<{ data: JobPostRow | null; error: PostgrestError | null }> {
  return supabase.from("job_posts").insert(input).select("*").single();
}

export async function updateJobPost(
  supabase: SupabaseClient<Database>,
  id: string,
  patch: JobPostUpdate,
): Promise<{ data: JobPostRow | null; error: PostgrestError | null }> {
  return supabase.from("job_posts").update(patch).eq("id", id).select("*").single();
}
