"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/auth/require-admin";
import type { ActionState } from "@/lib/auth/action-state";
import type { ServiceResult } from "@/services/profile/types";
import {
  upsertAgeRuleUseCase,
  addRelaxationUseCase,
  removeRelaxationUseCase,
  addStatusRequirementUseCase,
  removeStatusRequirementUseCase,
  upsertStateScopeUseCase,
  addStateScopeStateUseCase,
  removeStateScopeStateUseCase,
  upsertGenderRuleUseCase,
  upsertExperienceRuleUseCase,
  addQualificationRequirementUseCase,
  removeQualificationRequirementUseCase,
} from "@/services/admin/eligibility-rules";
import { updateJobPostUseCase } from "@/services/admin/job-notifications";

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

function revalidate(jobNotificationId: string, postId: string) {
  revalidatePath(`/admin/jobs/${jobNotificationId}/posts/${postId}`);
}

export async function updateJobPostFieldsAction(
  jobNotificationId: string,
  postId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await updateJobPostUseCase(supabase, user.id, jobNotificationId, postId, {
    title: formData.get("title"),
    vacancyCount: formData.get("vacancyCount"),
    payScaleMin: formData.get("payScaleMin"),
    payScaleMax: formData.get("payScaleMax"),
    payScaleNote: formData.get("payScaleNote"),
  });
  if (result.success) revalidate(jobNotificationId, postId);
  return toResult(result, "Post updated.");
}

export async function saveAgeRuleAction(
  jobNotificationId: string,
  postId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await upsertAgeRuleUseCase(supabase, user.id, {
    jobPostId: postId,
    minAge: formData.get("minAge"),
    maxAge: formData.get("maxAge"),
    ageCutoffDate: formData.get("ageCutoffDate"),
    relaxationCombinationMode: formData.get("relaxationCombinationMode"),
  });
  if (result.success) revalidate(jobNotificationId, postId);
  return toResult(result, "Age rule saved.");
}

export async function addRelaxationAction(
  jobNotificationId: string,
  postId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await addRelaxationUseCase(supabase, user.id, {
    jobPostId: postId,
    categoryId: formData.get("categoryId"),
    statusId: formData.get("statusId"),
    ageRelaxationYears: formData.get("ageRelaxationYears"),
  });
  if (result.success) revalidate(jobNotificationId, postId);
  return toResult(result, "Relaxation added.");
}

export async function removeRelaxationAction(
  jobNotificationId: string,
  postId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await removeRelaxationUseCase(supabase, user.id, { id: formData.get("id") });
  if (result.success) revalidate(jobNotificationId, postId);
  return toResult(result, "Relaxation removed.");
}

export async function addStatusRequirementAction(
  jobNotificationId: string,
  postId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await addStatusRequirementUseCase(supabase, user.id, {
    jobPostId: postId,
    statusId: formData.get("statusId"),
    requirementType: formData.get("requirementType"),
  });
  if (result.success) revalidate(jobNotificationId, postId);
  return toResult(result, "Status requirement added.");
}

export async function removeStatusRequirementAction(
  jobNotificationId: string,
  postId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await removeStatusRequirementUseCase(supabase, user.id, {
    id: formData.get("id"),
  });
  if (result.success) revalidate(jobNotificationId, postId);
  return toResult(result, "Status requirement removed.");
}

export async function saveStateScopeAction(
  jobNotificationId: string,
  postId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await upsertStateScopeUseCase(supabase, user.id, {
    jobPostId: postId,
    scopeType: formData.get("scopeType"),
  });
  if (result.success) revalidate(jobNotificationId, postId);
  return toResult(result, "State scope saved.");
}

export async function addStateScopeStateAction(
  jobNotificationId: string,
  postId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await addStateScopeStateUseCase(supabase, user.id, {
    jobStateScopeId: formData.get("jobStateScopeId"),
    stateId: formData.get("stateId"),
  });
  if (result.success) revalidate(jobNotificationId, postId);
  return toResult(result, "State added.");
}

export async function removeStateScopeStateAction(
  jobNotificationId: string,
  postId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await removeStateScopeStateUseCase(supabase, user.id, { id: formData.get("id") });
  if (result.success) revalidate(jobNotificationId, postId);
  return toResult(result, "State removed.");
}

export async function saveGenderRuleAction(
  jobNotificationId: string,
  postId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await upsertGenderRuleUseCase(supabase, user.id, {
    jobPostId: postId,
    allowedGender: formData.get("allowedGender"),
  });
  if (result.success) revalidate(jobNotificationId, postId);
  return toResult(result, "Gender rule saved.");
}

export async function saveExperienceRuleAction(
  jobNotificationId: string,
  postId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await upsertExperienceRuleUseCase(supabase, user.id, {
    jobPostId: postId,
    minYears: formData.get("minYears"),
    maxYears: formData.get("maxYears"),
    domainNote: formData.get("domainNote"),
    asOfDate: formData.get("asOfDate"),
  });
  if (result.success) revalidate(jobNotificationId, postId);
  return toResult(result, "Experience rule saved.");
}

export async function addQualificationRequirementAction(
  jobNotificationId: string,
  postId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await addQualificationRequirementUseCase(supabase, user.id, {
    jobPostId: postId,
    qualificationId: formData.get("qualificationId"),
    educationLevelId: formData.get("educationLevelId"),
    groupId: formData.get("groupId"),
    verificationStatus: formData.get("verificationStatus"),
  });
  if (result.success) revalidate(jobNotificationId, postId);
  return toResult(result, "Qualification requirement added.");
}

export async function removeQualificationRequirementAction(
  jobNotificationId: string,
  postId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("editor");
  const result = await removeQualificationRequirementUseCase(supabase, user.id, {
    id: formData.get("id"),
  });
  if (result.success) revalidate(jobNotificationId, postId);
  return toResult(result, "Qualification requirement removed.");
}
