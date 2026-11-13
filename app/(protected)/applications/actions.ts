"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionState } from "@/lib/auth/action-state";
import {
  trackApplicationUseCase,
  updateApplicationUseCase,
  removeApplicationUseCase,
} from "@/services/applications";

export async function trackApplicationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser("/applications");
  const result = await trackApplicationUseCase(supabase, user.id, {
    jobPostId: formData.get("jobPostId"),
  });
  if (!result.success) return { status: "error", message: result.error };
  revalidatePath("/applications");
  return { status: "success", message: "Added to your tracker." };
}

export async function updateApplicationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser("/applications");
  const result = await updateApplicationUseCase(supabase, user.id, {
    applicationId: formData.get("applicationId"),
    status: formData.get("status"),
    appliedOn: formData.get("appliedOn") ?? "",
    applicationNumber: formData.get("applicationNumber") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!result.success) return { status: "error", message: result.error };
  revalidatePath("/applications");
  return { status: "success", message: "Saved." };
}

export async function removeApplicationAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser("/applications");
  const result = await removeApplicationUseCase(supabase, user.id, {
    applicationId: formData.get("applicationId"),
  });
  if (!result.success) return { status: "error", message: result.error };
  revalidatePath("/applications");
  return { status: "success", message: "Removed." };
}
