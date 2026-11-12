import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { addStatusSchema, removeStatusSchema } from "@/lib/validation/profile";
import { statusIsActive } from "@/db/reference-data";
import { addProfileStatus, removeProfileStatus } from "@/db/profile-statuses";
import type { ServiceResult } from "./types";

/**
 * Add-status use case (DATABASE.md §5A composable special statuses).
 * `userId` (the caller's own server-resolved session id) is always used as
 * `profile_statuses.profile_id` — there is no input path through which a
 * caller could grant a status to another user's profile; RLS's
 * `profile_statuses_all_own` policy is the independent second layer.
 */
export async function addStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = addStatusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const active = await statusIsActive(supabase, parsed.data.statusId);
  if (!active) {
    return {
      success: false,
      error: "Selected status is no longer valid. Please re-select and try again.",
    };
  }

  const { error } = await addProfileStatus(supabase, userId, parsed.data.statusId);
  if (error) {
    // Most likely the (profile_id, status_id) UNIQUE constraint — the user
    // already holds this status.
    return { success: false, error: "Could not add this status. It may already be added." };
  }
  return { success: true };
}

/**
 * Remove-status use case. The delete is scoped to `userId` at the db/ layer
 * (db/profile-statuses.ts's removeProfileStatus), so a caller supplying
 * another user's status row id deletes nothing (RLS enforces the same thing
 * independently).
 */
export async function removeStatus(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = removeStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid request." };
  }

  const { error } = await removeProfileStatus(supabase, userId, parsed.data.id);
  if (error) {
    return { success: false, error: "Something went wrong removing this status." };
  }
  return { success: true };
}
