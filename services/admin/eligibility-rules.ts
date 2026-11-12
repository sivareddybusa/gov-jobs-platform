import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  ageRuleSchema,
  relaxationSchema,
  statusRequirementSchema,
  stateScopeSchema,
  stateScopeStateSchema,
  genderRuleSchema,
  experienceRuleSchema,
  qualificationRequirementSchema,
  removeRuleRowSchema,
} from "@/lib/validation/admin";
import * as rules from "@/db/admin/eligibility-rules";
import {
  categoryIsActive,
  statusIsActive,
  stateIsActive,
  qualificationExists,
  educationLevelIsActive,
} from "@/db/reference-data";
import { recordAuditEvent } from "@/lib/audit";
import type { ServiceResult } from "@/services/profile/types";

// SECURITY.md §32 checklist: "Sensitive operations (publish, rule change,
// role change) confirmed gated and logged." Every mutation below is
// audit-logged on success, keyed by the job_post_id it applies to (rule
// rows don't have their own stable id worth auditing against once removed
// — the post they belong to is the durable, meaningful entity for "what
// changed"). `userId` is always the caller's own server-resolved admin
// session id (services/admin/*'s established pattern — see
// services/admin/job-notifications.ts).

export async function upsertAgeRuleUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = ageRuleSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  if (
    parsed.data.minAge !== undefined &&
    parsed.data.maxAge !== undefined &&
    parsed.data.maxAge < parsed.data.minAge
  ) {
    return {
      success: false,
      error: "Maximum age must be at or above the minimum.",
      fieldErrors: { maxAge: ["Must be >= minAge"] },
    };
  }
  const { error } = await rules.upsertAgeRule(supabase, {
    jobPostId: parsed.data.jobPostId,
    minAge: parsed.data.minAge ?? null,
    maxAge: parsed.data.maxAge ?? null,
    ageCutoffDate: parsed.data.ageCutoffDate,
    relaxationCombinationMode: parsed.data.relaxationCombinationMode,
  });
  if (error) return { success: false, error: "Could not save age rule." };
  await recordAuditEvent({
    actorId: userId,
    eventType: "job_age_rule.upsert",
    entityTable: "job_age_rules",
    entityId: parsed.data.jobPostId,
  });
  return { success: true };
}

export async function addRelaxationUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = relaxationSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  if (parsed.data.categoryId && !(await categoryIsActive(supabase, parsed.data.categoryId))) {
    return { success: false, error: "Selected category is no longer valid." };
  }
  if (parsed.data.statusId && !(await statusIsActive(supabase, parsed.data.statusId))) {
    return { success: false, error: "Selected status is no longer valid." };
  }
  const { error } = await rules.addRelaxation(supabase, parsed.data);
  if (error)
    return {
      success: false,
      error: "Could not add relaxation. It may already exist for this post.",
    };
  await recordAuditEvent({
    actorId: userId,
    eventType: "job_relaxation.add",
    entityTable: "job_relaxations",
    entityId: parsed.data.jobPostId,
    metadata: { categoryId: parsed.data.categoryId, statusId: parsed.data.statusId },
  });
  return { success: true };
}

export async function removeRelaxationUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = removeRuleRowSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { error } = await rules.removeRelaxation(supabase, parsed.data.id);
  if (error) return { success: false, error: "Could not remove relaxation." };
  await recordAuditEvent({
    actorId: userId,
    eventType: "job_relaxation.remove",
    entityTable: "job_relaxations",
    entityId: parsed.data.id,
  });
  return { success: true };
}

export async function addStatusRequirementUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = statusRequirementSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  if (!(await statusIsActive(supabase, parsed.data.statusId))) {
    return { success: false, error: "Selected status is no longer valid." };
  }
  const { error } = await rules.addStatusRequirement(supabase, parsed.data);
  if (error)
    return {
      success: false,
      error: "Could not add status requirement. It may already exist for this post.",
    };
  await recordAuditEvent({
    actorId: userId,
    eventType: "job_status_requirement.add",
    entityTable: "job_status_requirements",
    entityId: parsed.data.jobPostId,
    metadata: { statusId: parsed.data.statusId, requirementType: parsed.data.requirementType },
  });
  return { success: true };
}

export async function removeStatusRequirementUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = removeRuleRowSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { error } = await rules.removeStatusRequirement(supabase, parsed.data.id);
  if (error) return { success: false, error: "Could not remove status requirement." };
  await recordAuditEvent({
    actorId: userId,
    eventType: "job_status_requirement.remove",
    entityTable: "job_status_requirements",
    entityId: parsed.data.id,
  });
  return { success: true };
}

