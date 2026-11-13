"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/auth/require-admin";
import type { ActionState } from "@/lib/auth/action-state";
import { createAdminClient } from "@/lib/supabase/admin";
import { addLlmKeyUseCase, llmKeyActionUseCase } from "@/services/admin/llm";

// Super-admin only. The service-role client is used because llm_credentials is
// deliberately unreachable from any user session.

export async function addLlmKeyAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireAdminRole("super_admin");
  const result = await addLlmKeyUseCase(createAdminClient(), user.id, {
    provider: formData.get("provider"),
    label: formData.get("label"),
    apiKey: formData.get("apiKey"),
    model: formData.get("model") || undefined,
    accountId: formData.get("accountId") || undefined,
  });
  if (!result.success) {
    return {
      status: "error",
      message: result.error,
      ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}),
    };
  }
  revalidatePath("/admin/ai-providers");
  return { status: "success", message: "Key saved (encrypted). Press Use to make it active." };
}

export async function llmKeyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireAdminRole("super_admin");
  const result = await llmKeyActionUseCase(createAdminClient(), user.id, {
    id: formData.get("id"),
    action: formData.get("action"),
  });
  if (!result.success) return { status: "error", message: result.error };
  revalidatePath("/admin/ai-providers");
  revalidatePath("/admin/exams");
  return { status: "success", message: "Updated." };
}
