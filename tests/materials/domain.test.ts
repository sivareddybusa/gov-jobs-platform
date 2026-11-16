import { describe, expect, it } from "vitest";
import {
  classifyMaterial,
  cleanMaterialTitle,
  isOnExamSite,
  notificationMatchesEdition,
} from "@/domain/materials";

const c = (url: string, title = "") => classifyMaterial({ url, title });

describe("classifyMaterial", () => {
  it("classifies by url or title with fixed rules", () => {
    expect(c("https://ssc.gov.in/Syllabus/CGL-syllabus.pdf")).toBe("syllabus");
    expect(c("https://ssc.gov.in/x", "Scheme of Examination")).toBe("syllabus");
    expect(c("https://ibps.in/Detailed-Notification_CRP-PO-XVI.pdf")).toBe("notification");
    expect(c("https://ssc.gov.in/Notice_of_adv_cgl_2026.pdf", "Advertisement")).toBe(
      "notification",
    );
    expect(c("https://upsc.gov.in/x", "Sample Question Paper")).toBe("sample_paper");
    expect(c("https://x.gov.in/model-paper.pdf")).toBe("sample_paper");
    expect(c("https://ibps.in/user-manual.pdf")).toBe("guidance");
    expect(c("https://x.gov.in/guidelines-for-candidates.pdf", "Instructions to candidates")).toBe(
      "guidance",
    );
  });
  it("prefers the more specific kind", () => {
    expect(c("https://x.gov.in/sample-paper-syllabus.pdf")).toBe("sample_paper");
  });
  it("skips previous-year question papers (a later phase) and unknown documents", () => {
    expect(c("https://x.gov.in/previous-year-question-papers.pdf")).toBeNull();
    expect(c("https://x.gov.in/previous-year-papers/2023.pdf", "Question Paper 2023")).toBeNull();
    expect(c("https://x.gov.in/results-2024.pdf", "Result")).toBeNull();
  });
});

describe("cleanMaterialTitle", () => {
  it("tidies whitespace and site suffixes, with a fallback", () => {
    expect(cleanMaterialTitle("  Syllabus |  Staff Selection Commission | GoI ", "x")).toBe(
      "Syllabus",
    );
    expect(cleanMaterialTitle("", "Fallback title")).toBe("Fallback title");
    expect(cleanMaterialTitle("a".repeat(500), "x")).toHaveLength(300);
  });
});

describe("isOnExamSite", () => {
  it("accepts the exam's own site and its subdomains only", () => {
    expect(isOnExamSite("https://ssc.gov.in/x.pdf", "https://ssc.gov.in")).toBe(true);
    expect(isOnExamSite("https://ibpsreg.ibps.in/a", "https://www.ibps.in")).toBe(true);
    expect(isOnExamSite("https://www.ibps.in/a", "https://ibps.in")).toBe(true);
    expect(isOnExamSite("https://www.ndl.gov.in/x", "https://ssc.gov.in")).toBe(false);
    expect(isOnExamSite("https://evilibps.in/x", "https://ibps.in")).toBe(false);
    expect(isOnExamSite("https://ssc.gov.in/x", null)).toBe(false);
  });
});

describe("notificationMatchesEdition", () => {
  it("drops notices that name only other editions or years", () => {
    expect(notificationMatchesEdition("CRP SPL-XIV", "https://x/crp-spl-xiii/ Advertisement")).toBe(
      false,
    );
    expect(
      notificationMatchesEdition("CRP SPL-XIV", "https://x/Detailed-Advt.-CRP-SPL-XIV_final.pdf"),
    ).toBe(true);
    expect(notificationMatchesEdition("CGL 2026", "https://x/Notice_of_adv_cgl_2024.pdf")).toBe(
      false,
    );
    expect(notificationMatchesEdition("CGL 2026", "https://x/Notice_of_adv_cgl_2026.pdf")).toBe(
      true,
    );
  });
  it("lets edition-less links and edition-less exams through", () => {
    expect(notificationMatchesEdition("CRP SPL-XIV", "https://x/notification.pdf")).toBe(true);
    expect(notificationMatchesEdition("Combined Graduate Level", "https://x/adv-2019.pdf")).toBe(
      true,
    );
  });
});
