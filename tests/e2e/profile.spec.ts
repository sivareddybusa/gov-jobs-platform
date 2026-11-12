import { test, expect, type Page } from "@playwright/test";
import { findEmail, extractAuthConfirmLink } from "./mailpit";

// Real end-to-end coverage of Phase 4's profile-editing, qualification, and
// special-status flows, against the actual local Supabase stack and a real
// running Next.js server (same infra/rationale as tests/e2e/auth.spec.ts).
//
// Requires: `npx supabase start` and `npm run dev` both running locally.
// Run with `npm run test:e2e`.

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
  expect(mail, "confirmation email should have actually arrived in Mailpit").not.toBeNull();
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

test.describe("profile editing", () => {
  test("a user can view and update their profile details", async ({ page }) => {
    const email = uniqueEmail("frank");
    await registerConfirmAndOnboard(page, email, "Password123!");

    await page.goto("/profile");
    await expect(page.locator("#fullName")).toHaveValue("");

    await page.fill("#fullName", "Frank Example");
    await page.selectOption("#gender", { label: "Male" });
    await page.fill("#experienceYears", "4");
    await page.click('button:has-text("Save changes")');

    await expect(page.locator("body")).toContainText("Profile updated.", { timeout: 10_000 });

    // Reload to prove the write actually persisted server-side, not just
    // reflected optimistically in client state.
    await page.reload();
    await expect(page.locator("#fullName")).toHaveValue("Frank Example");
    await expect(page.locator("#experienceYears")).toHaveValue("4");
  });

  test("profile form rejects an invalid date of birth before contacting the server", async ({
    page,
  }) => {
    const email = uniqueEmail("grace");
    await registerConfirmAndOnboard(page, email, "Password123!");

    await page.goto("/profile");
    await page.fill("#dateOfBirth", "2999-01-01");
    await page.click('button:has-text("Save changes")');

    await expect(page.locator("body")).toContainText(/cannot be in the future/i);
  });
});

test.describe("qualifications", () => {
  test("a user can add and remove a qualification", async ({ page }) => {
    const email = uniqueEmail("henry");
    await registerConfirmAndOnboard(page, email, "Password123!");

    await page.goto("/profile");
    await expect(page.locator("body")).toContainText("No qualifications added yet.");

    await page.selectOption("#qualificationId", { index: 1 });
    await page.fill("#institution", "State University");
    await page.fill("#yearCompleted", "2020");
    await page.click('button:has-text("Add qualification")');

    await expect(page.locator("body")).toContainText("State University", { timeout: 10_000 });
    await expect(page.locator("body")).not.toContainText("No qualifications added yet.");

    await page.click('button:has-text("Remove")');
    await expect(page.locator("body")).toContainText("No qualifications added yet.", {
      timeout: 10_000,
    });
  });
});

test.describe("special statuses", () => {
  test("a user can add and remove a special status", async ({ page }) => {
    const email = uniqueEmail("irene");
    await registerConfirmAndOnboard(page, email, "Password123!");

    await page.goto("/profile");
    await expect(page.locator("body")).toContainText("No special statuses added yet.");

    await page.selectOption("#statusId", { index: 1 });
    await page.click('button:has-text("Add status")');

    await expect(page.locator("body")).not.toContainText("No special statuses added yet.", {
      timeout: 10_000,
    });

    await page.click('button:has-text("Remove")');
    await expect(page.locator("body")).toContainText("No special statuses added yet.", {
      timeout: 10_000,
    });
  });
});

test.describe("authorization", () => {
  test("user A cannot see or affect user B's profile data through the app's own profile page", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const emailA = uniqueEmail("judya");
    const emailB = uniqueEmail("judyb");
    const password = "Password123!";

    await registerConfirmAndOnboard(pageA, emailA, password);
    await pageA.goto("/profile");
    await pageA.fill("#fullName", "User A Only");
    await pageA.click('button:has-text("Save changes")');
    await expect(pageA.locator("body")).toContainText("Profile updated.", { timeout: 10_000 });

    await registerConfirmAndOnboard(pageB, emailB, password);
    await pageB.goto("/profile");

    // User B's profile page must never show User A's name — there is no
    // client-supplied profile id anywhere in this flow (services/profile/*
    // always uses the server-resolved session id), and RLS's
    // profiles_select_own policy enforces the same boundary independently.
    await expect(pageB.locator("#fullName")).not.toHaveValue("User A Only");
    await expect(pageB.locator("body")).not.toContainText("User A Only");

    await contextA.close();
    await contextB.close();
  });
});
