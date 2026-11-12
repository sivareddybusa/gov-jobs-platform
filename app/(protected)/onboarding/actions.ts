"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { onboardingSchema } from "@/lib/validation/onboarding";
import type { ActionState } from "@/lib/auth/action-state";

export async function updateOnboardingAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = onboardingSchema.safeParse({
    dateOfBirth: formData.get("dateOfBirth"),
    categoryId: formData.get("categoryId"),
    stateId: formData.get("stateId"),
    educationLevelId: formData.get("educationLevelId"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { supabase, user } = await requireUser("/onboarding");

  // Confirm the submitted reference IDs actually exist and are currently
  // selectable — never trust that a <select> only ever sent a value it
  // rendered as an option (Phase 3 §14).
  const [{ data: category }, { data: state }, { data: educationLevel }] = await Promise.all([
    supabase
      .from("categories")
      .select("id")
      .eq("id", parsed.data.categoryId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("states")
      .select("id")
      .eq("id", parsed.data.stateId)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("education_levels")
      .select("id")
      .eq("id", parsed.data.educationLevelId)
      .eq("is_active", true)
      .maybeSingle(),
  ]);

  if (!category || !state || !educationLevel) {
    return {
      status: "error",
      message: "One or more selected values is no longer valid. Please re-select and try again.",
    };
  }

  // Ownership comes from the authenticated session (`user.id`), never from
  // any client-supplied ID (Phase 3 §11/§16). RLS additionally enforces
  // this at the database layer regardless: DATABASE.md §26's
  // profiles_update_own policy only ever matches id = auth.uid(), so this
  // update could not succeed against another user's row even if the code
  // above had a bug.
  const { error } = await supabase
    .from("profiles")
    .update({
      date_of_birth: parsed.data.dateOfBirth,
      category_id: parsed.data.categoryId,
      state_id: parsed.data.stateId,
      education_level_id: parsed.data.educationLevelId,
    })
    .eq("id", user.id);

  if (error) {
    return {
      status: "error",
      message: "Something went wrong saving your profile. Please try again.",
    };
  }

  redirect("/dashboard");
}
