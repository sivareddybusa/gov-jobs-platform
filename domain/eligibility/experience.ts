import type { DimensionResult, EligibilityProfile, ExperienceRule } from "./types";

/** Experience dimension (ELIGIBILITY_ENGINE.md §12). */
export function evaluateExperience(
  profile: EligibilityProfile,
  rule: ExperienceRule | null,
): DimensionResult {
  if (!rule) {
    return {
      dimension: "experience",
      outcome: "pass",
      reasons: ["No experience requirement for this post."],
    };
  }

  if (!rule.isConfident) {
    return {
      dimension: "experience",
      outcome: "unknown",
      reasons: [
        "This post's experience requirement could not be confidently extracted and needs review.",
      ],
    };
  }

  // A domain-specific qualifier (e.g. "in a teaching hospital") is never
  // machine-matched — any non-null domainNote always routes to
  // needs_verification for this dimension, regardless of the numeric check.
  if (rule.domainNote) {
    return {
      dimension: "experience",
      outcome: "unknown",
      reasons: [
        `This post requires domain-specific experience ("${rule.domainNote}") that cannot be automatically verified.`,
      ],
    };
  }

  if (rule.minYears === null && rule.maxYears === null) {
    return {
      dimension: "experience",
      outcome: "pass",
      reasons: ["No minimum or maximum experience stated."],
    };
  }

  if (profile.experienceYears === null) {
    return {
      dimension: "experience",
      outcome: "unknown",
      reasons: [
        "This post requires work experience, but your experience is not set on your profile.",
      ],
    };
  }

  const reasons: string[] = [`Your experience: ${profile.experienceYears} years.`];
  let outcome: DimensionResult["outcome"] = "pass";

  if (rule.minYears !== null) {
    reasons.push(`Minimum required experience: ${rule.minYears} years.`);
    if (profile.experienceYears < rule.minYears) outcome = "fail";
  }
  if (rule.maxYears !== null) {
    reasons.push(`Maximum permitted experience: ${rule.maxYears} years.`);
    if (profile.experienceYears > rule.maxYears) outcome = "fail";
  }

  return { dimension: "experience", outcome, reasons };
}
