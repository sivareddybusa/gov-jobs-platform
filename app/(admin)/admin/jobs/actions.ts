"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/require-admin";
import type { ActionState } from "@/lib/auth/action-state";
import type { ServiceResult } from "@/services/profile/types";
import {
  createJobNotificationUseCase,
  updateJobNotificationUseCase,
  transitionJobNotificationStatusUseCase,
  createJobPostUseCase,
  updateJobPostUseCase,
} from "@/services/admin/job-notifications";

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

function notificationFormInput(formData: FormData) {
  return {
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
}

export async function createJobNotificationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await createJobNotificationUseCase(
    supabase,
    user.id,
    notificationFormInput(formData),
  );
  if (result.success) {
    revalidatePath("/admin/jobs");
    redirect(`/admin/jobs/${result.id}`);
  }
  return toResult(result, "Job notification created.");
}

export async function updateJobNotificationAction(
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await updateJobNotificationUseCase(
    supabase,
    user.id,
    id,
    notificationFormInput(formData),
  );
  if (result.success) revalidatePath(`/admin/jobs/${id}`);
  return toResult(result, "Job notification updated.");
}

export async function transitionStatusAction(
  id: string,
  action: "publish" | "unpublish" | "expire" | "archive" | "approve",
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole(action === "approve" ? "reviewer" : "admin");
  const result = await transitionJobNotificationStatusUseCase(supabase, user.id, id, action);
  revalidatePath(`/admin/jobs/${id}`);
  return toResult(result, `Status updated (${action}).`);
}

function postFormInput(formData: FormData) {
  return {
    title: formData.get("title"),
    vacancyCount: formData.get("vacancyCount"),
    payScaleMin: formData.get("payScaleMin"),
    payScaleMax: formData.get("payScaleMax"),
    payScaleNote: formData.get("payScaleNote"),
  };
}

export async function createJobPostAction(
  jobNotificationId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await createJobPostUseCase(
    supabase,
    user.id,
    jobNotificationId,
    postFormInput(formData),
  );
  if (result.success) {
    revalidatePath(`/admin/jobs/${jobNotificationId}`);
    redirect(`/admin/jobs/${jobNotificationId}/posts/${result.id}`);
  }
  return toResult(result, "Job post created.");
}

export async function updateJobPostAction(
  jobNotificationId: string,
  id: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await updateJobPostUseCase(
    supabase,
    user.id,
    jobNotificationId,
    id,
    postFormInput(formData),
  );
  if (result.success) revalidatePath(`/admin/jobs/${jobNotificationId}/posts/${id}`);
  return toResult(result, "Job post updated.");
}
