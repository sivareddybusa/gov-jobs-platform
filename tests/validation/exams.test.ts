import { describe, expect, it } from "vitest";
import {
  examExtractionSchema,
  examTransitionSchema,
  examSearchParamsSchema,
  startTargetSchema,
  targetActionSchema,
} from "@/lib/validation/exams";

describe("examExtractionSchema", () => {
  const base = { isExamPage: true, name: "IBPS RRB", category: "banking" };
  it("accepts a minimal extraction and normalizes blanks", () => {
    const r = examExtractionSchema.parse({ ...base, shortName: "", description: "  " });
    expect(r.shortName).toBeUndefined();
    expect(r.description).toBeUndefined();
  });
  it("rejects unknown categories, empty names and oversized text", () => {
    expect(examExtractionSchema.safeParse({ ...base, category: "magic" }).success).toBe(false);
    expect(examExtractionSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
    expect(examExtractionSchema.safeParse({ ...base, description: "x".repeat(4001) }).success).toBe(
      false,
    );
    expect(examExtractionSchema.safeParse({ ...base, isExamPage: "yes" }).success).toBe(false);
  });
  it("ignores any model-supplied URL (the website is derived from the fetched page)", () => {
    const r = examExtractionSchema.parse({ ...base, officialWebsiteUrl: "https://evil.com" });
    expect("officialWebsiteUrl" in r).toBe(false);
  });
});

describe("examTransitionSchema", () => {
  const examId = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
  it("allows only take-down and restore actions", () => {
    for (const action of ["publish", "unpublish", "archive"]) {
      expect(examTransitionSchema.safeParse({ examId, action }).success).toBe(true);
    }
    for (const action of ["verify", "reject", "delete"]) {
      expect(examTransitionSchema.safeParse({ examId, action }).success).toBe(false);
    }
  });
});

describe("target validation", () => {
  const id = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
  it("validates start requests", () => {
    expect(startTargetSchema.safeParse({ examId: id }).success).toBe(true);
    expect(startTargetSchema.safeParse({ examId: id, targetYear: "2027" }).data?.targetYear).toBe(
      2027,
    );
    expect(startTargetSchema.safeParse({ examId: id, targetYear: "1900" }).success).toBe(false);
    expect(startTargetSchema.safeParse({ examId: "x" }).success).toBe(false);
  });
  it("only allows known target actions", () => {
    expect(targetActionSchema.safeParse({ targetId: id, action: "remove" }).success).toBe(true);
    expect(targetActionSchema.safeParse({ targetId: id, action: "delete" }).success).toBe(false);
  });
  it("ignores an invalid category in search params instead of throwing", () => {
    expect(examSearchParamsSchema.safeParse({ category: "nope" }).success).toBe(false);
    expect(examSearchParamsSchema.safeParse({ q: "ibps", category: "banking" }).success).toBe(true);
  });
});
