import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CANDIDATE_NAV, adminNavFor, isNavItemActive } from "@/lib/navigation/candidate-nav";

const items = CANDIDATE_NAV.flatMap((g) => g.items);

describe("candidate navigation", () => {
  it("has the three required groups in order", () => {
    expect(CANDIDATE_NAV.map((g) => g.heading)).toEqual(["Main menu", "My Preparation", "Account"]);
  });

  it("has unique hrefs and labels", () => {
    expect(new Set(items.map((i) => i.href)).size).toBe(items.length);
    expect(new Set(items.map((i) => i.label)).size).toBe(items.length);
  });

  it("points every item at a real page (no dead links)", () => {
    for (const item of items) {
      const page = join(process.cwd(), "app", "(protected)", item.href, "page.tsx");
      expect(existsSync(page), `${item.href} has no page`).toBe(true);
    }
  });

  it("highlights only the most specific matching item", () => {
    expect(isNavItemActive("/preparation", "/preparation")).toBe(true);
    expect(isNavItemActive("/preparation/exams", "/preparation/exams")).toBe(true);
    expect(isNavItemActive("/preparation/exams", "/preparation")).toBe(false);
  });

  it("keeps Search Government Jobs active on a job detail page", () => {
    expect(isNavItemActive("/jobs/ibps-rrb-2026", "/jobs")).toBe(true);
    expect(isNavItemActive("/jobs/ibps-rrb-2026", "/saved-jobs")).toBe(false);
  });

  it("does not match on a mere string prefix", () => {
    expect(isNavItemActive("/jobsearch", "/jobs")).toBe(false);
    expect(isNavItemActive("/practice-extra", "/practice")).toBe(false);
  });
});

describe("admin navigation", () => {
  it("shows nothing to non-admins", () => {
    expect(adminNavFor(null)).toEqual([]);
  });
  it("filters items by role tier", () => {
    const labels = (t: Parameters<typeof adminNavFor>[0]) =>
      adminNavFor(t).flatMap((g) => g.items.map((i) => i.label));
    expect(labels("reviewer")).toContain("Exams");
    expect(labels("reviewer")).not.toContain("AI providers");
    expect(labels("admin")).not.toContain("AI providers");
    expect(labels("super_admin")).toEqual(expect.arrayContaining(["AI providers", "Roles"]));
  });
  it("points every admin item at a real admin page", () => {
    for (const item of adminNavFor("super_admin").flatMap((g) => g.items)) {
      const page = join(process.cwd(), "app", "(admin)", item.href, "page.tsx");
      expect(existsSync(page), `${item.href} has no page`).toBe(true);
    }
  });
  it("highlights only the most specific admin item", () => {
    expect(isNavItemActive("/admin/exams", "/admin/exams")).toBe(true);
    expect(isNavItemActive("/admin/exams", "/admin")).toBe(false);
    expect(isNavItemActive("/admin", "/admin")).toBe(true);
  });
});
