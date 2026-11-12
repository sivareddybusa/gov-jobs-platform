import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { profileEditSchema } from "@/lib/validation/profile";
import { updateProfile as updateProfileRow } from "@/db/profiles";
import { categoryIsActive, stateIsActive, educationLevelIsActive } from "@/db/reference-data";
import type { ServiceResult } from "./types";

/**
 * Profile-edit use case (Phase 4, mirrors app/(protected)/onboarding/actions.ts's
 * pattern): Zod-validate the shape, then re-verify every referenced FK id
 * actually exists and is currently active, then perform an
 * ownership-scoped write. `userId` must always be the caller's own
 * server-resolved session id (never a client-supplied profile id) — this
 * function has no parameter through which a caller could target another
 * user's profile, and RLS's `profiles_update_own` policy is the independent
 * second layer that would reject it regardless.
 */
export async function updateProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = profileEditSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const data = parsed.data;

  const checks: Array<Promise<boolean>> = [
    categoryIsActive(supabase, data.categoryId),
    stateIsActive(supabase, data.stateId),
    educationLevelIsActive(supabase, data.educationLevelId),
  ];
  if (data.domicileStateId) {
    checks.push(stateIsActive(supabase, data.domicileStateId));
  }
  const results = await Promise.all(checks);
  if (results.some((ok) => !ok)) {
    return {
      success: false,
      error: "One or more selected values is no longer valid. Please re-select and try again.",
    };
  }

  const { error } = await updateProfileRow(supabase, userId, {
    full_name: data.fullName ?? null,
    date_of_birth: data.dateOfBirth,
    category_id: data.categoryId,
    state_id: data.stateId,
    domicile_state_id: data.domicileStateId ?? null,
    education_level_id: data.educationLevelId,
    gender: data.gender ?? null,
    experience_years: data.experienceYears ?? null,
  });

  if (error) {
    return { success: false, error: "Something went wrong saving your profile. Please try again." };
  }
  return { success: true };
}
