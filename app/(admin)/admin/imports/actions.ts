"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/require-admin";
import type { ActionState } from "@/lib/auth/action-state";
import type { ServiceResult } from "@/services/profile/types";
import {
  startIngestionUseCase,
  approveImportUseCase,
  rejectImportUseCase,
} from "@/services/admin/job-imports";

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

export async function startIngestionAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await startIngestionUseCase(supabase, user.id, {
    jobSourceId: formData.get("jobSourceId"),
    documentUrl: formData.get("documentUrl"),
  });
  if (result.id) {
    revalidatePath("/admin/imports");
    redirect(`/admin/imports/${result.id}`);
  }
  return toResult(result, "Ingestion started.");
}

export async function approveImportAction(
  importId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");

  const notification = {
    organizationId: formData.get("organizationId"),
    departmentId: formData.get("departmentId"),
    sourceId: formData.get("sourceId"),
    title: formData.get("title"),
    description: formData.get("description"),
    recruitmentType: formData.get("recruitmentType"),
    officialAdvertisementUrl: formData.get("officialAdvertisementUrl"),
    officialApplicationUrl: formData.get("officialApplicationUrl"),
    notificationDate: formData.get("notificationDate"),
    applicationStartDate: formData.get("applicationStartDate"),
    applicationEndDate: formData.get("applicationEndDate"),
  };
  const post = {
    title: formData.get("postTitle"),
    vacancyCount: formData.get("vacancyCount"),
    payScaleMin: formData.get("payScaleMin"),
    payScaleMax: formData.get("payScaleMax"),
    payScaleNote: formData.get("payScaleNote"),
  };

  const hasAgeRule = formData.get("includeAgeRule") === "on";
  const ageRule = hasAgeRule
    ? {
        minAge: formData.get("minAge"),
        maxAge: formData.get("maxAge"),
        ageCutoffDate: formData.get("ageCutoffDate"),
        relaxationCombinationMode: formData.get("relaxationCombinationMode"),
      }
    : undefined;

  const reviewNotes = formData.get("reviewNotes");

  const result = await approveImportUseCase(supabase, user.id, importId, {
    notification,
    post,
    ageRule,
    reviewNotes: typeof reviewNotes === "string" && reviewNotes.trim() ? reviewNotes : undefined,
  });

  if (result.success) {
    revalidatePath("/admin/imports");
    redirect(`/admin/jobs/${result.jobNotificationId}`);
  }
  return toResult(result, "Import approved.");
}

export async function rejectImportAction(
  importId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("reviewer");
  const result = await rejectImportUseCase(supabase, user.id, {
    id: importId,
    reviewNotes: formData.get("reviewNotes"),
  });
  if (result.success) {
    revalidatePath("/admin/imports");
    revalidatePath(`/admin/imports/${importId}`);
  }
  return toResult(result, "Import rejected.");
}
