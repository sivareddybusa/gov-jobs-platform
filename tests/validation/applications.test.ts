import { describe, expect, it } from "vitest";
import { trackApplicationSchema, updateApplicationSchema } from "@/lib/validation/applications";
import { updatePreferencesSchema } from "@/lib/validation/preferences";
import { APPLICATION_STATUSES, isTerminalApplicationStatus } from "@/domain/applications";

const id = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

describe("application validation", () => {
  it("rejects a non-uuid job post id", () => {
    expect(trackApplicationSchema.safeParse({ jobPostId: "nope" }).success).toBe(false);
    expect(trackApplicationSchema.safeParse({ jobPostId: id }).success).toBe(true);
  });

  it("normalizes blank optional fields to null", () => {
    const r = updateApplicationSchema.parse({
      applicationId: id,
      status: "applied",
      appliedOn: "",
      applicationNumber: "  ",
      notes: "",
    });
    expect(r.appliedOn).toBeNull();
    expect(r.applicationNumber).toBeNull();
    expect(r.notes).toBeNull();
  });

  it("rejects unknown statuses, bad dates and over-long notes", () => {
    const base = { applicationId: id, status: "applied" };
    expect(updateApplicationSchema.safeParse({ ...base, status: "hired" }).success).toBe(false);
    expect(updateApplicationSchema.safeParse({ ...base, appliedOn: "31/12/2026" }).success).toBe(
      false,
    );
    expect(updateApplicationSchema.safeParse({ ...base, appliedOn: "2026-13-45" }).success).toBe(
      false,
    );
    expect(updateApplicationSchema.safeParse({ ...base, notes: "x".repeat(2001) }).success).toBe(
      false,
    );
  });

  it("accepts every declared status", () => {
    for (const status of APPLICATION_STATUSES) {
      expect(updateApplicationSchema.safeParse({ applicationId: id, status }).success).toBe(true);
    }
  });

  it("flags terminal statuses", () => {
    expect(isTerminalApplicationStatus("selected")).toBe(true);
    expect(isTerminalApplicationStatus("applied")).toBe(false);
  });
});

describe("preference validation", () => {
  const base = { inAppNotifications: true, emailNotifications: false };
  it("accepts BCP-47-style codes and rejects junk", () => {
    expect(updatePreferencesSchema.safeParse({ ...base, languageCode: "hi" }).success).toBe(true);
    expect(updatePreferencesSchema.safeParse({ ...base, languageCode: "ta-IN" }).success).toBe(
      true,
    );
    expect(updatePreferencesSchema.safeParse({ ...base, languageCode: "'; drop" }).success).toBe(
      false,
    );
    expect(updatePreferencesSchema.safeParse({ ...base, languageCode: "" }).success).toBe(false);
  });
});
