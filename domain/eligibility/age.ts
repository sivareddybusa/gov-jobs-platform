import { calculateAge } from "./date";
import type { AgeRule, DimensionResult, EligibilityProfile, Relaxation } from "./types";

type RelaxationResolution =
  | { kind: "none" }
  | { kind: "resolved"; years: number; appliedLabels: string[] }
  | { kind: "unsupported"; conflictingLabels: string[] };

/**
 * Resolves the applicable age relaxation for this profile+post, per
 * ELIGIBILITY_ENGINE.md §7: zero applicable relaxations => 0 (no
 * ambiguity); exactly one => used directly (no stacking decision); two or
 * more => governed by the post's `relaxationCombinationMode`, and
 * `unsupported`/unset with 2+ candidates is always ambiguous — never
 * guessed between additive and max_of.
 */
function resolveRelaxation(
  profile: EligibilityProfile,
  relaxations: Relaxation[],
  mode: AgeRule["relaxationCombinationMode"],
): RelaxationResolution {
  const applicable = relaxations.filter((r) => {
    if (r.categoryId) return r.categoryId === profile.categoryId;
    if (r.statusId) return profile.statusIds.includes(r.statusId);
    return false;
  });

  if (applicable.length === 0) return { kind: "none" };

  const lowConfidence = applicable.filter((r) => !r.isConfident);
  if (lowConfidence.length > 0) {
    return {
      kind: "unsupported",
      conflictingLabels: applicable.map((r) => r.categoryId ?? r.statusId ?? "unknown"),
    };
  }

  if (applicable.length === 1) {
    const only = applicable[0]!;
    return {
      kind: "resolved",
      years: only.ageRelaxationYears,
      appliedLabels: [only.categoryId ?? only.statusId ?? "unknown"],
    };
  }

  const labels = applicable.map((r) => r.categoryId ?? r.statusId ?? "unknown");
  if (mode === "additive") {
    return {
      kind: "resolved",
      years: applicable.reduce((sum, r) => sum + r.ageRelaxationYears, 0),
      appliedLabels: labels,
    };
  }
  if (mode === "max_of") {
    return {
      kind: "resolved",
      years: Math.max(...applicable.map((r) => r.ageRelaxationYears)),
      appliedLabels: labels,
    };
  }
  // mutually_exclusive with 2+ candidates indicates a taxonomy inconsistency
  // (§7 step 4) and, like `unsupported`/unset, must not be guessed.
  return { kind: "unsupported", conflictingLabels: labels };
}

export function evaluateAge(
  profile: EligibilityProfile,
  rule: AgeRule | null,
  relaxations: Relaxation[],
): DimensionResult {
  if (!rule) {
    return { dimension: "age", outcome: "pass", reasons: ["No age restriction for this post."] };
  }

  if (!rule.isConfident) {
    return {
      dimension: "age",
      outcome: "unknown",
      reasons: ["This post's age rule could not be confidently extracted and needs review."],
    };
  }

  const age = calculateAge(profile.dateOfBirth, rule.ageCutoffDate);
  if (age === null) {
    return {
      dimension: "age",
      outcome: "unknown",
      reasons: profile.dateOfBirth
        ? ["Date of birth appears invalid relative to this post's cutoff date."]
        : ["Date of birth is not set on your profile."],
    };
  }

  const relaxation = resolveRelaxation(profile, relaxations, rule.relaxationCombinationMode);
  if (relaxation.kind === "unsupported") {
    return {
      dimension: "age",
      outcome: "unknown",
      reasons: [
        `Multiple relaxations may apply (${relaxation.conflictingLabels.join(", ")}) but this notification's stacking rule could not be confidently determined.`,
      ],
    };
  }

  const relaxationYears = relaxation.kind === "resolved" ? relaxation.years : 0;
  const effectiveMaxAge = rule.maxAge === null ? null : rule.maxAge + relaxationYears;

  const reasons: string[] = [`Your age as of the cutoff date: ${age}.`];
  let outcome: DimensionResult["outcome"] = "pass";

  if (rule.minAge !== null) {
    if (age < rule.minAge) {
      outcome = "fail";
      reasons.push(`Minimum required age: ${rule.minAge}.`);
    } else {
      reasons.push(`Minimum required age: ${rule.minAge}.`);
    }
  }

  if (rule.maxAge !== null) {
    const relaxationNote =
      relaxation.kind === "resolved"
        ? ` (base ${rule.maxAge} + relaxation ${relaxationYears} for ${relaxation.appliedLabels.join(", ")})`
        : "";
    if (age > (effectiveMaxAge as number)) {
      outcome = "fail";
      reasons.push(`Maximum permitted age: ${effectiveMaxAge}${relaxationNote}.`);
    } else {
      reasons.push(`Maximum permitted age: ${effectiveMaxAge}${relaxationNote}.`);
    }
  }

  if (rule.minAge === null && rule.maxAge === null) {
    reasons.push("No minimum or maximum age restriction stated.");
  }

  return { dimension: "age", outcome, reasons };
}
