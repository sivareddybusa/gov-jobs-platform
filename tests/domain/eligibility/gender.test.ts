import { describe, expect, it } from "vitest";
import { evaluateGender } from "@/domain/eligibility/gender";
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

describe("evaluateGender", () => {
  it("passes with no restriction when the post has no gender rule", () => {
    expect(evaluateGender(profile(), null).outcome).toBe("pass");
  });

  it("passes unconditionally when allowedGender is 'all', even with no profile gender", () => {
    expect(evaluateGender(profile(), { allowedGender: "all" }).outcome).toBe("pass");
  });

  it("passes when the profile gender matches", () => {
    const result = evaluateGender(profile({ gender: "female" }), { allowedGender: "female" });
    expect(result.outcome).toBe("pass");
  });

  it("fails when the profile gender does not match", () => {
    const result = evaluateGender(profile({ gender: "male" }), { allowedGender: "female" });
    expect(result.outcome).toBe("fail");
  });

  it("needs_verification when gender is restricted but the profile has none set", () => {
    const result = evaluateGender(profile(), { allowedGender: "female" });
    expect(result.outcome).toBe("unknown");
  });

  it("never treats prefer_not_to_say as a match for any restricted rule", () => {
    const result = evaluateGender(profile({ gender: "prefer_not_to_say" }), {
      allowedGender: "male",
    });
    expect(result.outcome).toBe("fail");
  });
});
