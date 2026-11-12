import type { DimensionResult, EligibilityProfile, QualificationRequirement } from "./types";

type GroupOutcome = "pass" | "fail" | "unknown";

function evaluateGroup(
  profile: EligibilityProfile,
  rows: QualificationRequirement[],
): GroupOutcome {
  // A low-confidence extraction on any row in the group makes the whole
  // group's requirement untrustworthy (ELIGIBILITY_ENGINE.md §13 point 8) —
  // overrides otherwise-clear-cut matching below.
  if (
    rows.some((r) => r.verificationStatus === "ambiguous" || r.verificationStatus === "unsupported")
  ) {
    return "unknown";
  }

  const satisfied = rows.some((row) => {
    if (row.qualificationId) {
      if (row.isGeneric) {
        // Generic: satisfied by any held qualification at or above this
        // requirement's own education-level rank — not an exact match.
        if (row.requiredEducationLevelRank === null) return false;
        return profile.qualifications.some(
          (q) => q.educationLevelRank >= row.requiredEducationLevelRank!,
        );
      }
      // Specific: exact qualification match only (no equivalence table in MVP).
      return profile.qualifications.some((q) => q.qualificationId === row.qualificationId);
    }
    // Bare education-level-only row.
    if (row.requiredEducationLevelRank === null) return false;
    return (
      profile.educationLevelRank !== null &&
      profile.educationLevelRank >= row.requiredEducationLevelRank
    );
  });

  return satisfied ? "pass" : "fail";
}

/** Qualification dimension: AND across groups, OR within a group (ELIGIBILITY_ENGINE.md §13). */
export function evaluateQualification(
  profile: EligibilityProfile,
  requirements: QualificationRequirement[],
): DimensionResult {
  if (requirements.length === 0) {
    return {
      dimension: "qualification",
      outcome: "pass",
      reasons: ["No qualification requirement for this post."],
    };
  }

  if (profile.qualifications.length === 0 && profile.educationLevelRank === null) {
    return {
      dimension: "qualification",
      outcome: "unknown",
      reasons: [
        "This post has qualification requirements, but no qualification or education level is set on your profile.",
      ],
    };
  }

  const groups = new Map<number, QualificationRequirement[]>();
  for (const row of requirements) {
    const existing = groups.get(row.groupId);
    if (existing) existing.push(row);
    else groups.set(row.groupId, [row]);
  }

  const reasons: string[] = [];
  let anyFail = false;
  let anyUnknown = false;

  for (const [groupId, rows] of groups) {
    const outcome = evaluateGroup(profile, rows);
    if (outcome === "fail") {
      anyFail = true;
      reasons.push(`Qualification requirement group ${groupId}: not satisfied.`);
    } else if (outcome === "unknown") {
      anyUnknown = true;
      reasons.push(
        `Qualification requirement group ${groupId}: could not be confidently verified.`,
      );
    } else {
      reasons.push(`Qualification requirement group ${groupId}: satisfied.`);
    }
  }

  // A definite failure on one group is reported even if another group is
  // separately ambiguous (ELIGIBILITY_ENGINE.md §2's precedence rule,
  // applied within this dimension).
  if (anyFail) return { dimension: "qualification", outcome: "fail", reasons };
  if (anyUnknown) return { dimension: "qualification", outcome: "unknown", reasons };
  return { dimension: "qualification", outcome: "pass", reasons };
}
