import type { DimensionResult, EligibilityProfile, StateScope } from "./types";

/** State/domicile dimension (ELIGIBILITY_ENGINE.md §10). */
export function evaluateStateDomicile(
  profile: EligibilityProfile,
  scope: StateScope | null,
): DimensionResult {
  if (!scope || scope.scopeType === "all_india") {
    return {
      dimension: "state_domicile",
      outcome: "pass",
      reasons: ["Open to all states (all-India)."],
    };
  }

  if (scope.scopeType === "specific_states") {
    if (!profile.stateId) {
      return {
        dimension: "state_domicile",
        outcome: "unknown",
        reasons: [
          "This post is restricted to specific states, but your state is not set on your profile.",
        ],
      };
    }
    const matches = scope.stateIds.includes(profile.stateId);
    return {
      dimension: "state_domicile",
      outcome: matches ? "pass" : "fail",
      reasons: [
        matches
          ? "Your state matches this post's eligible states."
          : "Your state is not among this post's eligible states.",
      ],
    };
  }

  // domicile_required — current state is never consulted, and domicile is
  // never assumed to equal current state (ELIGIBILITY_ENGINE.md §10).
  if (!profile.domicileStateId) {
    return {
      dimension: "state_domicile",
      outcome: "unknown",
      reasons: [
        "This post requires domicile in a specific state, but your domicile state is not set on your profile.",
      ],
    };
  }
  const matches = scope.stateIds.includes(profile.domicileStateId);
  return {
    dimension: "state_domicile",
    outcome: matches ? "pass" : "fail",
    reasons: [
      matches
        ? "Your domicile state matches this post's required domicile."
        : "Your domicile state does not match this post's required domicile.",
    ],
  };
}
