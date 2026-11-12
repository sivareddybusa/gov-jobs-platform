import type { DimensionResult, EligibilityProfile, StatusRequirement } from "./types";

/**
 * Status-*gating* dimension (CLAUDE.md §19, DATABASE.md §14A) — distinct
 * from age relaxation (age.ts). Only `requirement_type = 'required'` is a
 * hard gate; `optional`/`preference` never block eligibility on their own.
 */
export function evaluateStatus(
  profile: EligibilityProfile,
  requirements: StatusRequirement[],
): DimensionResult {
  const required = requirements.filter((r) => r.requirementType === "required");

  if (required.length === 0) {
    return {
      dimension: "status",
      outcome: "pass",
      reasons: ["No special status is required for this post."],
    };
  }

  const lowConfidence = required.filter((r) => !r.isConfident);
  if (lowConfidence.length > 0) {
    return {
      dimension: "status",
      outcome: "unknown",
      reasons: [
        "This post's status requirement could not be confidently extracted and needs review.",
      ],
    };
  }

  // Each `required` row has no OR-grouping mechanism in the schema (unlike
  // qualification requirements' group_id) — every required row is an
  // independent, mandatory condition, so all must be held (AND).
  const unmet = required.filter((r) => !profile.statusIds.includes(r.statusId));
  if (unmet.length === 0) {
    return {
      dimension: "status",
      outcome: "pass",
      reasons: ["You hold the status required for this post."],
    };
  }

  return {
    dimension: "status",
    outcome: "fail",
    reasons: ["This post is restricted to candidates holding a specific status you do not hold."],
  };
}
