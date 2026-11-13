"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionState } from "@/lib/auth/action-state";
import { updatePreferencesUseCase } from "@/services/preferences";

export async function updatePreferencesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser("/settings");
  const result = await updatePreferencesUseCase(supabase, user.id, {
    languageCode: formData.get("languageCode"),
    inAppNotifications: formData.get("inAppNotifications") === "on",
    emailNotifications: formData.get("emailNotifications") === "on",
  });
  if (!result.success) return { status: "error", message: result.error };
  revalidatePath("/settings");
  return { status: "success", message: "Settings saved." };
}
