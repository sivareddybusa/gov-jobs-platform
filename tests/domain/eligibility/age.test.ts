import { describe, expect, it } from "vitest";
import { evaluateAge } from "@/domain/eligibility/age";
import type { EligibilityProfile, Relaxation } from "@/domain/eligibility/types";

// Category relaxation, status relaxation, and stacking coverage (task Phase
// 5's required list: "category relaxation, status relaxation, status
// stacking, unsupported stacking").

const OBC = "cat-obc";
const SC = "cat-sc";
const PWBD = "status-pwbd";
const EX_SERVICEMAN = "status-exs";

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

describe("evaluateAge", () => {
  it("passes with no restriction when the post has no age rule", () => {
    const result = evaluateAge(profile(), null, []);
    expect(result.outcome).toBe("pass");
  });

  it("routes to needs_verification when the rule itself is low-confidence", () => {
    const result = evaluateAge(
      profile(),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "unsupported",
        isConfident: false,
      },
      [],
    );
    expect(result.outcome).toBe("unknown");
  });

  it("fails when age exceeds the base max age with no applicable relaxation", () => {
    const result = evaluateAge(
      profile({ dateOfBirth: "1990-01-01" }),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "unsupported",
        isConfident: true,
      },
      [],
    );
    expect(result.outcome).toBe("fail");
  });

  it("passes when age is within min/max with no relaxation needed", () => {
    const result = evaluateAge(
      profile({ dateOfBirth: "2000-01-01" }),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "unsupported",
        isConfident: true,
      },
      [],
    );
    expect(result.outcome).toBe("pass");
  });

  it("applies a single category relaxation to extend the effective max age", () => {
    // Base max 30, OBC +3 -> effective 33; age 31 (age > base max) now passes.
    const result = evaluateAge(
      profile({ dateOfBirth: "1994-01-02", categoryId: OBC }),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "unsupported",
        isConfident: true,
      },
      [{ categoryId: OBC, statusId: null, ageRelaxationYears: 3, isConfident: true }],
    );
    expect(result.outcome).toBe("pass");
  });

  it("applies a single status relaxation the same way as a category relaxation", () => {
    const result = evaluateAge(
      profile({ dateOfBirth: "1988-01-02", statusIds: [PWBD] }),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "unsupported",
        isConfident: true,
      },
      [{ categoryId: null, statusId: PWBD, ageRelaxationYears: 10, isConfident: true }],
    );
    // Age at cutoff = 37 (1988-01-02 -> 2026-01-01, birthday not yet
    // occurred), effective max = 30 + 10 = 40 -> pass.
    expect(result.outcome).toBe("pass");
  });

  it("stacks two applicable relaxations additively when mode is additive", () => {
    const relaxations: Relaxation[] = [
      { categoryId: OBC, statusId: null, ageRelaxationYears: 3, isConfident: true },
      { categoryId: null, statusId: PWBD, ageRelaxationYears: 10, isConfident: true },
    ];
    // Base 30 + 3 + 10 = 43. Age 40 should pass under additive, but fail
    // under max_of (30 + 10 = 40, so 40 should still pass max_of too —
    // use age 41 to distinguish the two modes cleanly below instead).
    const additive = evaluateAge(
      profile({ dateOfBirth: "1985-01-02", categoryId: OBC, statusIds: [PWBD] }),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "additive",
        isConfident: true,
      },
      relaxations,
    );
    expect(additive.outcome).toBe("pass"); // age 40, effective max 43

    const maxOf = evaluateAge(
      profile({ dateOfBirth: "1985-01-02", categoryId: OBC, statusIds: [PWBD] }),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "max_of",
        isConfident: true,
      },
      relaxations,
    );
    // age 40, effective max = 30 + max(3,10) = 40 -> exactly at boundary, passes.
    expect(maxOf.outcome).toBe("pass");

    const maxOfFail = evaluateAge(
      profile({ dateOfBirth: "1984-01-02", categoryId: OBC, statusIds: [PWBD] }),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "max_of",
        isConfident: true,
      },
      relaxations,
    );
    // age 41 > effective max 40 under max_of.
    expect(maxOfFail.outcome).toBe("fail");

    const additivePass = evaluateAge(
      profile({ dateOfBirth: "1984-01-02", categoryId: OBC, statusIds: [PWBD] }),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "additive",
        isConfident: true,
      },
      relaxations,
    );
    // Same age 41, but additive effective max = 43 -> passes, proving the
    // two modes genuinely diverge on this input.
    expect(additivePass.outcome).toBe("pass");
  });

  it("returns needs_verification when 2+ relaxations apply and the mode is unsupported", () => {
    const result = evaluateAge(
      profile({ dateOfBirth: "1985-01-02", categoryId: OBC, statusIds: [PWBD] }),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "unsupported",
        isConfident: true,
      },
      [
        { categoryId: OBC, statusId: null, ageRelaxationYears: 3, isConfident: true },
        { categoryId: null, statusId: PWBD, ageRelaxationYears: 10, isConfident: true },
      ],
    );
    expect(result.outcome).toBe("unknown");
  });

  it("returns needs_verification when mode is mutually_exclusive but 2+ relaxations still apply (data inconsistency)", () => {
    const result = evaluateAge(
      profile({ dateOfBirth: "1985-01-02", categoryId: SC, statusIds: [EX_SERVICEMAN] }),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "mutually_exclusive",
        isConfident: true,
      },
      [
        { categoryId: SC, statusId: null, ageRelaxationYears: 5, isConfident: true },
        { categoryId: null, statusId: EX_SERVICEMAN, ageRelaxationYears: 3, isConfident: true },
      ],
    );
    expect(result.outcome).toBe("unknown");
  });

  it("treats an explicit 0-value relaxation as a confident, definite non-relaxation", () => {
    const result = evaluateAge(
      profile({ dateOfBirth: "1996-01-02", categoryId: "cat-ews" }),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "unsupported",
        isConfident: true,
      },
      [{ categoryId: "cat-ews", statusId: null, ageRelaxationYears: 0, isConfident: true }],
    );
    // Age 29, no effective relaxation (0) -> still passes under base rule
    // alone, and does not become ambiguous just because a relaxation row exists.
    expect(result.outcome).toBe("pass");
  });

  it("returns needs_verification when date_of_birth is missing and the post has an age rule", () => {
    const result = evaluateAge(
      profile({ dateOfBirth: null }),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "unsupported",
        isConfident: true,
      },
      [],
    );
    expect(result.outcome).toBe("unknown");
  });

  it("passes on an unrestricted minimum (min_age null)", () => {
    const result = evaluateAge(
      profile({ dateOfBirth: "2020-01-01" }),
      {
        minAge: null,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "unsupported",
        isConfident: true,
      },
      [],
    );
    expect(result.outcome).toBe("pass");
  });

  it("passes on an unrestricted maximum (max_age null)", () => {
    const result = evaluateAge(
      profile({ dateOfBirth: "1950-01-01" }),
      {
        minAge: 18,
        maxAge: null,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "unsupported",
        isConfident: true,
      },
      [],
    );
    expect(result.outcome).toBe("pass");
  });

  it("fails when age is below the minimum", () => {
    const result = evaluateAge(
      profile({ dateOfBirth: "2015-01-01" }),
      {
        minAge: 18,
        maxAge: 30,
        ageCutoffDate: "2026-01-01",
        relaxationCombinationMode: "unsupported",
        isConfident: true,
      },
      [],
    );
    expect(result.outcome).toBe("fail");
  });
});
