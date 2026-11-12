import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { addQualificationSchema, removeQualificationSchema } from "@/lib/validation/profile";
import { qualificationExists } from "@/db/reference-data";
import { addUserQualification, removeUserQualification } from "@/db/user-qualifications";
import type { ServiceResult } from "./types";

/**
 * Add-qualification use case. `userId` (the caller's own server-resolved
 * session id) is always used as `user_qualifications.profile_id` — there is
 * no input path through which a caller could add a qualification to another
 * user's profile (DATABASE.md §7); RLS's `user_qualifications_all_own`
 * policy is the independent second layer.
 */
export async function addQualification(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = addQualificationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const exists = await qualificationExists(supabase, parsed.data.qualificationId);
  if (!exists) {
    return {
      success: false,
      error: "Selected qualification is no longer valid. Please re-select and try again.",
    };
  }

  const { error } = await addUserQualification(supabase, userId, parsed.data);
  if (error) {
    // Most likely the (profile_id, qualification_id) UNIQUE constraint —
    // the user already holds this qualification (DATABASE.md §7).
    return { success: false, error: "Could not add this qualification. It may already be added." };
  }
  return { success: true };
}

/**
 * Remove-qualification use case. The delete itself is scoped to `userId` at
 * the db/ layer (db/user-qualifications.ts's removeUserQualification), so a
 * caller supplying another user's qualification row id simply deletes
 * nothing (RLS enforces the same thing independently) rather than affecting
 * another user's data.
 */
export async function removeQualification(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = removeQualificationSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid request." };
  }

  const { error } = await removeUserQualification(supabase, userId, parsed.data.id);
  if (error) {
    return { success: false, error: "Something went wrong removing this qualification." };
  }
  return { success: true };
}
