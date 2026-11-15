import { test, expect, type Page } from "@playwright/test";
import { findEmail, extractAuthConfirmLink } from "./mailpit";

// Phase 2: exams arrive via the Google-fed sync (seeded here as the sync would
// write them); admins only monitor/take down; a candidate finds an exam, starts preparing, manages primary/secondary targets, and never sees an
// unpublished exam.

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

test.describe("exam catalog and preparation targets (Phase 2)", () => {
  test.describe.configure({ mode: "serial" });
  const stamp = Date.now();
  const password = "Str0ng-passw0rd-exams!";
  const adminEmail = `exam-admin-${stamp}@example.test`;
  const userEmail = `exam-user-${stamp}@example.test`;
  const nameA = `E2E Exam Alpha ${stamp}`;
  const nameB = `E2E Exam Beta ${stamp}`;

  // Leave no rows behind: remove this run's targets first (FK), then its exams.
  test.afterAll(async () => {
    const res = await svc(
      `/rest/v1/exams?select=id&name=like.${encodeURIComponent(`E2E Exam *${stamp}`)}`,
    );
    const rows = (await res.json()) as Array<{ id: string }>;
    if (rows.length === 0) return;
    const list = `(${rows.map((r) => r.id).join(",")})`;
    await svc(`/rest/v1/user_exam_targets?exam_id=in.${list}`, { method: "DELETE" });
    await svc(`/rest/v1/exams?id=in.${list}`, { method: "DELETE" });
  });

  // Exams come from the Google-fed sync (service role), never from an admin form.
  async function seedExam(name: string, status: "published" | "draft") {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const res = await svc("/rest/v1/exams", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        slug,
        name,
        category: "banking",
        official_website_url: "https://www.ibps.in",
        source_url: `https://www.ibps.in/${slug}`,
        discovered_via: "google_sync",
        verification_status: "auto_verified",
        status,
        published_at: status === "published" ? new Date().toISOString() : null,
        last_synced_at: new Date().toISOString(),
        sync_status: "ok",
      }),
    });
    expect(res.ok).toBe(true);
  }

  test("admin monitors synced exams but cannot author them", async ({ page }) => {
    await seedExam(nameA, "published");
    // Syllabus arrives the way the sync stores it (service-role RPC), never via a form.
    const exRes = await svc(
      `/rest/v1/exams?select=id&slug=eq.${encodeURIComponent(nameA.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}`,
    );
    const examId = ((await exRes.json()) as Array<{ id: string }>)[0]!.id;
    const rpc = await svc("/rest/v1/rpc/replace_exam_syllabus", {
      method: "POST",
      body: JSON.stringify({
        p_exam_id: examId,
        p_source_url: "https://www.ibps.in/syllabus-e2e",
        p_tree: [
          {
            name: "E2E Reasoning",
            children: [{ name: "E2E Puzzles", children: [{ name: "E2E Seating arrangement" }] }],
          },
        ],
      }),
    });
    expect(rpc.ok).toBe(true);
    await seedExam(nameB, "draft"); // stays hidden from candidates

    await registerAndOnboard(page, adminEmail, password);
    const res = await svc(`/auth/v1/admin/users?email=${encodeURIComponent(adminEmail)}`);
    const { users } = (await res.json()) as { users: Array<{ id: string; email: string }> };
    const grant = await svc("/rest/v1/admin_role_assignments", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: users.find((u) => u.email === adminEmail)!.id,
        role_code: "super_admin",
      }),
    });
    expect(grant.ok).toBe(true);

    await page.goto("/admin/exams");
    await expect(page.getByText(nameA)).toBeVisible();
    await expect(page.getByText(nameB)).toBeVisible();
    // No manual authoring surface at all.
    await expect(page.getByRole("link", { name: /New exam/ })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Discover/ })).toHaveCount(0);
    expect((await page.goto("/admin/exams/new"))?.status()).toBe(404);

    // An admin can take synced content down.
    await page.goto("/admin/exams");
    const row = page.locator("li", { hasText: nameA });
    await row.getByRole("button", { name: "Unpublish" }).click();
    await expect(row.getByText("draft", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Restore" }).click();
    await expect(row.getByText("published", { exact: true })).toBeVisible();
  });

  test("a candidate only sees published exams and manages targets", async ({ page }) => {
    await registerAndOnboard(page, userEmail, password);

    await page.goto(`/preparation/exams?q=${encodeURIComponent("E2E Exam")}`);
    await expect(page.getByRole("link", { name: nameA })).toBeVisible();
    await expect(page.getByText(nameB)).toHaveCount(0); // unpublished draft stays hidden

    // Direct URL to the draft is a 404 for candidates.
    const slugB = `e2e-exam-beta-${stamp}`;
    const resp = await page.goto(`/preparation/exams/${slugB}`);
    expect(resp?.status()).toBe(404);

    // Empty preparation hub, then start preparing: first exam becomes primary.
    await page.goto("/preparation");
    await expect(page.getByText("You haven't chosen an exam to prepare for")).toBeVisible();

    await page.goto(`/preparation/exams?q=${encodeURIComponent(nameA)}`);
    await page.click('button:has-text("Start preparing")');
    await expect(page.getByText("Preparing · view in My Preparation")).toBeVisible();

    await page.goto("/preparation");
    const card = page.locator("li", { hasText: nameA });
    await expect(card.getByText("Primary", { exact: true })).toBeVisible();

    // Exam detail page shows verified status, official link and the start/manage state.
    await page.goto(`/preparation/exams/e2e-exam-alpha-${stamp}`);
    await expect(page.getByRole("heading", { level: 1, name: nameA })).toBeVisible();
    await expect(page.getByRole("link", { name: /Official website/ })).toBeVisible();
    await expect(page.getByText("You are preparing for this exam.")).toBeVisible();

    // Syllabus tree with its official source; the empty-state text is not shown.
    await expect(page.getByRole("heading", { name: "Syllabus" })).toBeVisible();
    await expect(page.getByText("E2E Reasoning")).toBeVisible();
    await page.getByText("E2E Puzzles").click();
    await expect(page.getByText("E2E Seating arrangement")).toBeVisible();
    await expect(page.getByRole("link", { name: /the official page/ })).toHaveAttribute(
      "href",
      "https://www.ibps.in/syllabus-e2e",
    );
    await expect(page.getByText("hasn't been found on an official page yet")).toHaveCount(0);

    // Pause, resume, then remove keeps history and shows it under "Previously prepared".
    await page.goto("/preparation");
    await page.locator("li", { hasText: nameA }).getByRole("button", { name: "Pause" }).click();
    await expect(page.locator("li", { hasText: nameA }).getByText("Paused")).toBeVisible();
    await page.locator("li", { hasText: nameA }).getByRole("button", { name: "Resume" }).click();
    await expect(
      page.locator("li", { hasText: nameA }).getByText("Primary", { exact: true }),
    ).toBeVisible();

    await page.locator("li", { hasText: nameA }).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Previously prepared")).toBeVisible();
    await expect(page.getByText("You haven't chosen an exam to prepare for")).toBeVisible();
  });

  test("non-admins cannot reach admin exam pages; anonymous visitors are redirected", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.fill("#email", userEmail);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
    await page.goto("/admin/exams");
    await expect(page).toHaveURL(/\/dashboard/);

    await page.context().clearCookies();
    await page.goto("/preparation/exams");
    await expect(page).toHaveURL(/\/login/);
  });
});
