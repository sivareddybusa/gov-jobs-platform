import { describe, expect, it } from "vitest";
import { canPublishExam, isOfficialExamUrl, isOfficialHost, slugify } from "@/domain/exams";

describe("slugify", () => {
  it("makes lowercase hyphenated slugs", () => {
    expect(slugify("IBPS RRB (Officer Scale-I)")).toBe("ibps-rrb-officer-scale-i");
    expect(slugify("  SSC  CGL  ")).toBe("ssc-cgl");
  });
  it("strips accents and symbols, and never ends with a hyphen", () => {
    expect(slugify("Résumé & Test!!")).toBe("resume-test");
    expect(slugify("a".repeat(100) + "-b")).toMatch(/^[a-z0-9-]+$/);
    expect(slugify("a".repeat(79) + " b").endsWith("-")).toBe(false);
  });
  it("returns an empty string when nothing usable remains", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("isOfficialExamUrl / isOfficialHost", () => {
  it("accepts official government and IBPS hosts", () => {
    expect(isOfficialExamUrl("https://ssc.gov.in/path")).toBe(true);
    expect(isOfficialExamUrl("https://www.ibps.in")).toBe(true);
    expect(isOfficialExamUrl("https://upsc.gov.in:443/x")).toBe(true);
    expect(isOfficialHost("recruitment.nic.in")).toBe(true);
    expect(isOfficialExamUrl("https://nta.ac.in/x")).toBe(true);
  });
  it("rejects look-alikes, http, userinfo tricks and non-official hosts", () => {
    expect(isOfficialExamUrl("http://ssc.gov.in")).toBe(false);
    expect(isOfficialExamUrl("https://huroorkee.ac.in/blog/x")).toBe(false); // college blog
    expect(isOfficialExamUrl("https://evilnta.ac.in")).toBe(false);
    expect(isOfficialExamUrl("https://evilgov.in")).toBe(false);
    expect(isOfficialExamUrl("https://gov.in.evil.com")).toBe(false);
    expect(isOfficialExamUrl("https://gov.in@evil.com")).toBe(false);
    expect(isOfficialExamUrl("https://evil.com/gov.in")).toBe(false);
    expect(isOfficialExamUrl("https://examtips.com")).toBe(false);
    expect(isOfficialExamUrl(null)).toBe(false);
  });
});

describe("canPublishExam", () => {
  const site = "https://ibps.in";
  it("refuses unverified or rejected exams", () => {
    for (const v of ["pending_verification", "rejected"] as const) {
      expect(canPublishExam({ verificationStatus: v, officialWebsiteUrl: site }).ok).toBe(false);
    }
  });
  it("requires an official website", () => {
    expect(
      canPublishExam({ verificationStatus: "admin_verified", officialWebsiteUrl: null }).ok,
    ).toBe(false);
  });
  it("allows an admin-verified exam with an official site", () => {
    expect(
      canPublishExam({ verificationStatus: "admin_verified", officialWebsiteUrl: site }).ok,
    ).toBe(true);
  });
  it("allows auto-verified only when both website and source are official", () => {
    const ok = {
      verificationStatus: "auto_verified" as const,
      officialWebsiteUrl: site,
      sourceUrl: "https://ibps.in/exam",
    };
    expect(canPublishExam(ok).ok).toBe(true);
    expect(canPublishExam({ ...ok, sourceUrl: "https://blog.example.com/x" }).ok).toBe(false);
    expect(canPublishExam({ ...ok, officialWebsiteUrl: "https://example.com" }).ok).toBe(false);
    expect(canPublishExam({ ...ok, sourceUrl: null }).ok).toBe(false);
  });
});
