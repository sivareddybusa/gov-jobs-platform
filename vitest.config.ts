import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Vitest doesn't auto-populate process.env from .env.local the way Next.js
// does — needed here because tests/db/rate-limit.test.ts imports
// lib/rate-limit.ts (via the server-only stub above), which transitively
// reads SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_URL through
// lib/env.server.ts/lib/env.client.ts. `loadEnv` is Vite's own built-in
// (no new dependency) .env loader; the empty prefix loads every variable,
// not just VITE_-prefixed ones.
Object.assign(process.env, loadEnv("", process.cwd(), ""));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": import.meta.dirname,
      // See tests/stubs/server-only-stub.ts for why this alias exists —
      // does not affect production/Next builds, which resolve the real
      // package through Next's own `react-server` condition.
      "server-only": `${import.meta.dirname}/tests/stubs/server-only-stub.ts`,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: false,
    // tests/e2e/* is a separate Playwright suite (npm run test:e2e), not
    // Vitest — it needs a real browser and a running dev server, unlike
    // everything else here.
    exclude: ["node_modules/**", "tests/e2e/**"],
  },
});
