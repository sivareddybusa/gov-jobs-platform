"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionState } from "@/lib/auth/action-state";
import { startPreparingUseCase, manageTargetUseCase } from "@/services/preparation/targets";

function refresh() {
  revalidatePath("/preparation");
  revalidatePath("/preparation/exams");
}

export async function startPreparingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser("/preparation/exams");
  const result = await startPreparingUseCase(supabase, user.id, {
    examId: formData.get("examId"),
    targetYear: formData.get("targetYear"),
  });
  if (!result.success) return { status: "error", message: result.error };
  refresh();
  return { status: "success", message: "Added to My Preparation." };
}

export async function manageTargetAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser("/preparation");
  const result = await manageTargetUseCase(supabase, user.id, {
    targetId: formData.get("targetId"),
    action: formData.get("action"),
  });
  if (!result.success) return { status: "error", message: result.error };
  refresh();
  return { status: "success", message: "Updated." };
}
