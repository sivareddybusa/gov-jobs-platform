import { z } from "zod";

// Phase 7 (ingestion). Schema for the AI extraction model's candidate
// output — SECURITY.md §12/PRD.md §18: this is untrusted output that must
// pass schema validation before it's trusted as even a *candidate*.
// Deliberately: every reference-shaped field here is free TEXT (a name/
// description the model read from the document), never a UUID — the model
// has no access to this platform's reference tables and must never be
// asked to invent one; mapping text to an actual categories/states/
// qualifications/statuses row id is a human reviewer's job
// (services/admin/job-imports.ts's review step), not the model's.

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const extractedAgeRuleSchema = z.object({
  minAge: z.number().int().min(0).max(100).nullable(),
  maxAge: z.number().int().min(0).max(100).nullable(),
  ageCutoffDate: z.iso.date().nullable(),
});

export const extractedRelaxationSchema = z.object({
  // Free text as the model read it, e.g. "OBC", "SC/ST", "PwBD" — never a
  // category_id/status_id; the reviewer decides which reference row (if
  // any) this actually refers to.
  labelText: z.string().min(1).max(200),
  ageRelaxationYears: z.number().int().min(0).max(30),
});

export const extractedPostSchema = z.object({
  title: z.string().min(1).max(500),
  vacancyCount: z.number().int().min(0).nullable(),
});

export const extractedQualificationGroupSchema = z.object({
  // Free text describing one AND-group's requirement, e.g. "Bachelor's
  // degree in Engineering, OR equivalent diploma" — the reviewer splits
  // this into actual OR-alternatives against real qualification rows.
  descriptionText: z.string().min(1).max(500),
});

export const jobExtractionSchema = z.object({
  title: z.string().min(1).max(500),
  organizationNameText: z.string().min(1).max(300),
  departmentNameText: z.string().max(300).nullable(),
  description: z.string().max(10_000).nullable(),
  recruitmentTypeGuess: z
    .enum(["direct", "promotion", "contract", "deputation", "other"])
    .nullable(),
  notificationDate: z.iso.date().nullable(),
  applicationStartDate: z.iso.date().nullable(),
  applicationEndDate: z.iso.date().nullable(),
  // The model may report a URL it found in the document text, but this is
  // NEVER trusted as the actual official URL without independent domain
  // verification against the source's official_domain
  // (services/admin/job-notifications.ts's verifyOfficialUrlsAgainstSource)
  // — SECURITY.md §12's "fabricated URLs" mitigation applies here exactly.
  officialAdvertisementUrlText: z.string().max(2000).nullable(),
  officialApplicationUrlText: z.string().max(2000).nullable(),
  posts: z.array(extractedPostSchema).max(50),
  ageRule: extractedAgeRuleSchema.nullable(),
  relaxations: z.array(extractedRelaxationSchema).max(20),
  qualificationGroups: z.array(extractedQualificationGroupSchema).max(20),
  stateScopeText: z.string().max(500).nullable(),
  genderGuess: z.enum(["all", "male", "female", "other"]).nullable(),
  experienceMinYears: z.number().min(0).max(60).nullable(),
  experienceMaxYears: z.number().min(0).max(60).nullable(),
  experienceDomainNoteText: z.string().max(500).nullable(),
  // The model's own notes about anything it found ambiguous or couldn't
  // confidently read — surfaced to the reviewer verbatim, never acted on
  // by application logic (it's informational text, not a control signal).
  extractionNotes: z.string().max(2000).nullable(),
});
export type JobExtraction = z.infer<typeof jobExtractionSchema>;

/**
 * Business validation beyond shape (SECURITY.md §12: "business validation
 * ... rejects implausible values regardless of schema validity"). Returns
 * a list of human-readable problems; an empty list means the extraction is
 * plausible enough to route to review (never "safe to auto-publish" —
 * review is still mandatory regardless).
 */
export function validateExtractionPlausibility(extraction: JobExtraction): string[] {
  const problems: string[] = [];
  const age = extraction.ageRule;
  if (age && age.minAge !== null && age.maxAge !== null && age.minAge > age.maxAge) {
    problems.push("Extracted age rule has a minimum age greater than the maximum age.");
  }
  if (
    extraction.applicationStartDate &&
    extraction.applicationEndDate &&
    extraction.applicationStartDate > extraction.applicationEndDate
  ) {
    problems.push("Extracted application end date is before the start date.");
  }
  if (
    extraction.experienceMinYears !== null &&
    extraction.experienceMaxYears !== null &&
    extraction.experienceMinYears > extraction.experienceMaxYears
  ) {
    problems.push("Extracted experience rule has a minimum greater than the maximum.");
  }
  if (extraction.posts.length === 0) {
    problems.push("No individual post could be extracted from the document.");
  }
  return problems;
}

export const startIngestionSchema = z.object({
  jobSourceId: z.uuid("Select a source"),
  documentUrl: z
    .url("Enter a valid https:// document URL")
    .refine((v) => v.startsWith("https://"), "Must use https://"),
});
export type StartIngestionInput = z.infer<typeof startIngestionSchema>;

export const rejectImportSchema = z.object({
  id: z.uuid(),
  reviewNotes: z.preprocess(emptyToUndefined, z.string().trim().max(2000).optional()),
});
export type RejectImportInput = z.infer<typeof rejectImportSchema>;
