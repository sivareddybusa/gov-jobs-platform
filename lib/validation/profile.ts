import { z } from "zod";

// Phase 4 (Profile + Qualifications). Mirrors lib/validation/onboarding.ts's
// pattern: category/state/education/status/qualification fields are always
// submitted as reference-table UUIDs, never free text (DATABASE.md §5-§7,
// §5A). This schema only checks shape; whether an ID actually exists (and is
// currently active) is re-checked against the database in
// services/profile/*, since Zod alone can't know current reference data.

const currentYear = new Date().getUTCFullYear();

// Empty strings arrive from optional <select>/<input> form fields that were
// left unset — normalize them to `undefined` before the optional/uuid
// validators run, rather than rejecting "" as an invalid UUID.
// `FormData.get()` can also return null (not "") for a <select> whose only
// option is a disabled placeholder — same "not provided" case, must be
// treated identically (see lib/validation/admin.ts's identical helper for
// the concrete case this was found from).
const emptyToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;

// DATABASE.md §4's exact CHECK constraint values — the only gender values
// the schema will accept, kept in lockstep with the migration rather than
// invented independently (PRD.md §7).
export const GENDER_VALUES = ["male", "female", "other", "prefer_not_to_say"] as const;

export const profileEditSchema = z.object({
  fullName: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1).max(200, "Full name is too long").optional(),
  ),
  dateOfBirth: z.iso
    .date("Enter a valid date (YYYY-MM-DD)")
    .refine((value) => new Date(`${value}T00:00:00Z`).getTime() <= Date.now(), {
      message: "Date of birth cannot be in the future",
    })
    .refine((value) => Number(value.slice(0, 4)) >= 1900, {
      message: "Enter a valid date of birth",
    }),
  categoryId: z.uuid("Select a category"),
  stateId: z.uuid("Select a state"),
  domicileStateId: z.preprocess(emptyToUndefined, z.uuid("Select a valid state").optional()),
  educationLevelId: z.uuid("Select an education level"),
  gender: z.preprocess(emptyToUndefined, z.enum(GENDER_VALUES, "Select a valid option").optional()),
  experienceYears: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number("Enter a number")
      .nonnegative("Experience cannot be negative")
      .max(60, "Enter a plausible number of years")
      .optional(),
  ),
});
export type ProfileEditInput = z.infer<typeof profileEditSchema>;

export const addQualificationSchema = z.object({
  qualificationId: z.uuid("Select a qualification"),
  institution: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1).max(200, "Institution name is too long").optional(),
  ),
  yearCompleted: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number("Enter a valid year")
      .int("Enter a valid year")
      .min(1950, "Enter a plausible year")
      .max(currentYear, "Year cannot be in the future")
      .optional(),
  ),
});
export type AddQualificationInput = z.infer<typeof addQualificationSchema>;

export const removeQualificationSchema = z.object({
  id: z.uuid("Invalid qualification reference"),
});
export type RemoveQualificationInput = z.infer<typeof removeQualificationSchema>;

export const addStatusSchema = z.object({
  statusId: z.uuid("Select a status"),
});
export type AddStatusInput = z.infer<typeof addStatusSchema>;

export const removeStatusSchema = z.object({
  id: z.uuid("Invalid status reference"),
});
export type RemoveStatusInput = z.infer<typeof removeStatusSchema>;
