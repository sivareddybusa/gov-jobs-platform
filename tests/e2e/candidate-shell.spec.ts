import { test, expect, type Page } from "@playwright/test";
import { findEmail, extractAuthConfirmLink } from "./mailpit";

// Phase 1: candidate sidebar, preparation shell, settings and Application
// Tracker, against the real local Supabase stack and Next.js server.

const API_URL = process.env["E2E_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env["E2E_SUPABASE_SERVICE_ROLE_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function rest(path: string, body: unknown) {
  const res = await fetch(`${API_URL}/rest/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  expect(res.ok, await res.clone().text()).toBe(true);
  return ((await res.json()) as Array<{ id: string }>)[0]!;
}

async function restDelete(path: string) {
  await fetch(`${API_URL}/rest/v1/${path}`, {
    method: "DELETE",
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
}

async function pollForEmail(to: string, subject: string) {
  for (let i = 0; i < 10; i++) {
    const mail = await findEmail(to, subject);
    if (mail) return mail;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

async function registerAndOnboard(page: Page, email: string, password: string) {
  await page.goto("/register");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.fill("#confirmPassword", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/verify-email/, { timeout: 10_000 });
  const mail = await pollForEmail(email, "Confirm");
  expect(mail).not.toBeNull();
  await page.goto(extractAuthConfirmLink(mail!.HTML)!);
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
  await page.waitForSelector("#dateOfBirth");
  // No sidebar while the profile is incomplete: its destinations would all redirect back here.
  await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  await page.fill("#dateOfBirth", "1998-05-14");
  await page.selectOption("#categoryId", { label: "General / Unreserved" });
  await page.selectOption("#stateId", { label: "Telangana" });
  await page.selectOption("#educationLevelId", { label: "Undergraduate / Bachelor's Degree" });
  await page.click('button:has-text("Save and continue")');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
}

test.describe("candidate shell (Phase 1)", () => {
  const stamp = Date.now();
  const email = `shell-${stamp}@example.test`;
  const password = "Str0ng-passw0rd-shell!";
  const slug = `shell-job-${stamp}`;
  // The mobile test reuses the user the first test registers.
  test.describe.configure({ mode: "serial" });

  const fixtures: { orgId?: string; sourceId?: string; notificationId?: string } = {};

  // Leave no rows behind: other specs select sources by name/domain, so stale
  // fixtures would make them ambiguous.
  test.afterAll(async () => {
    if (fixtures.notificationId) {
      await restDelete(`job_notifications?id=eq.${fixtures.notificationId}`);
    }
    if (fixtures.sourceId) await restDelete(`job_sources?id=eq.${fixtures.sourceId}`);
    if (fixtures.orgId) await restDelete(`organizations?id=eq.${fixtures.orgId}`);
  });

  test.beforeAll(async () => {
    const org = await rest("organizations", { name: `Shell Org ${stamp}`, org_type: "central" });
    const src = await rest("job_sources", {
      name: "Shell Source",
      official_domain: "example.gov.in",
      source_type: "manual_admin_entry",
      source_url: "https://example.gov.in/n",
    });
    const n = await rest("job_notifications", {
      organization_id: org.id,
      source_id: src.id,
      title: `Shell Notification ${stamp}`,
      slug,
      recruitment_type: "direct",
      official_advertisement_url: "https://example.gov.in/ad.pdf",
      notification_date: "2026-01-01",
      status: "published",
    });
    fixtures.orgId = org.id;
    fixtures.sourceId = src.id;
    fixtures.notificationId = n.id;
    await rest("job_posts", { job_notification_id: n.id, title: "Shell Post" });
  });

  test("sidebar, preparation shell, settings and tracker work end to end", async ({ page }) => {
    await registerAndOnboard(page, email, password);

    // First-time entry cards on the dashboard.
    await expect(page.getByRole("heading", { name: "Search Government Jobs" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Prepare for a Government Job" })).toBeVisible();

    // Sidebar groups and every required item.
    const nav = page.getByRole("navigation", { name: "Main" });
    // Regression: the sidebar must span the viewport height (a backdrop-filter
    // on an ancestor once collapsed `fixed` descendants to the header height).
    const sidebarBox = await page.locator("aside").boundingBox();
    expect(sidebarBox?.height ?? 0).toBeGreaterThan(400);
    for (const heading of ["Main menu", "My Preparation", "Account"]) {
      await expect(nav.locator("p", { hasText: new RegExp(`^${heading}$`) })).toBeVisible();
    }
    for (const label of [
      "Dashboard",
      "Search Government Jobs",
      "Eligible Jobs",
      "Latest Notifications",
      "Saved Jobs",
      "Application Tracker",
      "My Preparation",
      "Find an Exam",
      "My Study Plan",
      "Study Materials",
      "Practice Questions",
      "Mock Tests",
      "Previous Year Papers",
      "Performance Analytics",
      "My Profile",
      "Settings",
    ]) {
      await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
    }

    // Each sidebar destination loads, with the right heading and active state.
    const pages: Array<[string, string]> = [
      ["Search Government Jobs", "Browse jobs"],
      ["Eligible Jobs", "Eligible Jobs"],
      ["Latest Notifications", "Latest Notifications"],
      ["Saved Jobs", "Saved Jobs"],
      ["Application Tracker", "Application Tracker"],
      ["My Preparation", "My Preparation"],
      ["Find an Exam", "Find an Exam"],
      ["My Study Plan", "My Study Plan"],
      ["Study Materials", "Study Materials"],
      ["Practice Questions", "Practice Questions"],
      ["Mock Tests", "Mock Tests"],
      ["Previous Year Papers", "Previous Year Papers"],
      ["Performance Analytics", "Performance Analytics"],
      ["Settings", "Settings"],
    ];
    for (const [label, heading] of pages) {
      await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
      await expect(nav.getByRole("link", { name: label, exact: true })).toHaveAttribute(
        "aria-current",
        "page",
      );
    }

    // Preparation hub guides a first-time user to exam discovery.
    await page.goto("/preparation");
    await page.getByRole("link", { name: "Find an Exam" }).last().click();
    await expect(page).toHaveURL(/\/preparation\/exams/);

    // Settings persist.
    await page.goto("/settings");
    await page.selectOption("#languageCode", "hi");
    await page.check('input[name="emailNotifications"]');
    await page.click('button:has-text("Save settings")');
    await expect(page.getByText("Settings saved.")).toBeVisible();
    await page.reload();
    await expect(page.locator("#languageCode")).toHaveValue("hi");
    await expect(page.locator('input[name="emailNotifications"]')).toBeChecked();

    // Application Tracker: empty -> track from a job -> update status.
    await page.goto("/applications");
    await expect(page.getByText("You aren't tracking any applications yet")).toBeVisible();

    await page.goto(`/jobs/${slug}`);
    await page.click('button:has-text("Track application")');
    await expect(page.getByRole("link", { name: /Tracking · view tracker/ })).toBeVisible();

    await page.goto("/applications");
    await expect(page.getByText(`Shell Post — Shell Notification ${stamp}`)).toBeVisible();
    await page.click("summary:has-text('Update details')");
    await page.selectOption('select[name="status"]', "applied");
    await page.click('button:has-text("Save changes")');
    await expect(page.getByText("Saved.")).toBeVisible();
    await page.reload();
    await expect(page.locator("li").getByText("Applied", { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Interested · /)).toBeVisible();

    // Stop tracking returns to the empty state.
    await page.click("summary:has-text('Update details')");
    await page.click('button:has-text("Stop tracking")');
    await expect(page.getByText("You aren't tracking any applications yet")).toBeVisible();
  });

  test("protected candidate routes redirect anonymous visitors to login", async ({ page }) => {
    for (const path of ["/applications", "/preparation", "/settings", "/mock-tests"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test("mobile layout uses a drawer menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav).toBeVisible();
    await nav.getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
  });
});
