"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionState } from "@/lib/auth/action-state";
import { saveJobUseCase, unsaveJobUseCase } from "@/services/jobs/saved-jobs";

export async function saveJobAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser("/jobs");
  const result = await saveJobUseCase(supabase, user.id, { jobPostId: formData.get("jobPostId") });
  if (!result.success) return { status: "error", message: result.error };
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  return { status: "success", message: "Saved." };
}

export async function unsaveJobAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser("/jobs");
  const result = await unsaveJobUseCase(supabase, user.id, {
    jobPostId: formData.get("jobPostId"),
  });
  if (!result.success) return { status: "error", message: result.error };
  revalidatePath("/dashboard");
  revalidatePath("/jobs");
  return { status: "success", message: "Removed." };
}
