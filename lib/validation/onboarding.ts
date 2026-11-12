import { z } from "zod";

// Onboarding fields, per PRD.md's MVP profile scope (DOB, category, state,
// education) and DATABASE.md §4's profiles schema. Category/state/education
// are submitted as IDs referencing the authoritative reference tables
// (categories/states/education_levels) — never free text (DATABASE.md §5,
// §6, §7; task Phase 3 §10/§14). This schema only checks shape; whether an
// ID actually exists (and is active) is checked against the database in the
// Server Action, since Zod alone can't know the current reference data.
export const onboardingSchema = z.object({
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
  educationLevelId: z.uuid("Select an education level"),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;
