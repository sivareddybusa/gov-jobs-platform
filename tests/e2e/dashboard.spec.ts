import { test, expect, type Page } from "@playwright/test";
import { findEmail, extractAuthConfirmLink } from "./mailpit";

// Real end-to-end coverage of the Personalized Dashboard / Job Detail /
// Search / Saved Jobs surface (PRD.md §11, §12, §15, §16), against the
// actual local Supabase stack and a real running Next.js server — same
// infra as the other tests/e2e/*.spec.ts files. Exercises the full chain:
// admin publishes a job with a real age rule -> a normal user's computed
// eligibility (via domain/eligibility + services/eligibility) actually
// reflects it on the dashboard, job detail page, and search results.
//
// Requires: `npx supabase start` and `npm run dev` both running locally.
// Run with `npm run test:e2e`.

const API_URL = process.env["E2E_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env["E2E_SUPABASE_SERVICE_ROLE_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

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
  await page.fill("#dateOfBirth", "1998-05-14");
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

/** Publishes a job notification with one post open to everyone (no rules at all -> trivially eligible for any complete profile). */
async function publishOpenJob(
  page: Page,
  adminEmail: string,
  password: string,
  titleSuffix: string,
) {
  // Caller is expected to already be authenticated as adminEmail (createAdminUser
  // leaves the session signed in — no redundant re-login here, which was the
  // source of a real navigation race: goto("/login") right after onboarding's
  // own redirect settling produced an inconsistent landing page).
  const orgName = `Dashboard E2E Org ${titleSuffix}`;
  await page.goto("/admin/organizations/new");
  await page.fill("#name", orgName);
  await page.selectOption("#orgType", "central");
  await page.click('button:has-text("Save")');
  await expect(page).toHaveURL(/\/admin\/organizations$/, { timeout: 10_000 });

  const sourceName = `Dashboard E2E Source ${titleSuffix}`;
  await page.goto("/admin/sources/new");
  await page.fill("#name", sourceName);
  await page.fill("#officialDomain", "example.gov.in");
  await page.selectOption("#sourceType", "manual_admin_entry");
  await page.fill("#sourceUrl", "https://example.gov.in/notice");
  await page.click('button:has-text("Save")');
  await expect(page).toHaveURL(/\/admin\/sources$/, { timeout: 10_000 });

  const jobTitle = `Dashboard E2E Open Post ${titleSuffix}`;
  await page.goto("/admin/jobs/new");
  await page.locator("#organizationId").selectOption({ label: orgName });
  await page.locator("#sourceId").selectOption({ label: sourceName });
  await page.fill("#title", jobTitle);
  await page.selectOption("#recruitmentType", "direct");
  await page.fill("#officialAdvertisementUrl", "https://example.gov.in/ad.pdf");
  await page.fill("#officialApplicationUrl", "https://example.gov.in/apply");
  await page.fill("#notificationDate", "2026-01-01");
  await page.click('button:has-text("Save")');
  await expect(page).toHaveURL(/\/admin\/jobs\/[0-9a-f-]+$/, { timeout: 10_000 });
  const jobNotificationUrl = page.url();

  await page.click("text=+ New post");
  await expect(page).toHaveURL(/\/posts\/new$/, { timeout: 10_000 });
  await page.fill("#title", "Open Post");
  await page.click('button:has-text("Save")');
  await expect(page).toHaveURL(/\/posts\/[0-9a-f-]+$/, { timeout: 10_000 });

  await page.goto(jobNotificationUrl);
  await page.click('button:has-text("Approve")');
  await expect(page.getByText("approved", { exact: true })).toBeVisible({ timeout: 10_000 });
  await page.click('button:has-text("Publish")');
  await expect(page.getByText("published", { exact: true })).toBeVisible({ timeout: 10_000 });

  return { jobTitle };
}

test.describe("dashboard, job detail, search, saved jobs", () => {
  test("a fully open published job appears as Eligible on the dashboard, job detail shows the breakdown, and save/unsave works", async ({
    page,
  }) => {
    const password = "Password123!";
    const { email: adminEmail } = await createAdminUser(page, "dashadmin", password, "super_admin");
    // Fresh login after the role grant (same pattern as tests/e2e/admin.spec.ts).
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await login(page, adminEmail, password);

    const suffix = `${Date.now()}`;
    const { jobTitle } = await publishOpenJob(page, adminEmail, password, suffix);

    // publishOpenJob leaves the browser under the /admin layout, which has
    // no "Log out" control (only app/(protected)/layout.tsx does).
    await page.goto("/dashboard");
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    const applicantEmail = uniqueEmail("applicant");
    await registerConfirmAndOnboard(page, applicantEmail, password);

    // Dashboard shows the job somewhere (recommended or latest) with an
    // Eligible badge, since it has no rules at all -> every dimension is
    // trivially unrestricted.
    await page.goto("/dashboard");
    // The job legitimately appears in both "Recommended" and "Latest" —
    // take the first occurrence (recommended, since eligible).
    const card = page.locator("li", { hasText: jobTitle }).first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText("Eligible", { exact: true })).toBeVisible();

    // Job detail page shows the full per-dimension breakdown.
    await card.getByRole("link", { name: jobTitle }).click();
    await expect(page.locator("body")).toContainText("Eligible", { timeout: 10_000 });
    await expect(page.locator("body")).toContainText("No age restriction for this post.");
    await expect(page.locator("body")).toContainText("No experience requirement for this post.");

    // The two distinct advertisement/application links are present and
    // point at the real (never platform-domain) official URLs.
    const adLink = page.getByRole("link", { name: "View Official Advertisement" });
    await expect(adLink).toHaveAttribute("href", "https://example.gov.in/ad.pdf");
    const applyLink = page.getByRole("link", { name: "Apply on Official Website" });
    await expect(applyLink).toHaveAttribute("href", "https://example.gov.in/apply");

    // Save, verify it shows on the dashboard's Saved jobs section, unsave.
    await page.click('button:has-text("Save")');
    await expect(page.locator("button", { hasText: "Unsave" })).toBeVisible({ timeout: 10_000 });

    await page.goto("/dashboard");
    const savedSection = page.locator("section", { hasText: "Saved jobs" });
    await expect(savedSection.getByText(jobTitle)).toBeVisible({ timeout: 10_000 });

    await savedSection.getByText(jobTitle).click();
    await page.click('button:has-text("Unsave")');
    await expect(page.locator("button", { hasText: "Save" })).toBeVisible({ timeout: 10_000 });
    await page.goto("/dashboard");
    await expect(page.locator("section", { hasText: "Saved jobs" })).toContainText(
      "You haven't saved any jobs yet.",
    );
  });

  test("search finds the job by keyword and the eligibility filter includes it under 'eligible'", async ({
    page,
  }) => {
    const password = "Password123!";
    const { email: adminEmail } = await createAdminUser(
      page,
      "searchadmin",
      password,
      "super_admin",
    );
    // Fresh login after the role grant (same pattern as tests/e2e/admin.spec.ts).
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });
    await login(page, adminEmail, password);

    const suffix = `${Date.now()}`;
    const { jobTitle } = await publishOpenJob(page, adminEmail, password, suffix);

    // publishOpenJob leaves the browser under the /admin layout, which has
    // no "Log out" control (only app/(protected)/layout.tsx does).
    await page.goto("/dashboard");
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    const applicantEmail = uniqueEmail("searcher");
    await registerConfirmAndOnboard(page, applicantEmail, password);

    await page.goto(`/jobs?q=${encodeURIComponent(`Open Post ${suffix}`)}`);
    await expect(page.locator("body")).toContainText(jobTitle, { timeout: 10_000 });

    await page.goto(`/jobs?q=${encodeURIComponent(`Open Post ${suffix}`)}&eligibility=eligible`);
    await expect(page.locator("body")).toContainText(jobTitle, { timeout: 10_000 });

    await page.goto(
      `/jobs?q=${encodeURIComponent(`Open Post ${suffix}`)}&eligibility=not_eligible`,
    );
    await expect(page.locator("body")).toContainText("No jobs match your filters.");
  });
});
