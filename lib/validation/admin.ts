import { z } from "zod";

// Phase 6 (Job Data + Admin Management). Same pattern as
// lib/validation/profile.ts: reference ids are always UUIDs, re-verified
// against the database server-side in services/admin/* — Zod here only
// checks shape.

// `FormData.get()` returns null (not "") for a <select> whose only option is
// a disabled placeholder — e.g. an optional dropdown with zero real options
// yet (departmentId before an organization has any departments). Both cases
// mean "not provided" and must be treated identically, or z.uuid().optional()
// only catches the empty-string case and rejects the null one as an invalid
// UUID.
const emptyToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;

export const ORG_TYPE_VALUES = ["central", "state", "psu", "autonomous_body", "other"] as const;

export const organizationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(300),
  shortCode: z.preprocess(emptyToUndefined, z.string().trim().max(50).optional()),
  orgType: z.enum(ORG_TYPE_VALUES, "Select a valid organization type"),
  stateId: z.preprocess(emptyToUndefined, z.uuid("Select a valid state").optional()),
  websiteUrl: z.preprocess(
    emptyToUndefined,
    z
      .url("Enter a valid https:// URL")
      .refine((v) => v.startsWith("https://"), "Must use https://")
      .optional(),
  ),
});
export type OrganizationInput = z.infer<typeof organizationSchema>;

export const departmentSchema = z.object({
  organizationId: z.uuid("Select an organization"),
  name: z.string().trim().min(1, "Name is required").max(300),
});
export type DepartmentInput = z.infer<typeof departmentSchema>;

export const SOURCE_TYPE_VALUES = [
  "official_website",
  "official_portal",
  "official_pdf",
  "api",
  "manual_admin_entry",
] as const;

export const jobSourceSchema = z.object({
  organizationId: z.preprocess(emptyToUndefined, z.uuid("Select a valid organization").optional()),
  name: z.string().trim().min(1, "Name is required").max(300),
  officialDomain: z
    .string()
    .trim()
    .min(1, "Official domain is required")
    .max(255)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "Enter a plain domain, e.g. ssc.nic.in"),
  sourceType: z.enum(SOURCE_TYPE_VALUES, "Select a valid source type"),
  sourceUrl: z
    .url("Enter a valid https:// URL")
    .refine((v) => v.startsWith("https://"), "Must use https://"),
});
export type JobSourceInput = z.infer<typeof jobSourceSchema>;

export const RECRUITMENT_TYPE_VALUES = [
  "direct",
  "promotion",
  "contract",
  "deputation",
  "other",
] as const;

const httpsUrl = (message: string) =>
  z.url(message).refine((v) => v.startsWith("https://"), "Must use https://");

export const jobNotificationSchema = z
  .object({
    organizationId: z.uuid("Select an organization"),
    departmentId: z.preprocess(emptyToUndefined, z.uuid("Select a valid department").optional()),
    sourceId: z.uuid("Select a source"),
    title: z.string().trim().min(1, "Title is required").max(500),
    description: z.preprocess(emptyToUndefined, z.string().trim().max(10_000).optional()),
    recruitmentType: z.enum(RECRUITMENT_TYPE_VALUES, "Select a valid recruitment type"),
    officialAdvertisementUrl: httpsUrl("Enter a valid https:// advertisement URL"),
    officialApplicationUrl: z.preprocess(
      emptyToUndefined,
      httpsUrl("Enter a valid https:// application URL").optional(),
    ),
    notificationDate: z.iso.date("Enter a valid date (YYYY-MM-DD)"),
    applicationStartDate: z.preprocess(
      emptyToUndefined,
      z.iso.date("Enter a valid date").optional(),
    ),
    applicationEndDate: z.preprocess(emptyToUndefined, z.iso.date("Enter a valid date").optional()),
  })
  .refine(
    (data) =>
      !data.applicationEndDate ||
      !data.applicationStartDate ||
      data.applicationEndDate >= data.applicationStartDate,
    {
      message: "Application end date must be on or after the start date",
      path: ["applicationEndDate"],
    },
  );
export type JobNotificationInput = z.infer<typeof jobNotificationSchema>;

export const jobPostSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(500),
    vacancyCount: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).optional()),
    payScaleMin: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional()),
    payScaleMax: z.preprocess(emptyToUndefined, z.coerce.number().nonnegative().optional()),
    payScaleNote: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  })
  .refine(
    (data) =>
      data.payScaleMin === undefined ||
      data.payScaleMax === undefined ||
      data.payScaleMax >= data.payScaleMin,
    {
      message: "Maximum pay scale must be at or above the minimum",
      path: ["payScaleMax"],
    },
  );
