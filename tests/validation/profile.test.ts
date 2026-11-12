import { describe, expect, it } from "vitest";
import {
  profileEditSchema,
  addQualificationSchema,
  addStatusSchema,
  removeQualificationSchema,
  removeStatusSchema,
} from "@/lib/validation/profile";

// Fast, pure unit tests for the Zod schemas services/profile/* re-validates
// against server-side (Phase 4, mirrors tests/validation/auth.test.ts's
// pattern for Phase 3's schemas) — these exist independently of, and don't
// replace, the real RLS/E2E coverage in tests/db/security-invariants.test.ts
// and tests/e2e/profile.spec.ts.

const validCategoryId = "11111111-1111-4111-8111-111111111111";
const validStateId = "22222222-2222-4222-8222-222222222222";
const validDomicileStateId = "33333333-3333-4333-8333-333333333333";
const validEducationLevelId = "44444444-4444-4444-8444-444444444444";
const validQualificationId = "55555555-5555-4555-8555-555555555555";
const validStatusId = "66666666-6666-4666-8666-666666666666";

describe("profileEditSchema", () => {
  const base = {
    fullName: "Alice Example",
    dateOfBirth: "1998-05-14",
    categoryId: validCategoryId,
    stateId: validStateId,
    domicileStateId: validDomicileStateId,
    educationLevelId: validEducationLevelId,
    gender: "female",
    experienceYears: "3.5",
  };

  it("accepts a fully populated valid submission", () => {
    expect(profileEditSchema.safeParse(base).success).toBe(true);
  });

  it("accepts optional fields left empty", () => {
    const result = profileEditSchema.safeParse({
      ...base,
      fullName: "",
      domicileStateId: "",
      gender: "",
      experienceYears: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a date of birth in the future", () => {
    const futureYear = new Date().getFullYear() + 1;
    const result = profileEditSchema.safeParse({ ...base, dateOfBirth: `${futureYear}-01-01` });
    expect(result.success).toBe(false);
  });

  it("rejects an implausibly old date of birth", () => {
    const result = profileEditSchema.safeParse({ ...base, dateOfBirth: "1850-01-01" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID category id (never trusts an arbitrary client-supplied id shape)", () => {
    const result = profileEditSchema.safeParse({ ...base, categoryId: "General" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID state id", () => {
    const result = profileEditSchema.safeParse({ ...base, stateId: "Telangana" });
    expect(result.success).toBe(false);
  });

  it("rejects a gender value outside the database CHECK constraint's set", () => {
    const result = profileEditSchema.safeParse({ ...base, gender: "unspecified" });
    expect(result.success).toBe(false);
  });

  it("rejects negative experience years", () => {
    const result = profileEditSchema.safeParse({ ...base, experienceYears: "-1" });
    expect(result.success).toBe(false);
  });

  it("rejects an implausibly large experience-years value", () => {
    const result = profileEditSchema.safeParse({ ...base, experienceYears: "75" });
    expect(result.success).toBe(false);
  });
});

describe("addQualificationSchema", () => {
  it("accepts a valid qualification submission", () => {
    const result = addQualificationSchema.safeParse({
      qualificationId: validQualificationId,
      institution: "State University",
      yearCompleted: "2020",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional institution/year left empty", () => {
    const result = addQualificationSchema.safeParse({
      qualificationId: validQualificationId,
      institution: "",
      yearCompleted: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID qualification id", () => {
    const result = addQualificationSchema.safeParse({ qualificationId: "Bachelors" });
    expect(result.success).toBe(false);
  });

  it("rejects a year completed in the future", () => {
    const futureYear = new Date().getFullYear() + 1;
    const result = addQualificationSchema.safeParse({
      qualificationId: validQualificationId,
      yearCompleted: String(futureYear),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an implausibly early year completed", () => {
    const result = addQualificationSchema.safeParse({
      qualificationId: validQualificationId,
      yearCompleted: "1900",
    });
    expect(result.success).toBe(false);
  });
});

describe("removeQualificationSchema", () => {
  it("rejects a non-UUID id", () => {
    expect(removeQualificationSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts a valid UUID id", () => {
    expect(removeQualificationSchema.safeParse({ id: validQualificationId }).success).toBe(true);
  });
});

describe("addStatusSchema", () => {
  it("accepts a valid status id", () => {
    expect(addStatusSchema.safeParse({ statusId: validStatusId }).success).toBe(true);
  });

  it("rejects a non-UUID status id", () => {
    expect(addStatusSchema.safeParse({ statusId: "PWBD" }).success).toBe(false);
  });
});

describe("removeStatusSchema", () => {
  it("rejects a non-UUID id", () => {
    expect(removeStatusSchema.safeParse({ id: "not-a-uuid" }).success).toBe(false);
  });

  it("accepts a valid UUID id", () => {
    expect(removeStatusSchema.safeParse({ id: validStatusId }).success).toBe(true);
  });
});
