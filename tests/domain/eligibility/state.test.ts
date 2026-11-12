import { describe, expect, it } from "vitest";
import { evaluateStateDomicile } from "@/domain/eligibility/state";
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

const TELANGANA = "state-tg";
const AP = "state-ap";

describe("evaluateStateDomicile", () => {
  it("passes with no restriction when the post has no state scope", () => {
    expect(evaluateStateDomicile(profile(), null).outcome).toBe("pass");
  });

  it("passes unconditionally for all_india scope", () => {
    const result = evaluateStateDomicile(profile(), { scopeType: "all_india", stateIds: [] });
    expect(result.outcome).toBe("pass");
  });

  it("specific_states: passes when the user's current state matches", () => {
    const result = evaluateStateDomicile(profile({ stateId: TELANGANA }), {
      scopeType: "specific_states",
      stateIds: [TELANGANA, AP],
    });
    expect(result.outcome).toBe("pass");
  });

  it("specific_states: fails when the user's current state doesn't match", () => {
    const result = evaluateStateDomicile(profile({ stateId: "state-other" }), {
      scopeType: "specific_states",
      stateIds: [TELANGANA, AP],
    });
    expect(result.outcome).toBe("fail");
  });

  it("specific_states: needs_verification when current state is missing", () => {
    const result = evaluateStateDomicile(profile(), {
      scopeType: "specific_states",
      stateIds: [TELANGANA],
    });
    expect(result.outcome).toBe("unknown");
  });

  it("domicile_required: passes when domicile state matches, regardless of current state", () => {
    const result = evaluateStateDomicile(profile({ stateId: AP, domicileStateId: TELANGANA }), {
      scopeType: "domicile_required",
      stateIds: [TELANGANA],
    });
    expect(result.outcome).toBe("pass");
  });

  it("domicile_required: current state matching alone is NOT sufficient (state != domicile)", () => {
    // User currently lives in Telangana but is domiciled in AP; the post
    // requires Telangana domicile specifically -> must fail, not pass,
    // proving current state is never substituted for domicile.
    const result = evaluateStateDomicile(profile({ stateId: TELANGANA, domicileStateId: AP }), {
      scopeType: "domicile_required",
      stateIds: [TELANGANA],
    });
    expect(result.outcome).toBe("fail");
  });

  it("domicile_required: needs_verification when domicile state is missing (never assumed = current state)", () => {
    const result = evaluateStateDomicile(profile({ stateId: TELANGANA }), {
      scopeType: "domicile_required",
      stateIds: [TELANGANA],
    });
    expect(result.outcome).toBe("unknown");
  });
});
