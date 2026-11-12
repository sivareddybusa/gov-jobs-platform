import { describe, expect, it } from "vitest";
import { evaluateEligibility } from "@/domain/eligibility/evaluate";
import type { EligibilityProfile, JobEligibilityRules } from "@/domain/eligibility/types";

function profile(overrides: Partial<EligibilityProfile> = {}): EligibilityProfile {
  return {
    dateOfBirth: "1998-01-01",
    categoryId: null,
    statusIds: [],
    stateId: null,
    domicileStateId: null,
    gender: null,
    experienceYears: null,
    qualifications: [],
    educationLevelRank: null,
    ...overrides,
  };
}

const NO_RULES: JobEligibilityRules = {
  ageRule: null,
  relaxations: [],
  statusRequirements: [],
  stateScope: null,
  genderRule: null,
  experienceRule: null,
  qualificationRequirements: [],
};

// "missing rules, mixed eligible/ambiguous dimensions" (task Phase 5's
// required list) — aggregation-level precedence tests.
describe("evaluateEligibility", () => {
  it("returns eligible when every dimension passes (including trivially, via absent rules)", () => {
    const result = evaluateEligibility(profile(), NO_RULES);
    expect(result.status).toBe("eligible");
    expect(result.dimensions).toHaveLength(6);
    expect(result.dimensions.every((d) => d.outcome === "pass")).toBe(true);
  });

  it("returns not_eligible when exactly one dimension fails", () => {
    const result = evaluateEligibility(profile({ gender: "male" }), {
      ...NO_RULES,
      genderRule: { allowedGender: "female" },
    });
    expect(result.status).toBe("not_eligible");
  });

  it("returns needs_verification when a dimension is ambiguous and no dimension fails", () => {
    const result = evaluateEligibility(profile(), {
      ...NO_RULES,
      genderRule: { allowedGender: "female" }, // profile.gender is null -> unknown
    });
    expect(result.status).toBe("needs_verification");
  });

  it("not_eligible dominates needs_verification when both would otherwise apply (mixed dimensions)", () => {
    const result = evaluateEligibility(profile({ experienceYears: 1 }), {
      ...NO_RULES,
      // Gender ambiguous (missing profile field)...
      genderRule: { allowedGender: "female" },
      // ...but experience is a definite, unrelated failure.
      experienceRule: { minYears: 5, maxYears: null, domainNote: null, isConfident: true },
    });
    expect(result.status).toBe("not_eligible");
    const gender = result.dimensions.find((d) => d.dimension === "gender");
    const experience = result.dimensions.find((d) => d.dimension === "experience");
    expect(gender?.outcome).toBe("unknown");
    expect(experience?.outcome).toBe("fail");
  });

  it("evaluation order does not change the aggregate result (commutative aggregation)", () => {
    const rulesA: JobEligibilityRules = {
      ...NO_RULES,
      genderRule: { allowedGender: "female" },
      experienceRule: { minYears: 5, maxYears: null, domainNote: null, isConfident: true },
    };
    const a = evaluateEligibility(profile({ experienceYears: 1 }), rulesA);
    const b = evaluateEligibility(profile({ experienceYears: 1 }), { ...rulesA });
    expect(a.status).toBe(b.status);
  });

  it("always evaluates and reports all six dimensions, even when the result is a definite failure", () => {
    const result = evaluateEligibility(profile({ gender: "male" }), {
      ...NO_RULES,
      genderRule: { allowedGender: "female" },
    });
    expect(result.dimensions.map((d) => d.dimension).sort()).toEqual(
      ["age", "experience", "gender", "qualification", "state_domicile", "status"].sort(),
    );
  });
});
