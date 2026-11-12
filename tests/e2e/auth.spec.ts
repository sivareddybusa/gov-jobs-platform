import { test, expect, type Page } from "@playwright/test";
import { findEmail, extractAuthConfirmLink } from "./mailpit";

// Real end-to-end coverage of Phase 3's authentication/onboarding flows,
// against the actual local Supabase stack (Postgres + Auth + Mailpit) and a
// real running Next.js server — not mocked (task Phase 3 §20: "use real
// Supabase integration tests where the existing test infrastructure
// supports them; do not replace security tests with mocks").
//
// Requires: `npx supabase start` and `npm run dev` both running locally
// (README.md). Run with `npm run test:e2e`.
//
// This suite is what actually caught two real bugs during Phase 3
// development that no unit test or RLS test alone would have: a missing
// `name` attribute on the shared form field components (silently breaking
// every native, non-react-hook-form submission), and a session left active
// after password reset that caused the post-reset /login redirect to be
// immediately bounced back to /dashboard by the auth middleware.

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

async function registerAndConfirm(page: Page, email: string, password: string) {
  await page.goto("/register");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.fill("#confirmPassword", password);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/verify-email/, { timeout: 10_000 });

  const mail = await pollForEmail(email, "Confirm");
  expect(mail, "confirmation email should have actually arrived in Mailpit").not.toBeNull();
  const link = extractAuthConfirmLink(mail!.HTML);
  expect(link, "confirmation email should contain a real /auth/confirm link").not.toBeNull();

  await page.goto(link!);
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
}

async function completeOnboarding(page: Page) {
  await page.waitForSelector("#dateOfBirth");
  await page.fill("#dateOfBirth", "1998-05-14");
  await page.selectOption("#categoryId", { label: "General / Unreserved" });
  await page.selectOption("#stateId", { label: "Telangana" });
  await page.selectOption("#educationLevelId", { label: "Undergraduate / Bachelor's Degree" });
  await page.click('button:has-text("Save and continue")');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
}

/** Mailpit delivery is effectively instant locally, but poll briefly rather than assume a fixed delay. */
async function pollForEmail(to: string, subjectContains: string, attempts = 10) {
  for (let i = 0; i < attempts; i++) {
    const mail = await findEmail(to, subjectContains);
    if (mail) return mail;
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

test.describe("registration, email confirmation, and onboarding", () => {
  test("a new user can register, confirm their email, complete onboarding, and reach the dashboard", async ({
    page,
  }) => {
    const email = uniqueEmail("alice");
    const password = "Password123!";

    await registerAndConfirm(page, email, password);

    // Profile is not complete yet — dashboard must bounce back to onboarding,
    // not silently let the user in (Phase 3 §9/§19).
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });

    await completeOnboarding(page);
    await expect(page.locator("body")).toContainText(email);
  });

  test("registration rejects a weak password before ever contacting the server", async ({
    page,
  }) => {
    await page.goto("/register");
    await page.fill("#email", uniqueEmail("weakpass"));
    await page.fill("#password", "short");
    await page.fill("#confirmPassword", "short");
    await page.click('button[type="submit"]');

    // Client-side Zod validation should catch this — the page must not
    // navigate away, and an inline error should appear (Phase 3 §12).
    await expect(page).toHaveURL(/\/register/);
    await expect(page.locator("body")).toContainText(/at least 8 characters/i);
  });
});

test.describe("logout and session handling", () => {
  test("logging out invalidates the session and blocks protected routes", async ({ page }) => {
    const email = uniqueEmail("bob");
    const password = "Password123!";
    await registerAndConfirm(page, email, password);
    await completeOnboarding(page);

    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?redirectTo=%2Fdashboard/, { timeout: 10_000 });
  });

  test("an existing user with a complete profile can log back in and reach the dashboard directly", async ({
    page,
  }) => {
    const email = uniqueEmail("carol");
    const password = "Password123!";
    await registerAndConfirm(page, email, password);
    await completeOnboarding(page);
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  });

  test("login shows the same generic error for a wrong password and a nonexistent account", async ({
    page,
  }) => {
    const email = uniqueEmail("dave");
    const password = "Password123!";
    await registerAndConfirm(page, email, password);
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await page.fill("#email", email);
    await page.fill("#password", "TheWrongPassword1!");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    const wrongPasswordError = await page.locator("body").textContent();

    await page.goto("/login");
    await page.fill("#email", uniqueEmail("doesnotexist"));
    await page.fill("#password", "WhateverPassword1!");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    const nonexistentAccountError = await page.locator("body").textContent();

    expect(wrongPasswordError).toContain("Invalid email or password");
    expect(nonexistentAccountError).toContain("Invalid email or password");
  });
});

test.describe("password reset", () => {
  test("forgot password -> real recovery email -> set new password -> old password rejected, new password works", async ({
    page,
  }) => {
    const email = uniqueEmail("erin");
    const oldPassword = "Password123!";
    const newPassword = "NewPassword456!";

    await registerAndConfirm(page, email, oldPassword);
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 });

    await page.goto("/forgot-password");
    await page.fill("#email", email);
    await page.click('button:has-text("Send reset link")');
    await expect(page.locator("body")).toContainText("If an account exists", { timeout: 10_000 });

    const mail = await pollForEmail(email, "Reset");
    expect(mail, "password reset email should have actually arrived in Mailpit").not.toBeNull();
    const link = extractAuthConfirmLink(mail!.HTML);
    expect(link).not.toBeNull();

    await page.goto(link!);
    await expect(page).toHaveURL(/\/reset-password/, { timeout: 10_000 });

    await page.fill("#password", newPassword);
    await page.fill("#confirmPassword", newPassword);
    await page.click('button:has-text("Set new password")');
    // Must land back on /login, not stay silently authenticated under the
    // now-changed password (this is the exact regression the fix in
    // app/(auth)/reset-password/actions.ts closes).
    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });

    await page.fill("#email", email);
    await page.fill("#password", oldPassword);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    await expect(page.locator("body")).toContainText("Invalid email or password");

    await page.fill("#email", email);
    await page.fill("#password", newPassword);
    await page.click('button[type="submit"]');
    // This user was never onboarded (registerAndConfirm stops at
    // /onboarding and this test logs out without completing it), so
    // /dashboard's own incomplete-profile redirect sends them straight to
    // /onboarding — the point of this assertion is that the new password
    // now works at all (an authenticated route is reached), not the exact
    // landing page.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
  });
});

test.describe("authorization", () => {
  test("user A cannot see user B's data through the app's own profile-loading path", async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    const emailA = uniqueEmail("usera");
    const emailB = uniqueEmail("userb");
    const password = "Password123!";

    await registerAndConfirm(pageA, emailA, password);
    await completeOnboarding(pageA);
    await registerAndConfirm(pageB, emailB, password);
    await completeOnboarding(pageB);

    // Both dashboards only ever show the signed-in user's own email — there
    // is no code path in this phase that accepts a client-supplied user ID
    // (lib/auth/profile.ts always scopes to the server-resolved session),
    // and RLS enforces the same boundary independently at the database
    // layer even if that application code had a bug
    // (tests/db/security-invariants.test.ts covers the RLS layer directly).
    await expect(pageA.locator("body")).toContainText(emailA);
    await expect(pageA.locator("body")).not.toContainText(emailB);
    await expect(pageB.locator("body")).toContainText(emailB);
    await expect(pageB.locator("body")).not.toContainText(emailA);

    await contextA.close();
    await contextB.close();
  });
});
