import { describe, expect, it } from "vitest";
import { evaluateStatus } from "@/domain/eligibility/status";
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

const EX_SERVICEMAN = "status-exs";

describe("evaluateStatus", () => {
  it("passes when no status is required", () => {
    expect(evaluateStatus(profile(), []).outcome).toBe("pass");
  });

  it("passes trivially when the only requirement is 'optional'", () => {
    const result = evaluateStatus(profile(), [
      { statusId: EX_SERVICEMAN, requirementType: "optional", isConfident: true },
    ]);
    expect(result.outcome).toBe("pass");
  });

  it("passes trivially when the only requirement is 'preference' (never a hard gate)", () => {
    const result = evaluateStatus(profile(), [
      { statusId: EX_SERVICEMAN, requirementType: "preference", isConfident: true },
    ]);
    expect(result.outcome).toBe("pass");
  });

  it("passes when a 'required' status is held", () => {
    const result = evaluateStatus(profile({ statusIds: [EX_SERVICEMAN] }), [
      { statusId: EX_SERVICEMAN, requirementType: "required", isConfident: true },
    ]);
    expect(result.outcome).toBe("pass");
  });

  it("fails when a 'required' status is not held", () => {
    const result = evaluateStatus(profile(), [
      { statusId: EX_SERVICEMAN, requirementType: "required", isConfident: true },
    ]);
    expect(result.outcome).toBe("fail");
  });

  it("returns needs_verification when the required-status rule is low-confidence", () => {
    const result = evaluateStatus(profile({ statusIds: [EX_SERVICEMAN] }), [
      { statusId: EX_SERVICEMAN, requirementType: "required", isConfident: false },
    ]);
    expect(result.outcome).toBe("unknown");
  });
});
