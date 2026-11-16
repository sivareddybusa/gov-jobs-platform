import { test, expect, type Page } from "@playwright/test";
import { findEmail, extractAuthConfirmLink } from "./mailpit";

// Phase 5: practice questions are seeded the way the sync stores them (service-role RPC);
// a candidate practises with instant feedback, never receives an answer before answering,
// and an admin can hide a wrong question.

const API_URL = process.env["E2E_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env["E2E_SUPABASE_SERVICE_ROLE_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function svc(path: string, init?: RequestInit) {
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
  await page.fill("#dateOfBirth", "1998-05-14");
  await page.selectOption("#categoryId", { label: "General / Unreserved" });
  await page.selectOption("#stateId", { label: "Telangana" });
  await page.selectOption("#educationLevelId", { label: "Undergraduate / Bachelor's Degree" });
  await page.click('button:has-text("Save and continue")');
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
}

test.describe("practice questions (Phase 5)", () => {
  test.describe.configure({ mode: "serial" });
  const stamp = Date.now();
  const password = "Str0ng-passw0rd-practice!";
  const email = `practice-${stamp}@example.test`;
  const name = `E2E Practice Exam ${stamp}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const EXPLANATION = `E2E-EXPLANATION-${stamp}`;
  let examId = "";

  test.afterAll(async () => {
    if (!examId) return;
    await svc(`/rest/v1/user_exam_targets?exam_id=eq.${examId}`, { method: "DELETE" });
    await svc(`/rest/v1/exams?id=eq.${examId}`, { method: "DELETE" }); // cascades questions/answers/attempts
  });

  async function seedQuestion(prompt: string, options: string[], correct: number, n: number) {
    const res = await svc("/rest/v1/rpc/add_question", {
      method: "POST",
      body: JSON.stringify({
        p_exam_id: examId,
        p_origin: "ai_generated",
        p_prompt: prompt,
        p_options: options,
        p_verification: "ai_cross_checked",
        p_content_hash: `e2e-${stamp}-${n}`,
        p_correct: correct,
        p_subject: "E2E Arithmetic",
        p_topic: "E2E Addition",
        p_explanation: EXPLANATION,
      }),
    });
    expect(res.ok).toBe(true);
  }

  test("a candidate practises with instant feedback and never gets answers up front", async ({
    page,
  }) => {
    const created = await svc("/rest/v1/exams", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        slug,
        name,
        category: "banking",
        official_website_url: "https://www.ibps.in",
        source_url: `https://www.ibps.in/${slug}`,
        discovered_via: "google_sync",
        verification_status: "auto_verified",
        status: "published",
        published_at: new Date().toISOString(),
      }),
    });
    examId = ((await created.json()) as Array<{ id: string }>)[0]!.id;
    await seedQuestion("E2E What is 7 plus 8 written as a number?", ["13", "14", "15", "16"], 2, 1);
    await seedQuestion("E2E What is 9 plus 9 written as a number?", ["17", "18", "19", "20"], 1, 2);

    await registerAndOnboard(page, email, password);

    // Without a chosen exam the page asks for one.
    await page.goto("/practice");
    await expect(page.getByText("Choose an exam first")).toBeVisible();

    await page.goto(`/preparation/exams?q=${encodeURIComponent(name)}`);
    await page.click('button:has-text("Start preparing")');
    await expect(page.getByText("Preparing · view in My Preparation")).toBeVisible();

    await page.goto("/practice");
    await expect(page.getByText("2 questions")).toBeVisible();
    await page.getByRole("link", { name: /E2E Arithmetic \(2\)/ }).click();
    await expect(page).toHaveURL(/subject=E2E%20Arithmetic/);
    await expect(page.getByText("AI-generated practice")).toBeVisible();

    // Before answering: no explanation anywhere in the page, and no option is marked.
    expect(await page.content()).not.toContain(EXPLANATION);
    await expect(page.locator('[data-state="correct"]')).toHaveCount(0);

    const first = await page.getByTestId("practice-prompt").innerText();
    const correct = first.includes("7 plus 8") ? 2 : 1;
    const wrong = 0; // option 0 is wrong for both seeded questions
    await page.getByTestId(`option-${wrong}`).click();
    await expect(page.getByTestId("practice-feedback")).toContainText("Incorrect");
    await expect(page.getByTestId(`option-${correct}`)).toHaveAttribute("data-state", "correct");
    await expect(page.getByTestId(`option-${wrong}`)).toHaveAttribute("data-state", "wrong");
    await expect(page.getByText(EXPLANATION)).toBeVisible();

    await page.getByRole("button", { name: "Next question" }).click();
    const second = await page.getByTestId("practice-prompt").innerText();
    const correct2 = second.includes("7 plus 8") ? 2 : 1;
    await page.getByTestId(`option-${correct2}`).click();
    await expect(page.getByTestId("practice-feedback")).toHaveText("Correct");
    await page.getByRole("button", { name: "Finish" }).click();
    await expect(page.getByTestId("practice-score")).toHaveText("You got 1 of 2 correct.");

    // Attempts were recorded, and the page now reports the progress.
    await page.goto(`/practice/${slug}`);
    await expect(page.getByText("you have answered 2 of 2 questions here")).toBeVisible();
  });

  test("an admin can hide a wrong question and candidates stop seeing it", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    // Not an admin yet: the admin page bounces to the dashboard.
    await page.goto("/admin/questions");
    await expect(page).toHaveURL(/\/dashboard/);

    const res = await svc(`/auth/v1/admin/users?email=${encodeURIComponent(email)}`);
    const { users } = (await res.json()) as { users: Array<{ id: string; email: string }> };
    const grant = await svc("/rest/v1/admin_role_assignments", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: users.find((u) => u.email === email)!.id,
        role_code: "super_admin",
      }),
    });
    expect(grant.ok).toBe(true);

    await page.goto("/admin/questions");
    await expect(page.getByRole("heading", { name: "Latest questions" })).toBeVisible();
    const row = page.locator("li", { hasText: "E2E What is 7 plus 8" });
    await expect(row).toBeVisible();
    // No authoring surface: admins monitor, they do not write questions.
    await expect(page.getByRole("button", { name: /Add question|New question/i })).toHaveCount(0);
    await row.getByRole("button", { name: "Hide" }).click();
    await expect(row.getByText("hidden", { exact: true })).toBeVisible();

    await page.goto("/practice");
    await expect(page.getByText("1 question", { exact: true })).toBeVisible();

    await page.goto("/admin/questions");
    const again = page.locator("li", { hasText: "E2E What is 7 plus 8" });
    await again.getByRole("button", { name: "Restore" }).click();
    await expect(again.getByText("published", { exact: true })).toBeVisible();
    await page.goto("/practice");
    await expect(page.getByText("2 questions")).toBeVisible();
  });
});
