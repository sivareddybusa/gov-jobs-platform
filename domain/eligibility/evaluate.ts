import { evaluateAge } from "./age";
import { evaluateExperience } from "./experience";
import { evaluateGender } from "./gender";
import { evaluateQualification } from "./qualification";
import { evaluateStateDomicile } from "./state";
import { evaluateStatus } from "./status";
import type {
  DimensionResult,
  EligibilityProfile,
  EligibilityResult,
  EligibilityStatus,
  JobEligibilityRules,
} from "./types";

/**
 * Evaluates a profile against one job post's structured rules. Pure,
 * deterministic, AI-free (ELIGIBILITY_ENGINE.md §1). Evaluation order does
 * not affect the result — aggregation (below) is commutative: not_eligible
 * dominates needs_verification dominates eligible (§2, §4).
 */
export function evaluateEligibility(
  profile: EligibilityProfile,
  rules: JobEligibilityRules,
): EligibilityResult {
  const dimensions: DimensionResult[] = [
    evaluateAge(profile, rules.ageRule, rules.relaxations),
    evaluateStatus(profile, rules.statusRequirements),
    evaluateStateDomicile(profile, rules.stateScope),
    evaluateGender(profile, rules.genderRule),
    evaluateExperience(profile, rules.experienceRule),
    evaluateQualification(profile, rules.qualificationRequirements),
  ];

  const status: EligibilityStatus = dimensions.some((d) => d.outcome === "fail")
    ? "not_eligible"
    : dimensions.some((d) => d.outcome === "unknown")
      ? "needs_verification"
      : "eligible";

  return { status, dimensions };
}
