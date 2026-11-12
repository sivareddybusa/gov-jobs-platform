import { test, expect, type Page } from "@playwright/test";
import { findEmail, extractAuthConfirmLink } from "./mailpit";

// Real end-to-end coverage of Phase 6's admin surface, against the actual
// local Supabase stack and a real running Next.js server (same infra as
// tests/e2e/auth.spec.ts/profile.spec.ts). Admin-role provisioning uses the
// service-role client directly (the same trusted server-side path
// SECURITY.md §8 describes) rather than going through the (not-yet-built)
// role-request UI — a brand-new project has no super_admin yet, so
// bootstrapping one this way is the only correct entry point.
//
// Requires: `npx supabase start` and `npm run dev` both running locally.
// Run with `npm run test:e2e`.

const API_URL = process.env["E2E_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env["E2E_SUPABASE_SERVICE_ROLE_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Plain fetch against the Auth Admin / PostgREST APIs, deliberately not the
// full @supabase/supabase-js client — its RealtimeClient unconditionally
// requires a native WebSocket global at construction time, which Node 20
// (this environment's current runtime, pending the upgrade to Node 22
// tracked in docs/PROJECT_STATUS.md) doesn't provide outside a
// polyfilled/jsdom environment. This is real fetch traffic against the same
// local Supabase stack the app itself uses (SECURITY.md §8's trusted
// server-side path), not a mock.
async function adminFetch(path: string, init?: RequestInit) {
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function pollForEmail(to: string, subjectContains: string, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    const mail = await findEmail(to, subjectContains);
    if (mail) return mail;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

async function registerConfirmAndOnboard(page: Page, email: string, password: string) {
  await page.goto("/register");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.fill("#confirmPassword", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/verify-email/, { timeout: 10_000 });

  const mail = await pollForEmail(email, "Confirm");
  expect(mail).not.toBeNull();
  const link = extractAuthConfirmLink(mail!.HTML);
  expect(link).not.toBeNull();
  await page.goto(link!);
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });

  await page.waitForSelector("#dateOfBirth");
  await page.fill("#dateOfBirth", "1990-01-01");
  await page.selectOption("#categoryId", { label: "General / Unreserved" });
  await page.selectOption("#stateId", { label: "Telangana" });
  await page.selectOption("#educationLevelId", { label: "Undergraduate / Bachelor's Degree" });
  await page.click('button:has-text("Save and continue")');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
}

/** Registers, confirms, onboards, and grants the given admin role via the service-role client. */
async function createAdminUser(page: Page, prefix: string, password: string, role: string) {
  const email = uniqueEmail(prefix);
  await registerConfirmAndOnboard(page, email, password);

  const usersRes = await adminFetch(`/auth/v1/admin/users?email=${encodeURIComponent(email)}`);
  const usersJson = (await usersRes.json()) as { users: Array<{ id: string; email: string }> };
  const user = usersJson.users.find((u) => u.email === email);
  expect(user).toBeDefined();

  const grantRes = await adminFetch("/rest/v1/admin_role_assignments", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: user!.id, role_code: role }),
  });
  expect(grantRes.ok).toBe(true);

  return { email, userId: user!.id };
}

