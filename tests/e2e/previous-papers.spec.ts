import { test, expect, type Page } from "@playwright/test";
import { findEmail, extractAuthConfirmLink } from "./mailpit";

// Phase 7: official previous-year papers and answer keys are seeded the way the sync stores them
// (service-role insert); a candidate sees them grouped by year with links to the official site.

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

test.describe("previous papers (Phase 7)", () => {
  test.describe.configure({ mode: "serial" });
  const stamp = Date.now();
  const password = "Str0ng-passw0rd-papers!";
  const email = `papers-${stamp}@example.test`;
  const name = `E2E Papers Exam ${stamp}`;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  let examId = "";

  test.afterAll(async () => {
    if (!examId) return;
    await svc(`/rest/v1/user_exam_targets?exam_id=eq.${examId}`, { method: "DELETE" });
    await svc(`/rest/v1/exams?id=eq.${examId}`, { method: "DELETE" }); // cascades materials
  });

  async function material(kind: string, title: string, path: string, year: number | null) {
    const res = await svc("/rest/v1/exam_materials", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        exam_id: examId,
        kind,
        title,
        url: `https://www.ibps.in/${slug}/${path}`,
        host: "www.ibps.in",
        paper_year: year,
      }),
    });
    expect(res.ok).toBe(true);
  }

  test("a candidate sees official papers by year, with no invented years", async ({ page }) => {
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
    await material("previous_paper", "E2E Question Paper 2021", "qp-2021.pdf", 2021);
    await material("previous_paper", "E2E Question Paper 2023", "qp-2023.pdf", 2023);
    await material("previous_paper", "E2E Paper collection", "qp-all.pdf", null);
    await material("answer_key", "E2E Final Answer Key 2023", "key-2023.pdf", 2023);
    await material("syllabus", "E2E Syllabus document", "syllabus.pdf", null);

    // Anonymous visitors are sent to sign in.
    await page.goto("/previous-papers");
    await expect(page).toHaveURL(/\/login/);

    await registerAndOnboard(page, email, password);
    await page.goto("/previous-papers");
    await expect(page.getByText("Choose an exam first")).toBeVisible();

    await page.goto(`/preparation/exams?q=${encodeURIComponent(name)}`);
    await page.click('button:has-text("Start preparing")');
    await expect(page.getByText("Preparing · view in My Preparation")).toBeVisible();

    await page.goto("/previous-papers");
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Question papers" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Answer keys" })).toBeVisible();

    // Newest year first; the document that states no year is last and says so.
    const years = await page.getByTestId("paper-year").allInnerTexts();
    expect(years).toEqual(["2023", "2021", "Year not stated in the link", "2023"]);

    const link = page.getByRole("link", { name: /E2E Question Paper 2023/ });
    await expect(link).toHaveAttribute("href", `https://www.ibps.in/${slug}/qp-2023.pdf`);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /noopener/);
    await expect(page.getByText("Always confirm the paper and its year")).toBeVisible();
    // The syllabus belongs on Study Materials, not here.
    await expect(page.getByText("E2E Syllabus document")).toHaveCount(0);
  });

  test("study materials and the exam page keep papers out, and still show the syllabus", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });

    await page.goto("/study-materials");
    await expect(page.getByText("E2E Syllabus document")).toBeVisible();
    await expect(page.getByText("E2E Question Paper 2023")).toHaveCount(0);
    await expect(page.getByText("E2E Final Answer Key 2023")).toHaveCount(0);
  });
});
