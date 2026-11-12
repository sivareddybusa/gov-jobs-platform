import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type JobHistoryRow = Database["public"]["Tables"]["job_history"]["Row"];

/** Read-only: reviewer+ via RLS's `job_history_select_reviewer` (DATABASE.md §21). Writes go through lib/audit.ts's service-role path only. */
export async function listJobHistory(
  supabase: SupabaseClient<Database>,
  jobNotificationId: string,
): Promise<JobHistoryRow[]> {
  const { data } = await supabase
    .from("job_history")
    .select("*")
    .eq("job_notification_id", jobNotificationId)
    .order("changed_at", { ascending: false });
  return data ?? [];
}