export async function upsertStateScopeUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = stateScopeSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  const { error } = await rules.upsertStateScope(supabase, parsed.data);
  if (error) return { success: false, error: "Could not save state scope." };
  await recordAuditEvent({
    actorId: userId,
    eventType: "job_state_scope.upsert",
    entityTable: "job_state_scope",
    entityId: parsed.data.jobPostId,
    metadata: { scopeType: parsed.data.scopeType },
  });
  return { success: true };
}

export async function addStateScopeStateUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = stateScopeStateSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  if (!(await stateIsActive(supabase, parsed.data.stateId))) {
    return { success: false, error: "Selected state is no longer valid." };
  }
  const { error } = await rules.addStateScopeState(supabase, parsed.data);
  if (error) return { success: false, error: "Could not add state. It may already be listed." };
  await recordAuditEvent({
    actorId: userId,
    eventType: "job_state_scope_state.add",
    entityTable: "job_state_scope_states",
    entityId: parsed.data.jobStateScopeId,
    metadata: { stateId: parsed.data.stateId },
  });
  return { success: true };
}

export async function removeStateScopeStateUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = removeRuleRowSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { error } = await rules.removeStateScopeState(supabase, parsed.data.id);
  if (error) return { success: false, error: "Could not remove state." };
  await recordAuditEvent({
    actorId: userId,
    eventType: "job_state_scope_state.remove",
    entityTable: "job_state_scope_states",
    entityId: parsed.data.id,
  });
  return { success: true };
}

export async function upsertGenderRuleUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = genderRuleSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  const { error } = await rules.upsertGenderRule(supabase, parsed.data);
  if (error) return { success: false, error: "Could not save gender rule." };
  await recordAuditEvent({
    actorId: userId,
    eventType: "job_gender_rule.upsert",
    entityTable: "job_gender_rules",
    entityId: parsed.data.jobPostId,
    metadata: { allowedGender: parsed.data.allowedGender },
  });
  return { success: true };
}

export async function upsertExperienceRuleUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = experienceRuleSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  if (
    parsed.data.minYears !== undefined &&
    parsed.data.maxYears !== undefined &&
    parsed.data.maxYears < parsed.data.minYears
  ) {
    return {
      success: false,
      error: "Maximum years must be at or above the minimum.",
      fieldErrors: { maxYears: ["Must be >= minYears"] },
    };
  }
  const { error } = await rules.upsertExperienceRule(supabase, {
    jobPostId: parsed.data.jobPostId,
    minYears: parsed.data.minYears ?? null,
    maxYears: parsed.data.maxYears ?? null,
    domainNote: parsed.data.domainNote ?? null,
    asOfDate: parsed.data.asOfDate ?? null,
  });
  if (error) return { success: false, error: "Could not save experience rule." };
  await recordAuditEvent({
    actorId: userId,
    eventType: "job_experience_rule.upsert",
    entityTable: "job_experience_rules",
    entityId: parsed.data.jobPostId,
  });
  return { success: true };
}

export async function addQualificationRequirementUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = qualificationRequirementSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  if (
    parsed.data.qualificationId &&
    !(await qualificationExists(supabase, parsed.data.qualificationId))
  ) {
    return { success: false, error: "Selected qualification is no longer valid." };
  }
  if (
    parsed.data.educationLevelId &&
    !(await educationLevelIsActive(supabase, parsed.data.educationLevelId))
  ) {
    return { success: false, error: "Selected education level is no longer valid." };
  }
  const { error } = await rules.addQualificationRequirement(supabase, parsed.data);
  if (error) return { success: false, error: "Could not add qualification requirement." };
  await recordAuditEvent({
    actorId: userId,
    eventType: "job_qualification_requirement.add",
    entityTable: "job_qualification_requirements",
    entityId: parsed.data.jobPostId,
    metadata: {
      qualificationId: parsed.data.qualificationId,
      educationLevelId: parsed.data.educationLevelId,
      groupId: parsed.data.groupId,
    },
  });
  return { success: true };
}

export async function removeQualificationRequirementUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = removeRuleRowSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { error } = await rules.removeQualificationRequirement(supabase, parsed.data.id);
  if (error) return { success: false, error: "Could not remove qualification requirement." };
  await recordAuditEvent({
    actorId: userId,
    eventType: "job_qualification_requirement.remove",
    entityTable: "job_qualification_requirements",
    entityId: parsed.data.id,
  });
  return { success: true };
}
