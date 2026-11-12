import type { DimensionResult, EligibilityProfile, GenderRule } from "./types";

/** Gender dimension (ELIGIBILITY_ENGINE.md §11). */
export function evaluateGender(
  profile: EligibilityProfile,
  rule: GenderRule | null,
): DimensionResult {
  if (!rule || rule.allowedGender === "all") {
    return { dimension: "gender", outcome: "pass", reasons: ["Open to all genders."] };
  }

  if (!profile.gender) {
    return {
      dimension: "gender",
      outcome: "unknown",
      reasons: ["This post is restricted by gender, but your gender is not set on your profile."],
    };
  }

  const matches = profile.gender === rule.allowedGender;
  return {
    dimension: "gender",
    outcome: matches ? "pass" : "fail",
    reasons: [
      matches
        ? `Restricted to ${rule.allowedGender} — matches your profile.`
        : `Restricted to ${rule.allowedGender}.`,
    ],
  };
}
