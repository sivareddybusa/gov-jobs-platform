"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/auth/require-admin";
import type { ActionState } from "@/lib/auth/action-state";
import type { ServiceResult } from "@/services/profile/types";
import { grantRoleUseCase, revokeRoleUseCase } from "@/services/admin/roles";

function toResult(result: ServiceResult, successMessage: string): ActionState {
  if (!result.success) {
    return {
      status: "error",
      message: result.error,
      ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}),
    };
  }
  return { status: "success", message: successMessage };
}

export async function grantRoleAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("super_admin");
  const result = await grantRoleUseCase(supabase, user.id, {
    userId: formData.get("userId"),
    roleCode: formData.get("roleCode"),
  });
  if (result.success) revalidatePath("/admin/roles");
  return toResult(result, "Role granted.");
}

export async function revokeRoleAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("super_admin");
  const result = await revokeRoleUseCase(supabase, user.id, { id: formData.get("id") });
  if (result.success) revalidatePath("/admin/roles");
  return toResult(result, "Role revoked.");
}
