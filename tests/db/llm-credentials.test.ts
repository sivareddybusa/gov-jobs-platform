// LLM credentials are unreachable from any user session; only the service role
// (behind super_admin checks in app code) can touch them, and at most one key
// can be active. Skips cleanly if the local stack is down.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { addLlmKeyUseCase, llmKeyActionUseCase } from "@/services/admin/llm";

const API_URL = process.env["TEST_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env["TEST_SUPABASE_ANON_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env["TEST_SUPABASE_SERVICE_ROLE_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
    return res.status < 500;
  } catch {
    return false;
  }
}
const up = await reachable();
const opts = { auth: { autoRefreshToken: false, persistSession: false } };

describe.skipIf(!up)("llm_credentials", () => {
  const admin = createClient<Database>(API_URL, SERVICE_ROLE_KEY, opts);
  const anon = createClient<Database>(API_URL, ANON_KEY, opts);
  const stamp = Date.now();
  const label = `t-${stamp}`;
  process.env["APP_ENCRYPTION_KEY"] ??= Buffer.alloc(32, 7).toString("base64");

  // Switching the active key is part of what is tested, so remember the real one and put it back.
  let activeBefore: string | null = null;
  beforeAll(async () => {
    const { data } = await admin.from("llm_credentials").select("id").eq("is_active", true);
    activeBefore = data?.[0]?.id ?? null;
  });

  afterAll(async () => {
    await admin.from("llm_credentials").delete().like("label", `%${stamp}`);
    if (activeBefore) await admin.rpc("set_active_llm_credential", { p_id: activeBefore });
    await admin.from("audit_logs").delete().like("metadata->>label", `%${stamp}`);
  });

  it("is invisible and unwritable for anon/authenticated roles", async () => {
    const read = await anon.from("llm_credentials").select("id");
    expect(read.error ?? { none: true }).not.toEqual({ none: true }); // permission denied
    const write = await anon.from("llm_credentials").insert({
      provider: "openai",
      label: "x",
      encrypted_key: "x",
      key_last4: "abcd",
      model: "m",
    });
    expect(write.error).not.toBeNull();
    const rpc = await anon.rpc("set_active_llm_credential", {
      p_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(rpc.error).not.toBeNull();
  });

  it("stores the key encrypted, exposes only the last 4, and keeps exactly one active", async () => {
    const { data: u, error } = await admin.auth.admin.createUser({
      email: `llm-${stamp}@example.test`,
      password: "correct horse battery staple 7",
      email_confirm: true,
    });
    if (error || !u.user) throw error ?? new Error("createUser");
    const actor = u.user.id;
    try {
      for (const [name, key] of [
        ["A", "sk-plain-secret-AAAA"],
        ["B", "sk-plain-secret-BBBB"],
      ] as const) {
        const r = await addLlmKeyUseCase(admin, actor, {
          provider: "openai",
          label: `${name}-${label}`,
          apiKey: key,
        });
        expect(r.success).toBe(true);
      }
      const { data: rows } = await admin
        .from("llm_credentials")
        .select("*")
        .like("label", `%${label}`)
        .order("label");
      expect(rows).toHaveLength(2);
      for (const row of rows!) {
        expect(row.encrypted_key).not.toContain("sk-plain-secret");
        expect(row.is_active).toBe(false);
        expect(row.model).toBe("gpt-4.1-mini"); // provider default
      }
      expect(rows!.map((r) => r.key_last4)).toEqual(["AAAA", "BBBB"]);

      const [a, b] = rows!;
      expect((await llmKeyActionUseCase(admin, actor, { id: a!.id, action: "use" })).success).toBe(
        true,
      );
      expect((await llmKeyActionUseCase(admin, actor, { id: b!.id, action: "use" })).success).toBe(
        true,
      );
      const { data: active } = await admin
        .from("llm_credentials")
        .select("id")
        .eq("is_active", true);
      expect(active).toEqual([{ id: b!.id }]); // switching deactivated A

      // The DB refuses a second active row outright.
      const dup = await admin.from("llm_credentials").update({ is_active: true }).eq("id", a!.id);
      expect(dup.error).not.toBeNull();

      expect(
        (await llmKeyActionUseCase(admin, actor, { id: b!.id, action: "remove" })).success,
      ).toBe(true);
      const { data: left } = await admin.from("llm_credentials").select("id").eq("id", b!.id);
      expect(left).toEqual([]);

      // Audit trail never contains key material.
      const { data: audits } = await admin
        .from("audit_logs")
        .select("metadata")
        .eq("actor_id", actor);
      expect(JSON.stringify(audits)).not.toContain("sk-plain-secret");
      expect(audits!.length).toBeGreaterThanOrEqual(4);
    } finally {
      await admin.from("audit_logs").delete().eq("actor_id", actor);
      await admin.auth.admin.deleteUser(actor);
    }
  });

  it("rejects invalid input and a missing Cloudflare account id", async () => {
    const bad = await addLlmKeyUseCase(admin, "x", {
      provider: "cloudflare",
      label: "c",
      apiKey: "cf-abcdefgh",
    });
    expect(bad.success).toBe(false);
  });
});
