import { defineConfig } from "@playwright/test";

// E2E tests exercise real browser flows against the local Supabase stack
// (Postgres + Auth + Mailpit) and the Next.js dev server — see
// tests/e2e/auth.spec.ts and README.md for what's required to run them.
// Not run as part of `npm test` (that's Vitest/unit+integration only);
// deliberately separate, per TECH_STACK.md's testing strategy.
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env["E2E_BASE_URL"] ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
});
