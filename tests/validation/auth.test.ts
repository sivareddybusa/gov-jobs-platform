import { describe, expect, it } from "vitest";
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@/lib/validation/auth";
import { onboardingSchema } from "@/lib/validation/onboarding";

// Fast, pure unit tests for the Zod schemas every auth Server Action
// re-validates against server-side (Phase 3 §12/§20) — these exist
// independently of, and don't replace, the real end-to-end coverage in
// tests/e2e/auth.spec.ts.

describe("registerSchema", () => {
  it("accepts a valid registration", () => {
    const result = registerSchema.safeParse({
      email: "alice@example.test",
      password: "Password123!",
      confirmPassword: "Password123!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "Password123!",
      confirmPassword: "Password123!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password under 8 characters", () => {
    const result = registerSchema.safeParse({
      email: "alice@example.test",
      password: "Aa1234!",
      confirmPassword: "Aa1234!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a password missing an uppercase letter", () => {
    const result = registerSchema.safeParse({
      email: "alice@example.test",
      password: "password123",
      confirmPassword: "password123",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched password confirmation", () => {
    const result = registerSchema.safeParse({
      email: "alice@example.test",
      password: "Password123!",
      confirmPassword: "Password124!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors["confirmPassword"]).toBeDefined();
    }
  });
});

describe("loginSchema", () => {
  it("accepts a valid login", () => {
    expect(
      loginSchema.safeParse({ email: "alice@example.test", password: "anything" }).success,
    ).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "alice@example.test", password: "" }).success).toBe(
      false,
    );
  });

  it("rejects an invalid email", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "anything" }).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("rejects an invalid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts matching strong passwords", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "NewPassword456!",
        confirmPassword: "NewPassword456!",
      }).success,
    ).toBe(true);
  });

  it("rejects a weak new password", () => {
    expect(
      resetPasswordSchema.safeParse({ password: "weak", confirmPassword: "weak" }).success,
    ).toBe(false);
  });

  it("rejects mismatched new passwords", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "NewPassword456!",
        confirmPassword: "Different456!",
      }).success,
    ).toBe(false);
  });
});

describe("onboardingSchema", () => {
  const validCategoryId = "11111111-1111-4111-8111-111111111111";
  const validStateId = "22222222-2222-4222-8222-222222222222";
  const validEducationLevelId = "33333333-3333-4333-8333-333333333333";

  it("accepts a valid onboarding submission", () => {
    const result = onboardingSchema.safeParse({
      dateOfBirth: "1998-05-14",
      categoryId: validCategoryId,
      stateId: validStateId,
      educationLevelId: validEducationLevelId,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a date of birth in the future", () => {
    const futureYear = new Date().getFullYear() + 1;
    const result = onboardingSchema.safeParse({
      dateOfBirth: `${futureYear}-01-01`,
      categoryId: validCategoryId,
      stateId: validStateId,
      educationLevelId: validEducationLevelId,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an implausibly old date of birth", () => {
    const result = onboardingSchema.safeParse({
      dateOfBirth: "1850-01-01",
      categoryId: validCategoryId,
      stateId: validStateId,
      educationLevelId: validEducationLevelId,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed date", () => {
    const result = onboardingSchema.safeParse({
      dateOfBirth: "not-a-date",
      categoryId: validCategoryId,
      stateId: validStateId,
      educationLevelId: validEducationLevelId,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID category id (never trusts an arbitrary client-supplied id shape)", () => {
    const result = onboardingSchema.safeParse({
      dateOfBirth: "1998-05-14",
      categoryId: "General",
      stateId: validStateId,
      educationLevelId: validEducationLevelId,
    });
    expect(result.success).toBe(false);
  });
});
