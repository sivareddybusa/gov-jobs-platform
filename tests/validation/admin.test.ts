import { describe, expect, it } from "vitest";
import {
  organizationSchema,
  jobSourceSchema,
  jobNotificationSchema,
  jobPostSchema,
  ageRuleSchema,
  relaxationSchema,
  statusRequirementSchema,
  qualificationRequirementSchema,
  grantRoleSchema,
} from "@/lib/validation/admin";

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

describe("organizationSchema", () => {
  it("accepts a minimal valid organization", () => {
    expect(organizationSchema.safeParse({ name: "SSC", orgType: "central" }).success).toBe(true);
  });

  it("rejects an invalid org type", () => {
    expect(organizationSchema.safeParse({ name: "SSC", orgType: "county" }).success).toBe(false);
  });

  it("rejects a non-https website URL", () => {
    const result = organizationSchema.safeParse({
      name: "SSC",
      orgType: "central",
      websiteUrl: "http://ssc.nic.in",
    });
    expect(result.success).toBe(false);
  });
});

describe("jobSourceSchema", () => {
  const base = {
    name: "SSC portal",
    officialDomain: "ssc.nic.in",
    sourceType: "official_website",
    sourceUrl: "https://ssc.nic.in/notices",
  };

  it("accepts a valid source", () => {
    expect(jobSourceSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a malformed domain", () => {
    expect(jobSourceSchema.safeParse({ ...base, officialDomain: "not a domain" }).success).toBe(
      false,
    );
  });

  it("rejects a non-https source URL", () => {
    expect(
      jobSourceSchema.safeParse({ ...base, sourceUrl: "http://ssc.nic.in/notices" }).success,
    ).toBe(false);
  });
});

describe("jobNotificationSchema", () => {
  const base = {
    organizationId: UUID,
    sourceId: UUID2,
    title: "Combined Graduate Level Exam 2026",
    recruitmentType: "direct",
    officialAdvertisementUrl: "https://ssc.nic.in/ad.pdf",
    notificationDate: "2026-01-01",
  };

  it("accepts a minimal valid notification", () => {
    expect(jobNotificationSchema.safeParse(base).success).toBe(true);
  });

  it("rejects application end date before start date", () => {
    const result = jobNotificationSchema.safeParse({
      ...base,
      applicationStartDate: "2026-02-01",
      applicationEndDate: "2026-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("accepts application end date on or after start date", () => {
    const result = jobNotificationSchema.safeParse({
      ...base,
      applicationStartDate: "2026-01-01",
      applicationEndDate: "2026-01-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-https advertisement URL (SSRF/trust surface)", () => {
    const result = jobNotificationSchema.safeParse({
      ...base,
      officialAdvertisementUrl: "http://ssc.nic.in/ad.pdf",
    });
    expect(result.success).toBe(false);
  });
});

describe("jobPostSchema", () => {
  it("accepts a minimal valid post", () => {
    expect(jobPostSchema.safeParse({ title: "Junior Engineer" }).success).toBe(true);
  });

  it("rejects a max pay scale below the minimum", () => {
    const result = jobPostSchema.safeParse({
      title: "Junior Engineer",
      payScaleMin: 50000,
      payScaleMax: 10000,
    });
    expect(result.success).toBe(false);
  });
});

describe("ageRuleSchema", () => {
  it("accepts a valid age rule", () => {
    const result = ageRuleSchema.safeParse({
      jobPostId: UUID,
      minAge: 18,
      maxAge: 30,
      ageCutoffDate: "2026-08-01",
      relaxationCombinationMode: "additive",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid relaxation combination mode", () => {
    const result = ageRuleSchema.safeParse({
      jobPostId: UUID,
      ageCutoffDate: "2026-08-01",
      relaxationCombinationMode: "whatever",
    });
    expect(result.success).toBe(false);
  });
});

describe("relaxationSchema", () => {
  it("rejects specifying both category and status", () => {
    const result = relaxationSchema.safeParse({
      jobPostId: UUID,
      categoryId: UUID,
      statusId: UUID2,
      ageRelaxationYears: 5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects specifying neither category nor status", () => {
    const result = relaxationSchema.safeParse({ jobPostId: UUID, ageRelaxationYears: 5 });
    expect(result.success).toBe(false);
  });

  it("accepts exactly one of category or status", () => {
    expect(
      relaxationSchema.safeParse({ jobPostId: UUID, categoryId: UUID, ageRelaxationYears: 5 })
        .success,
    ).toBe(true);
    expect(
      relaxationSchema.safeParse({ jobPostId: UUID, statusId: UUID2, ageRelaxationYears: 10 })
        .success,
    ).toBe(true);
  });
});

describe("statusRequirementSchema", () => {
  it("accepts a valid requirement", () => {
    expect(
      statusRequirementSchema.safeParse({
        jobPostId: UUID,
        statusId: UUID2,
        requirementType: "required",
      }).success,
    ).toBe(true);
  });

  it("rejects an invalid requirement type", () => {
    const result = statusRequirementSchema.safeParse({
      jobPostId: UUID,
      statusId: UUID2,
      requirementType: "mandatory",
    });
    expect(result.success).toBe(false);
  });
});

describe("qualificationRequirementSchema", () => {
  it("rejects a row with neither qualification nor education level", () => {
    const result = qualificationRequirementSchema.safeParse({
      jobPostId: UUID,
      groupId: 1,
      verificationStatus: "verified",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a row with a qualification", () => {
    expect(
      qualificationRequirementSchema.safeParse({
        jobPostId: UUID,
        qualificationId: UUID2,
        groupId: 1,
        verificationStatus: "verified",
      }).success,
    ).toBe(true);
  });

  it("accepts a bare education-level row", () => {
    expect(
      qualificationRequirementSchema.safeParse({
        jobPostId: UUID,
        educationLevelId: UUID2,
        groupId: 1,
        verificationStatus: "ai_extracted",
      }).success,
    ).toBe(true);
  });
});

describe("grantRoleSchema", () => {
  it("rejects an invalid role code", () => {
    expect(grantRoleSchema.safeParse({ userId: UUID, roleCode: "superuser" }).success).toBe(false);
  });

  it("accepts a valid role grant", () => {
    expect(grantRoleSchema.safeParse({ userId: UUID, roleCode: "editor" }).success).toBe(true);
  });
});
