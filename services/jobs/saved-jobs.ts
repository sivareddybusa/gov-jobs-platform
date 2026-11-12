import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { z } from "zod";
import { saveJob, unsaveJob } from "@/db/saved-jobs";
import type { ServiceResult } from "@/services/profile/types";

const jobPostIdSchema = z.object({ jobPostId: z.uuid("Invalid job reference") });

/**
 * `userId` is always the server-resolved session id (never client-supplied)
 * — services/profile/*'s established pattern. RLS's `saved_jobs_all_own`
 * policy (`profile_id = auth.uid()`) is the independent second layer.
 */
export async function saveJobUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = jobPostIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };

  const { error } = await saveJob(supabase, userId, parsed.data.jobPostId);
  if (error) return { success: false, error: "Could not save this job. It may already be saved." };
  return { success: true };
}

export async function unsaveJobUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = jobPostIdSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };

  const { error } = await unsaveJob(supabase, userId, parsed.data.jobPostId);
  if (error) return { success: false, error: "Could not remove this saved job." };
  return { success: true };
}
