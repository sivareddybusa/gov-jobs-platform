import { describe, expect, it } from "vitest";
import { evaluateExperience } from "@/domain/eligibility/experience";
import type { EligibilityProfile } from "@/domain/eligibility/types";

function profile(overrides: Partial<EligibilityProfile> = {}): EligibilityProfile {
  return {
    dateOfBirth: null,
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

// "numeric experience, ambiguous experience" (task Phase 5's required list).
describe("evaluateExperience", () => {
  it("passes with no restriction when the post has no experience rule", () => {
    expect(evaluateExperience(profile(), null).outcome).toBe("pass");
  });

  it("needs_verification when the rule is low-confidence", () => {
    const result = evaluateExperience(profile({ experienceYears: 5 }), {
      minYears: 3,
      maxYears: null,
      domainNote: null,
      isConfident: false,
    });
    expect(result.outcome).toBe("unknown");
  });

  it("passes numeric minimum experience", () => {
    const result = evaluateExperience(profile({ experienceYears: 5 }), {
      minYears: 3,
      maxYears: null,
      domainNote: null,
      isConfident: true,
    });
    expect(result.outcome).toBe("pass");
  });

  it("fails when below the numeric minimum", () => {
    const result = evaluateExperience(profile({ experienceYears: 1 }), {
      minYears: 3,
      maxYears: null,
      domainNote: null,
      isConfident: true,
    });
    expect(result.outcome).toBe("fail");
  });

  it("fails when above the numeric maximum", () => {
    const result = evaluateExperience(profile({ experienceYears: 10 }), {
      minYears: null,
      maxYears: 5,
      domainNote: null,
      isConfident: true,
    });
    expect(result.outcome).toBe("fail");
  });

  it("needs_verification when a numeric requirement exists but the profile has no experience set", () => {
    const result = evaluateExperience(profile(), {
      minYears: 3,
      maxYears: null,
      domainNote: null,
      isConfident: true,
    });
    expect(result.outcome).toBe("unknown");
  });

  it("always needs_verification when a domain-specific note is present, even if the numeric check would pass", () => {
    const result = evaluateExperience(profile({ experienceYears: 10 }), {
      minYears: 3,
      maxYears: null,
      domainNote: "in a teaching hospital",
      isConfident: true,
    });
    expect(result.outcome).toBe("unknown");
  });
});
