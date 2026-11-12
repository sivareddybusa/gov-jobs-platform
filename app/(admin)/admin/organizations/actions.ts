"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/require-admin";
import type { ActionState } from "@/lib/auth/action-state";
import {
  createOrganizationUseCase,
  updateOrganizationUseCase,
  addDepartmentUseCase,
} from "@/services/admin/organizations";
import type { ServiceResult } from "@/services/profile/types";

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

function formInput(formData: FormData) {
  return {
    name: formData.get("name"),
    shortCode: formData.get("shortCode"),
    orgType: formData.get("orgType"),
    stateId: formData.get("stateId"),
    websiteUrl: formData.get("websiteUrl"),
  };
}

export async function createOrganizationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireAdminRole("admin");
  const result = await createOrganizationUseCase(supabase, formInput(formData));
  if (result.success) {
    revalidatePath("/admin/organizations");
    redirect("/admin/organizations");
  }
  return toResult(result, "Organization created.");
}

export async function updateOrganizationAction(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireAdminRole("admin");
  const result = await updateOrganizationUseCase(supabase, id, formInput(formData));
  if (result.success) revalidatePath(`/admin/organizations/${id}`);
  return toResult(result, "Organization updated.");
}

export async function addDepartmentAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireAdminRole("admin");
  const organizationId = String(formData.get("organizationId") ?? "");
  const result = await addDepartmentUseCase(supabase, {
    organizationId,
    name: formData.get("name"),
  });
  if (result.success) revalidatePath(`/admin/organizations/${organizationId}`);
  return toResult(result, "Department added.");
}
