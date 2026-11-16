import { test, expect, type Page } from "@playwright/test";
import { findEmail, extractAuthConfirmLink } from "./mailpit";

// Phase 6: timed mock tests with server-side scoring. Questions are seeded the way the sync stores
// them; the candidate takes a test, the server scores it, and an overdue test is closed by the server.

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

test.describe("mock tests (Phase 6)", () => {
  test.describe.configure({ mode: "serial" });
  const stamp = Date.now();
  const password = "Str0ng-passw0rd-mock!";
  const email = `mock-${stamp}@example.test`;
  const name = `E2E Mock Exam ${stamp}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const EXPLANATION = `E2E-MOCK-EXPLANATION-${stamp}`;
  const TOTAL = 6;
  let examId = "";

  // Question n has options "A n".."D n" and its right answer at index n % 4.
  const rightFor = (n: number) => n % 4;

  test.afterAll(async () => {
    if (!examId) return;
    await svc(`/rest/v1/user_exam_targets?exam_id=eq.${examId}`, { method: "DELETE" });
    await svc(`/rest/v1/exams?id=eq.${examId}`, { method: "DELETE" }); // cascades questions/attempts
  });

  async function seed() {
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
    for (let n = 1; n <= TOTAL; n++) {
      const res = await svc("/rest/v1/rpc/add_question", {
        method: "POST",
        body: JSON.stringify({
          p_exam_id: examId,
          p_origin: "ai_generated",
          p_prompt: `E2E mock question ${n}: pick the option labelled D${n}`,
          p_options: [`A${n}`, `B${n}`, `C${n}`, `D${n}`],
          p_verification: "ai_cross_checked",
          p_content_hash: `e2e-mock-${stamp}-${n}`,
          p_correct: rightFor(n),
          p_subject: n <= 3 ? "E2E Maths" : "E2E English",
          p_explanation: EXPLANATION,
        }),
      });
      expect(res.ok).toBe(true);
    }
  }

  const questionNumber = async (page: Page) =>
    Number((await page.getByTestId("mock-prompt").innerText()).match(/question (\d+):/)![1]);

  test("take a timed test: nothing leaks while running, the server scores it", async ({ page }) => {
    await seed();
    await registerAndOnboard(page, email, password);

    await page.goto("/mock-tests");
    await expect(page.getByText("Choose an exam first")).toBeVisible();
    await page.goto(`/preparation/exams?q=${encodeURIComponent(name)}`);
    await page.click('button:has-text("Start preparing")');
    await expect(page.getByText("Preparing · view in My Preparation")).toBeVisible();

    await page.goto("/mock-tests");
    await expect(page.getByText(`${TOTAL} questions · ${TOTAL} minutes`)).toBeVisible();
    await expect(page.getByText(/not any official\s+exam's marking scheme/)).toBeVisible();
    await page.getByRole("button", { name: "Start mock test" }).click();
    await expect(page).toHaveURL(/\/mock-tests\/attempts\//);

    // A clock is counting down from the server's deadline.
    await expect(page.getByTestId("mock-clock")).toHaveText(/^[0-5]:\d\d$/);
    // No answer or explanation anywhere in the page while running.
    expect(await page.content()).not.toContain(EXPLANATION);
    await expect(page.getByText("Correct", { exact: true })).toHaveCount(0);

    // Answer 3 right, 1 wrong; leave 2 unanswered. Questions arrive in random order.
    for (let i = 0; i < 4; i++) {
      const n = await questionNumber(page);
      const pick = i < 3 ? rightFor(n) : (rightFor(n) + 1) % 4;
      await page.getByTestId(`mock-option-${pick}`).click();
      await expect(page.getByTestId(`mock-option-${pick}`)).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Next", exact: true }).click();
    }
    // Reload once every answer is saved: they come back from the server.
    await expect(page.getByTestId("save-status")).toHaveText("All answers saved");
    await page.reload();
    await expect(page.getByText("4 of 6 answered")).toBeVisible();
    // Clearing an answer works too, then answer it again.
    await page.getByTestId("nav-0").click();
    await page.getByRole("button", { name: "Clear answer" }).click();
    await expect(page.getByText("3 of 6 answered")).toBeVisible();
    await expect(page.getByTestId("save-status")).toHaveText("All answers saved");
    const n0 = await questionNumber(page);
    await page.getByTestId(`mock-option-${rightFor(n0)}`).click();
    await expect(page.getByText("4 of 6 answered")).toBeVisible();
    await expect(page.getByTestId("save-status")).toHaveText("All answers saved");

    await page.getByTestId("submit-test").click();
    await expect(page.getByText("You have 2 unanswered questions")).toBeVisible();
    await page.getByTestId("confirm-submit").click();

    // Results: +1 x3, -0.25 x1.
    await expect(page.getByTestId("result-score")).toHaveText("2.75 / 6");
    await expect(page.getByTestId("result-correct")).toHaveText("3");
    await expect(page.getByTestId("result-wrong")).toHaveText("1");
    await expect(page.getByTestId("result-unanswered")).toHaveText("2");
    await expect(page.getByRole("heading", { name: "By subject" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "E2E Maths" })).toBeVisible();
    await expect(page.getByTestId("review-item")).toHaveCount(TOTAL);
    await expect(page.getByText(EXPLANATION).first()).toBeVisible(); // answers appear only now
    await expect(page.getByTestId("mock-clock")).toHaveCount(0);

    // The hub lists the attempt with its score.
    await page.goto("/mock-tests");
    await expect(page.getByTestId("attempt-score").first()).toHaveText("2.75 / 6");
  });

  test("an overdue test is closed by the server and cannot be changed", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    await page.goto("/mock-tests");
    await page.getByRole("button", { name: "Start mock test" }).click();
    await expect(page).toHaveURL(/\/mock-tests\/attempts\/([0-9a-f-]{36})/);
    const attemptId = page.url().split("/").pop()!;
    const n = await questionNumber(page);
    await page.getByTestId(`mock-option-${rightFor(n)}`).click();
    await expect(page.getByText("1 of 6 answered")).toBeVisible();
    await expect(page.getByTestId("save-status")).toHaveText("All answers saved");

    // The deadline passes (the server's clock decides; simulate by moving it).
    const moved = await svc(`/rest/v1/mock_attempts?id=eq.${attemptId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ expires_at: new Date(Date.now() - 10_000).toISOString() }),
    });
    expect(moved.ok).toBe(true);

    // Opening it now shows the result of what was saved in time.
    await page.reload();
    await expect(
      page.getByText("Time ran out; answers saved before then were scored."),
    ).toBeVisible();
    await expect(page.getByTestId("result-score")).toHaveText("1 / 6");
    await expect(page.getByTestId("result-unanswered")).toHaveText("5");

    // Unknown or malformed attempt ids are 404s.
    expect((await page.goto("/mock-tests/attempts/not-a-uuid"))?.status()).toBe(404);
    expect((await page.goto(`/mock-tests/attempts/${crypto.randomUUID()}`))?.status()).toBe(404);
  });

  test("the page submits by itself when the clock reaches zero", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    await page.goto("/mock-tests");
    await page.getByRole("button", { name: "Start mock test" }).click();
    await expect(page).toHaveURL(/\/mock-tests\/attempts\/([0-9a-f-]{36})/);
    const attemptId = page.url().split("/").pop()!;
    const n = await questionNumber(page);
    await page.getByTestId(`mock-option-${rightFor(n)}`).click();
    await expect(page.getByTestId("save-status")).toHaveText("All answers saved");

    // Leave only a few seconds on the server's clock, then watch the page finish the test.
    const moved = await svc(`/rest/v1/mock_attempts?id=eq.${attemptId}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ expires_at: new Date(Date.now() + 6_000).toISOString() }),
    });
    expect(moved.ok).toBe(true);
    await page.reload();
    await expect(page.getByTestId("mock-clock")).toBeVisible();
    await expect(page.getByTestId("result-score")).toHaveText("1 / 6", { timeout: 30_000 });
    await expect(page.getByTestId("mock-clock")).toHaveCount(0);
  });

  test("anonymous visitors are sent to login", async ({ page }) => {
    await page.goto("/mock-tests");
    await expect(page).toHaveURL(/\/login/);
  });
});
