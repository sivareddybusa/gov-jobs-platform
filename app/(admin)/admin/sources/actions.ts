"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/require-admin";
import type { ActionState } from "@/lib/auth/action-state";
import { createJobSourceUseCase, updateJobSourceUseCase } from "@/services/admin/job-sources";
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
    organizationId: formData.get("organizationId"),
    name: formData.get("name"),
    officialDomain: formData.get("officialDomain"),
    sourceType: formData.get("sourceType"),
    sourceUrl: formData.get("sourceUrl"),
  };
}

export async function createJobSourceAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireAdminRole("admin");
  const result = await createJobSourceUseCase(supabase, formInput(formData));
  if (result.success) {
    revalidatePath("/admin/sources");
    redirect("/admin/sources");
  }
  return toResult(result, "Source created.");
}

export async function updateJobSourceAction(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase } = await requireAdminRole("admin");
  const result = await updateJobSourceUseCase(supabase, id, formInput(formData));
  if (result.success) revalidatePath(`/admin/sources/${id}`);
  return toResult(result, "Source updated.");
}