export type JobPostInput = z.infer<typeof jobPostSchema>;

export const RELAXATION_MODE_VALUES = [
  "additive",
  "max_of",
  "mutually_exclusive",
  "unsupported",
] as const;

export const ageRuleSchema = z.object({
  jobPostId: z.uuid(),
  minAge: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(100).optional()),
  maxAge: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).max(100).optional()),
  ageCutoffDate: z.iso.date("Enter a valid date (YYYY-MM-DD)"),
  relaxationCombinationMode: z.enum(RELAXATION_MODE_VALUES, "Select a valid mode"),
});
export type AgeRuleInput = z.infer<typeof ageRuleSchema>;

export const relaxationSchema = z
  .object({
    jobPostId: z.uuid(),
    categoryId: z.preprocess(emptyToUndefined, z.uuid().optional()),
    statusId: z.preprocess(emptyToUndefined, z.uuid().optional()),
    ageRelaxationYears: z.coerce.number().int().min(0).max(30),
  })
  .refine((data) => Boolean(data.categoryId) !== Boolean(data.statusId), {
    message: "Select exactly one of category or status",
    path: ["categoryId"],
  });
export type RelaxationInput = z.infer<typeof relaxationSchema>;

export const STATUS_REQUIREMENT_TYPE_VALUES = ["required", "optional", "preference"] as const;

export const statusRequirementSchema = z.object({
  jobPostId: z.uuid(),
  statusId: z.uuid("Select a status"),
  requirementType: z.enum(STATUS_REQUIREMENT_TYPE_VALUES, "Select a valid requirement type"),
});
export type StatusRequirementInput = z.infer<typeof statusRequirementSchema>;

export const STATE_SCOPE_TYPE_VALUES = [
  "all_india",
  "specific_states",
  "domicile_required",
] as const;

export const stateScopeSchema = z.object({
  jobPostId: z.uuid(),
  scopeType: z.enum(STATE_SCOPE_TYPE_VALUES, "Select a valid scope type"),
});
export type StateScopeInput = z.infer<typeof stateScopeSchema>;

export const stateScopeStateSchema = z.object({
  jobStateScopeId: z.uuid(),
  stateId: z.uuid("Select a state"),
});
export type StateScopeStateInput = z.infer<typeof stateScopeStateSchema>;

export const GENDER_RULE_VALUES = ["all", "male", "female", "other"] as const;

export const genderRuleSchema = z.object({
  jobPostId: z.uuid(),
  allowedGender: z.enum(GENDER_RULE_VALUES, "Select a valid option"),
});
export type GenderRuleInput = z.infer<typeof genderRuleSchema>;

export const experienceRuleSchema = z.object({
  jobPostId: z.uuid(),
  minYears: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(60).optional()),
  maxYears: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(60).optional()),
  domainNote: z.preprocess(emptyToUndefined, z.string().trim().max(500).optional()),
  asOfDate: z.preprocess(emptyToUndefined, z.iso.date("Enter a valid date").optional()),
});
export type ExperienceRuleInput = z.infer<typeof experienceRuleSchema>;

export const QUALIFICATION_VERIFICATION_STATUS_VALUES = [
  "verified",
  "ai_extracted",
  "ambiguous",
  "unsupported",
] as const;

export const qualificationRequirementSchema = z
  .object({
    jobPostId: z.uuid(),
    qualificationId: z.preprocess(emptyToUndefined, z.uuid().optional()),
    educationLevelId: z.preprocess(emptyToUndefined, z.uuid().optional()),
    groupId: z.coerce.number().int().min(1).max(20),
    verificationStatus: z.enum(QUALIFICATION_VERIFICATION_STATUS_VALUES, "Select a valid status"),
  })
  .refine((data) => Boolean(data.qualificationId) || Boolean(data.educationLevelId), {
    message: "Select a qualification or a bare education-level minimum",
    path: ["qualificationId"],
  });
export type QualificationRequirementInput = z.infer<typeof qualificationRequirementSchema>;

export const removeRuleRowSchema = z.object({ id: z.uuid("Invalid reference") });
export type RemoveRuleRowInput = z.infer<typeof removeRuleRowSchema>;

export const ADMIN_ROLE_VALUES = ["reviewer", "editor", "admin", "super_admin"] as const;

export const grantRoleSchema = z.object({
  userId: z.uuid("Select a valid user"),
  roleCode: z.enum(ADMIN_ROLE_VALUES, "Select a valid role"),
});
export type GrantRoleInput = z.infer<typeof grantRoleSchema>;

export const revokeRoleSchema = z.object({ id: z.uuid("Invalid reference") });
export type RevokeRoleInput = z.infer<typeof revokeRoleSchema>;
