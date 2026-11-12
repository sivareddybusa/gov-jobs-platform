import { describe, expect, it } from "vitest";
import { evaluateQualification } from "@/domain/eligibility/qualification";
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

const BACHELOR_RANK = 3;
const MASTER_RANK = 4;
const ANY_BACHELOR = "qual-any-bachelor";
const BTECH_CS = "qual-btech-cs";
const BSC = "qual-bsc";

// "generic qualification, specific qualification, missing profile data,
// missing rules, verification status, mixed eligible/ambiguous dimensions"
// (task Phase 5's required list).
describe("evaluateQualification", () => {
  it("passes with no restriction when the post has no qualification requirement", () => {
    expect(evaluateQualification(profile(), []).outcome).toBe("pass");
  });

  it("needs_verification when the post has requirements but the profile has no qualifications or education level", () => {
    const result = evaluateQualification(profile(), [
      {
        groupId: 1,
        qualificationId: ANY_BACHELOR,
        isGeneric: true,
        requiredEducationLevelRank: BACHELOR_RANK,
        verificationStatus: "ai_extracted",
      },
    ]);
    expect(result.outcome).toBe("unknown");
  });

  it("generic requirement: satisfied by any qualification at or above the required rank", () => {
    const result = evaluateQualification(
      profile({ qualifications: [{ qualificationId: BSC, educationLevelRank: BACHELOR_RANK }] }),
      [
        {
          groupId: 1,
          qualificationId: ANY_BACHELOR,
          isGeneric: true,
          requiredEducationLevelRank: BACHELOR_RANK,
          verificationStatus: "ai_extracted",
        },
      ],
    );
    expect(result.outcome).toBe("pass");
  });

  it("generic requirement: a higher-ranked qualification also satisfies it", () => {
    const result = evaluateQualification(
      profile({
        qualifications: [{ qualificationId: "qual-msc", educationLevelRank: MASTER_RANK }],
      }),
      [
        {
          groupId: 1,
          qualificationId: ANY_BACHELOR,
          isGeneric: true,
          requiredEducationLevelRank: BACHELOR_RANK,
          verificationStatus: "ai_extracted",
        },
      ],
    );
    expect(result.outcome).toBe("pass");
  });

  it("specific requirement: exact match required, a related-but-different qualification is a clear fail", () => {
    const result = evaluateQualification(
      profile({ qualifications: [{ qualificationId: BSC, educationLevelRank: BACHELOR_RANK }] }),
      [
        {
          groupId: 1,
          qualificationId: BTECH_CS,
          isGeneric: false,
          requiredEducationLevelRank: null,
          verificationStatus: "ai_extracted",
        },
      ],
    );
    expect(result.outcome).toBe("fail");
  });

  it("specific requirement: passes on an exact qualification match", () => {
    const result = evaluateQualification(
      profile({
        qualifications: [{ qualificationId: BTECH_CS, educationLevelRank: BACHELOR_RANK }],
      }),
      [
        {
          groupId: 1,
          qualificationId: BTECH_CS,
          isGeneric: false,
          requiredEducationLevelRank: null,
          verificationStatus: "ai_extracted",
        },
      ],
    );
    expect(result.outcome).toBe("pass");
  });

  it("bare education-level group: satisfied by profile.educationLevelRank meeting the minimum", () => {
    const result = evaluateQualification(profile({ educationLevelRank: MASTER_RANK }), [
      {
        groupId: 1,
        qualificationId: null,
        isGeneric: false,
        requiredEducationLevelRank: BACHELOR_RANK,
        verificationStatus: "verified",
      },
    ]);
    expect(result.outcome).toBe("pass");
  });

  it("AND across groups: both groups must be satisfied", () => {
    const result = evaluateQualification(
      profile({
        qualifications: [{ qualificationId: BTECH_CS, educationLevelRank: BACHELOR_RANK }],
      }),
      [
        {
          groupId: 1,
          qualificationId: BTECH_CS,
          isGeneric: false,
          requiredEducationLevelRank: null,
          verificationStatus: "verified",
        },
        {
          groupId: 2,
          qualificationId: "qual-driving-license",
          isGeneric: false,
          requiredEducationLevelRank: null,
          verificationStatus: "verified",
        },
      ],
    );
    // Group 1 satisfied, group 2 not held -> overall fail (AND).
    expect(result.outcome).toBe("fail");
  });

  it("OR within a group: any one alternative in the group satisfies it", () => {
    const result = evaluateQualification(
      profile({ qualifications: [{ qualificationId: BSC, educationLevelRank: BACHELOR_RANK }] }),
      [
        {
          groupId: 1,
          qualificationId: BTECH_CS,
          isGeneric: false,
          requiredEducationLevelRank: null,
          verificationStatus: "verified",
        },
        {
          groupId: 1,
          qualificationId: BSC,
          isGeneric: false,
          requiredEducationLevelRank: null,
          verificationStatus: "verified",
        },
      ],
    );
    expect(result.outcome).toBe("pass");
  });

  it("a low-confidence (ambiguous) requirement row makes its group needs_verification", () => {
    const result = evaluateQualification(
      profile({
        qualifications: [{ qualificationId: BTECH_CS, educationLevelRank: BACHELOR_RANK }],
      }),
      [
        {
          groupId: 1,
          qualificationId: BTECH_CS,
          isGeneric: false,
          requiredEducationLevelRank: null,
          verificationStatus: "ambiguous",
        },
      ],
    );
    expect(result.outcome).toBe("unknown");
  });

  it("an 'unsupported' verification status also routes to needs_verification", () => {
    const result = evaluateQualification(
      profile({
        qualifications: [{ qualificationId: BTECH_CS, educationLevelRank: BACHELOR_RANK }],
      }),
      [
        {
          groupId: 1,
          qualificationId: BTECH_CS,
          isGeneric: false,
          requiredEducationLevelRank: null,
          verificationStatus: "unsupported",
        },
      ],
    );
    expect(result.outcome).toBe("unknown");
  });

  it("a definite fail in one group dominates an ambiguous result in another group", () => {
    const result = evaluateQualification(
      profile({ qualifications: [{ qualificationId: BSC, educationLevelRank: BACHELOR_RANK }] }),
      [
        // Group 1: definite fail (specific mismatch).
        {
          groupId: 1,
          qualificationId: BTECH_CS,
          isGeneric: false,
          requiredEducationLevelRank: null,
          verificationStatus: "verified",
        },
        // Group 2: ambiguous.
        {
          groupId: 2,
          qualificationId: "qual-other",
          isGeneric: false,
          requiredEducationLevelRank: null,
          verificationStatus: "ambiguous",
        },
      ],
    );
    expect(result.outcome).toBe("fail");
  });
});
