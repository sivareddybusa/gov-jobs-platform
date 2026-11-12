// Real integration test for lib/rate-limit.ts (SECURITY.md §16, Phase 12)
// against the actual local Supabase stack — same reachability-gated pattern
// as tests/db/security-invariants.test.ts, since this module talks to a
// real Postgres table through the service-role client. Deliberately kept
// on the project's default jsdom environment (not `@vitest-environment
// node`) — jsdom supplies a `WebSocket` global that supabase-js's
// RealtimeClient requires at construction time on this project's current
// Node 20 runtime (no native WebSocket until Node 22, tracked in
// docs/PROJECT_STATUS.md); the `server-only` import (which is what needs
// working around here) is handled instead by aliasing that package to a
// no-op stub in vitest.config.ts.
import { describe, expect, it } from "vitest";
import { checkRateLimit } from "@/lib/rate-limit";

const API_URL = process.env["TEST_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env["TEST_SUPABASE_ANON_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

async function isLocalStackReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
    return res.status < 500;
  } catch {
    return false;
  }
}

const reachable = await isLocalStackReachable();

describe.skipIf(!reachable)("checkRateLimit (real Postgres)", () => {
  it("allows attempts up to the limit, then blocks the next one", async () => {
    const key = `test:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    for (let i = 0; i < 3; i++) {
      const { limited } = await checkRateLimit(key, 3, 3600);
      expect(limited).toBe(false);
    }
    const { limited: blocked } = await checkRateLimit(key, 3, 3600);
    expect(blocked).toBe(true);
  });

  it("tracks distinct bucket keys independently", async () => {
    const keyA = `test:a:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const keyB = `test:b:${Date.now()}:${Math.random().toString(36).slice(2)}`;

    await checkRateLimit(keyA, 1, 3600);
    const aBlocked = await checkRateLimit(keyA, 1, 3600);
    const bAllowed = await checkRateLimit(keyB, 1, 3600);

    expect(aBlocked.limited).toBe(true);
    expect(bAllowed.limited).toBe(false);
  });

  it("only counts attempts within the configured window", async () => {
    const key = `test:window:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    // A 0-second window means "no attempt is ever within the window" once
    // even a moment has passed, so every call should be allowed.
    const first = await checkRateLimit(key, 1, 0);
    const second = await checkRateLimit(key, 1, 0);
    expect(first.limited).toBe(false);
    expect(second.limited).toBe(false);
  });
});