test.describe("admin: organizations, sources, jobs, rules, publish", () => {
  test("a super_admin can create an organization, source, job notification, add eligibility rules, and publish it", async ({
    page,
  }) => {
    const password = "Password123!";
    const { email } = await createAdminUser(page, "superadmin", password, "super_admin");

    // Log back in fresh (the earlier session predates the role grant).
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await login(page, email, password);

    // Create organization.
    const orgName = `E2E Test Org ${Date.now()}`;
    await page.goto("/admin/organizations/new");
    await page.fill("#name", orgName);
    await page.selectOption("#orgType", "central");
    await page.click('button:has-text("Save")');
    await expect(page).toHaveURL(/\/admin\/organizations$/, { timeout: 10_000 });

    // Create source.
    await page.goto("/admin/sources/new");
    await page.fill("#name", "E2E Test Source");
    await page.fill("#officialDomain", "example.gov.in");
    await page.selectOption("#sourceType", "manual_admin_entry");
    await page.fill("#sourceUrl", "https://example.gov.in/notice");
    await page.click('button:has-text("Save")');
    await expect(page).toHaveURL(/\/admin\/sources$/, { timeout: 10_000 });

    // Create job notification.
    await page.goto("/admin/jobs/new");
    const orgSelect = page.locator("#organizationId");
    await orgSelect.selectOption({ label: orgName });
    const sourceSelect = page.locator("#sourceId");
    await sourceSelect.selectOption({ label: "E2E Test Source" });
    await page.fill("#title", "E2E Junior Assistant Recruitment 2026");
    await page.selectOption("#recruitmentType", "direct");
    await page.fill("#officialAdvertisementUrl", "https://example.gov.in/ad.pdf");
    await page.fill("#notificationDate", "2026-01-01");
    await page.click('button:has-text("Save")');
    await expect(page).toHaveURL(/\/admin\/jobs\/[0-9a-f-]+$/, { timeout: 10_000 });

    // Add a job post from the notification page.
    await page.click("text=+ New post");
    await expect(page).toHaveURL(/\/posts\/new$/, { timeout: 10_000 });
    await page.fill("#title", "Junior Assistant");
    await page.fill("#vacancyCount", "10");
    await page.click('button:has-text("Save")');
    await expect(page).toHaveURL(/\/posts\/[0-9a-f-]+$/, { timeout: 10_000 });

    // Set an age rule on this post.
    await page.fill("#minAge", "18");
    await page.fill("#maxAge", "30");
    await page.fill("#ageCutoffDate", "2026-08-01");
    await page.click('button:has-text("Save age rule")');
    await expect(page.locator("body")).toContainText("Age rule saved.", { timeout: 10_000 });

    // Go back to the notification and approve then publish it. Assert on
    // the persisted status badge (re-fetched via revalidatePath) rather than
    // the transient success toast, which is more robust against timing.
    const url = page.url();
    const jobNotificationUrl = url.replace(/\/posts\/[0-9a-f-]+$/, "");
    await page.goto(jobNotificationUrl);
    await page.click('button:has-text("Approve")');
    await expect(page.getByText("approved", { exact: true })).toBeVisible({ timeout: 10_000 });

    await page.click('button:has-text("Publish")');
    await expect(page.getByText("published", { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test("a reviewer cannot write job data and is redirected away from admin write pages requiring a higher role", async ({
    page,
  }) => {
    const password = "Password123!";
    const { email } = await createAdminUser(page, "reviewer", password, "reviewer");
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await login(page, email, password);

    // Reviewer can view the admin area (read access)...
    await page.goto("/admin/jobs");
    await expect(page).toHaveURL(/\/admin\/jobs$/, { timeout: 10_000 });

    // ...but creating an organization requires admin — redirected to dashboard.
    await page.goto("/admin/organizations/new");
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });

    // ...and creating a job notification requires editor — also redirected.
    await page.goto("/admin/jobs/new");
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
  });

  test("a non-admin user is redirected away from the entire admin area", async ({ page }) => {
    const email = uniqueEmail("plainuser");
    const password = "Password123!";
    await registerConfirmAndOnboard(page, email, password);

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 10_000 });
  });

  test("a notification whose advertisement URL doesn't match its source's official domain cannot be approved (SECURITY.md §32 domain verification)", async ({
    page,
  }) => {
    const password = "Password123!";
    const { email } = await createAdminUser(page, "domainadmin", password, "super_admin");
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await login(page, email, password);

    const orgName = `Domain Check Org ${Date.now()}`;
    await page.goto("/admin/organizations/new");
    await page.fill("#name", orgName);
    await page.selectOption("#orgType", "central");
    await page.click('button:has-text("Save")');
    await expect(page).toHaveURL(/\/admin\/organizations$/, { timeout: 10_000 });

    const sourceName = `Domain Check Source ${Date.now()}`;
    await page.goto("/admin/sources/new");
    await page.fill("#name", sourceName);
    await page.fill("#officialDomain", "example.gov.in");
    await page.selectOption("#sourceType", "manual_admin_entry");
    await page.fill("#sourceUrl", "https://example.gov.in/notice");
    await page.click('button:has-text("Save")');
    await expect(page).toHaveURL(/\/admin\/sources$/, { timeout: 10_000 });

    await page.goto("/admin/jobs/new");
    await page.locator("#organizationId").selectOption({ label: orgName });
    await page.locator("#sourceId").selectOption({ label: sourceName });
    await page.fill("#title", "Domain Mismatch Test Notification");
    await page.selectOption("#recruitmentType", "direct");
    // Deliberately a different domain than the source's official_domain.
    await page.fill("#officialAdvertisementUrl", "https://not-example.gov.in/ad.pdf");
    await page.fill("#notificationDate", "2026-01-01");
    await page.click('button:has-text("Save")');
    await expect(page).toHaveURL(/\/admin\/jobs\/[0-9a-f-]+$/, { timeout: 10_000 });

    await page.click('button:has-text("Approve")');
    await expect(page.locator("body")).toContainText("is not on the source's official domain", {
      timeout: 10_000,
    });
    // Must still show the original pre-approval status, not have silently
    // transitioned despite the error.
    await expect(page.getByText("discovered", { exact: true })).toBeVisible();
  });
});
