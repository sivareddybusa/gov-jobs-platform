import { test, expect } from "@playwright/test";
import { findEmail, extractAuthConfirmLink } from "./mailpit";

// /admin/ai-providers: super_admin adds keys for two providers, switches which
// one is "In use", and keys are never shown back in full.

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

test.describe("AI providers page", () => {
  test.describe.configure({ mode: "serial" });
  const stamp = Date.now();
  const password = "Str0ng-passw0rd-llm!";
  const superEmail = `llm-super-${stamp}@example.test`;
  const adminEmail = `llm-admin-${stamp}@example.test`;
  let originalActive: string | null = null;

  test.beforeAll(async () => {
    const res = await svc("/rest/v1/llm_credentials?select=id&is_active=eq.true");
    originalActive = ((await res.json()) as Array<{ id: string }>)[0]?.id ?? null;
  });

  test.afterAll(async () => {
    await svc(`/rest/v1/llm_credentials?label=like.${encodeURIComponent(`E2E *${stamp}`)}`, {
      method: "DELETE",
    });
    if (originalActive) {
      await svc("/rest/v1/rpc/set_active_llm_credential", {
        method: "POST",
        body: JSON.stringify({ p_id: originalActive }),
      });
    }
  });

  async function signUpWithRole(
    page: import("@playwright/test").Page,
    email: string,
    role: string,
  ) {
    await page.goto("/register");
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.fill("#confirmPassword", password);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/verify-email/, { timeout: 10_000 });
    let mail = null;
    for (let i = 0; i < 10 && !mail; i++) {
      mail = await findEmail(email, "Confirm");
      if (!mail) await new Promise((r) => setTimeout(r, 300));
    }
    await page.goto(extractAuthConfirmLink(mail!.HTML)!);
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 10_000 });
    const res = await svc(`/auth/v1/admin/users?email=${encodeURIComponent(email)}`);
    const { users } = (await res.json()) as { users: Array<{ id: string; email: string }> };
    const grant = await svc("/rest/v1/admin_role_assignments", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: users.find((u) => u.email === email)!.id, role_code: role }),
    });
    expect(grant.ok).toBe(true);
  }

  test("super admin adds keys and switches the one in use", async ({ page }) => {
    await signUpWithRole(page, superEmail, "super_admin");
    await page.goto("/admin/ai-providers");
    await expect(page.getByRole("heading", { name: "AI providers" })).toBeVisible();
    for (const name of [
      "Google Gemini",
      "OpenAI (GPT)",
      "Anthropic Claude",
      "Cloudflare Workers AI",
    ]) {
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }

    const addKey = async (provider: string, label: string, key: string) => {
      const card = page.getByTestId(`provider-${provider}`);
      await card.getByLabel("Name for this key").fill(label);
      await card.getByLabel("API key").fill(key);
      await card.getByRole("button", { name: "Add key" }).click();
      await expect(card.getByText(label)).toBeVisible();
      return card;
    };
    const openai = await addKey("openai", `E2E OpenAI ${stamp}`, "sk-e2e-secret-1111");
    await addKey("anthropic", `E2E Claude ${stamp}`, "ak-e2e-secret-2222");

    // Last 4 only; the full key is never rendered anywhere.
    await expect(openai.getByText("••••1111")).toBeVisible();
    expect(await page.content()).not.toContain("sk-e2e-secret");

    const oRow = page.locator("li", { hasText: `E2E OpenAI ${stamp}` });
    const cRow = page.locator("li", { hasText: `E2E Claude ${stamp}` });
    await expect(oRow.getByText("Not in use")).toBeVisible();
    await oRow.getByRole("button", { name: "Use", exact: true }).click();
    await expect(oRow.getByText("In use", { exact: true })).toBeVisible();
    await expect(page.getByText(`In use: OpenAI (GPT)`)).toBeVisible();

    await cRow.getByRole("button", { name: "Use", exact: true }).click();
    await expect(cRow.getByText("In use", { exact: true })).toBeVisible();
    await expect(oRow.getByText("Not in use")).toBeVisible(); // everything else is unused
    await expect(page.getByText("In use", { exact: true })).toHaveCount(1);
  });

  test("a plain admin cannot open the page", async ({ page }) => {
    await signUpWithRole(page, adminEmail, "admin");
    await page.goto("/admin/ai-providers");
    // Kept out of the page (redirected away), never shown the keys UI.
    await expect(page).not.toHaveURL(/ai-providers/);
    await expect(page.getByRole("heading", { name: "AI providers" })).toHaveCount(0);
  });
});
