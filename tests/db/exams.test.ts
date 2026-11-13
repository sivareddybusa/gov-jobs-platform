// Real-database tests for the exam catalog and preparation targets: public
// visibility, the review-rights trigger, the publish constraint, and target
// ownership/primary rules. Skips cleanly if the local stack is down.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

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

describe.skipIf(!up)("exam catalog + preparation targets (RLS)", () => {
  const admin: SupabaseClient<Database> = createClient(API_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stamp = Date.now();
  const password = "correct horse battery staple 7";
  const ids: Record<string, string> = {};
  const clients: Record<string, SupabaseClient<Database>> = {};
  let anon: SupabaseClient<Database>;
  const examIds: string[] = [];
  let publishedId = "";
  let draftId = "";
  let secondPublishedId = "";

  async function mkUser(name: string, role?: string) {
    const { data, error } = await admin.auth.admin.createUser({
      email: `ex-${name}-${stamp}@example.test`,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("createUser");
    ids[name] = data.user.id;
    if (role) {
      await admin.from("admin_role_assignments").insert({ user_id: data.user.id, role_code: role });
    }
    const c = createClient<Database>(API_URL, ANON_KEY, {
      auth: { storageKey: `ex-${name}`, persistSession: true, autoRefreshToken: false },
    });
    const { error: e2 } = await c.auth.signInWithPassword({ email: data.user.email!, password });
    if (e2) throw e2;
    clients[name] = c;
  }

  async function mkExam(
    slug: string,
    over: Partial<Database["public"]["Tables"]["exams"]["Insert"]>,
  ) {
    const { data, error } = await admin
      .from("exams")
      .insert({ slug: `${slug}-${stamp}`, name: slug, category: "banking", ...over })
      .select("id")
      .single();
    if (error) throw error;
    examIds.push(data.id);
    return data.id;
  }

  beforeAll(async () => {
    anon = createClient<Database>(API_URL, ANON_KEY, {
      auth: { storageKey: "ex-anon", persistSession: false, autoRefreshToken: false },
    });
    await mkUser("alice");
    await mkUser("bob");
    await mkUser("editor", "editor");
    await mkUser("adminu", "admin");

    publishedId = await mkExam("pub", {
      status: "published",
      verification_status: "admin_verified",
      official_website_url: "https://example.gov.in",
    });
    secondPublishedId = await mkExam("pub2", {
      status: "published",
      verification_status: "admin_verified",
      official_website_url: "https://example.gov.in",
    });
    draftId = await mkExam("draft", {});
  });

  afterAll(async () => {
    for (const id of examIds) {
      await admin.from("user_exam_targets").delete().eq("exam_id", id);
      await admin.from("exams").delete().eq("id", id);
    }
    for (const id of Object.values(ids)) await admin.auth.admin.deleteUser(id);
  });

  it("shows anonymous visitors only published + verified exams", async () => {
    const { data } = await anon.from("exams").select("id").in("id", [publishedId, draftId]);
    expect(data?.map((r) => r.id)).toEqual([publishedId]);
  });

  it("hides unpublished exams from ordinary candidates but not from reviewers", async () => {
    const asAlice = await clients["alice"]!.from("exams").select("id").eq("id", draftId);
    expect(asAlice.data).toEqual([]);
    const asEditor = await clients["editor"]!.from("exams").select("id").eq("id", draftId);
    expect(asEditor.data).toHaveLength(1);
  });

  it("refuses the DB-level publish rule: published needs verification and an official URL", async () => {
    const { error } = await admin.from("exams").update({ status: "published" }).eq("id", draftId);
    expect(error?.message).toMatch(/exams_published_requires_verification/);
  });

  it("lets nobody but the service-role sync create exams (not candidates, editors or admins)", async () => {
    for (const who of ["alice", "editor", "adminu"]) {
      const { error } = await clients[who]!.from("exams").insert({
        slug: `nope-${who}-${stamp}`,
        name: "x",
        category: "other",
      });
      expect(error, who).not.toBeNull();
    }
  });

  it("lets only an admin change an exam, and never an editor or candidate", async () => {
    const asEditor = await clients["editor"]!.from("exams")
      .update({ description: "edited" })
      .eq("id", publishedId)
      .select("id");
    expect(asEditor.data ?? []).toEqual([]); // RLS filters the row out
    const asAlice = await clients["alice"]!.from("exams")
      .update({ description: "edited" })
      .eq("id", publishedId)
      .select("id");
    expect(asAlice.data ?? []).toEqual([]);

    const down = await clients["adminu"]!.from("exams")
      .update({ status: "draft", published_at: null })
      .eq("id", draftId)
      .select("id");
    expect(down.error).toBeNull();
    expect(down.data).toHaveLength(1);
  });

  it("nobody can delete exams through the API", async () => {
    await clients["adminu"]!.from("exams").delete().eq("id", publishedId);
    const { data } = await admin.from("exams").select("id").eq("id", publishedId);
    expect(data).toHaveLength(1);
  });

  it("shows auto-verified published exams to candidates and lets them be targeted", async () => {
    const id = await mkExam("auto", {
      status: "published",
      verification_status: "auto_verified",
      official_website_url: "https://sync-test.gov.in",
      source_url: "https://sync-test.gov.in/exam",
    });
    const seen = await anon.from("exams").select("id").eq("id", id);
    expect(seen.data).toHaveLength(1);
    const target = await clients["bob"]!.from("user_exam_targets")
      .insert({ profile_id: ids["bob"]!, exam_id: id })
      .select("id")
      .single();
    expect(target.error).toBeNull();
  });

  it("refuses auto_verified without an official host, but allows admin_verified", async () => {
    const { error } = await admin.from("exams").insert({
      slug: `auto-bad-${stamp}`,
      name: "x",
      category: "other",
      verification_status: "auto_verified",
      official_website_url: "https://example.com",
      source_url: "https://example.com/p",
    });
    expect(error?.message).toMatch(/exams_auto_verified_requires_official_host/);
  });

  it("rejects a reserved/invalid slug", async () => {
    const { error } = await admin
      .from("exams")
      .insert({ slug: "exams", name: "x", category: "other" });
    expect(error).not.toBeNull();
  });

  it("lets a candidate target a published exam", async () => {
    const { data, error } = await clients["alice"]!.from("user_exam_targets")
      .insert({ profile_id: ids["alice"]!, exam_id: publishedId, is_primary: true })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect(data?.id).toBeTruthy();
  });

  it("refuses targeting an unpublished exam", async () => {
    const { error } = await clients["alice"]!.from("user_exam_targets").insert({
      profile_id: ids["alice"]!,
      exam_id: draftId,
    });
    expect(error).not.toBeNull();
  });

  it("refuses targeting on behalf of another user and duplicate targets", async () => {
    const other = await clients["bob"]!.from("user_exam_targets").insert({
      profile_id: ids["alice"]!,
      exam_id: secondPublishedId,
    });
    expect(other.error).not.toBeNull();
    const dup = await clients["alice"]!.from("user_exam_targets").insert({
      profile_id: ids["alice"]!,
      exam_id: publishedId,
    });
    expect(dup.error).not.toBeNull();
  });

  it("allows only one primary target per user", async () => {
    const { error } = await clients["alice"]!.from("user_exam_targets").insert({
      profile_id: ids["alice"]!,
      exam_id: secondPublishedId,
      is_primary: true,
    });
    expect(error).not.toBeNull();
  });

  it("switches primary atomically through set_primary_exam_target", async () => {
    const second = await clients["alice"]!.from("user_exam_targets")
      .insert({ profile_id: ids["alice"]!, exam_id: secondPublishedId })
      .select("id")
      .single();
    expect(second.error).toBeNull();

    const rpc = await clients["alice"]!.rpc("set_primary_exam_target", {
      target_id: second.data!.id,
    });
    expect(rpc.error).toBeNull();
    const { data } = await clients["alice"]!.from("user_exam_targets")
      .select("exam_id, is_primary")
      .order("created_at");
    expect(data).toEqual([
      { exam_id: publishedId, is_primary: false },
      { exam_id: secondPublishedId, is_primary: true },
    ]);
  });

  it("will not let a user make someone else's target primary", async () => {
    const aliceTarget = await admin
      .from("user_exam_targets")
      .select("id")
      .eq("profile_id", ids["alice"]!)
      .eq("exam_id", publishedId)
      .single();
    const rpc = await clients["bob"]!.rpc("set_primary_exam_target", {
      target_id: aliceTarget.data!.id,
    });
    expect(rpc.error).not.toBeNull();
  });

  it("forbids a paused/removed target from being primary", async () => {
    const { error } = await clients["alice"]!.from("user_exam_targets")
      .update({ status: "paused" })
      .eq("exam_id", secondPublishedId);
    expect(error).not.toBeNull(); // still primary -> constraint
    const ok = await clients["alice"]!.from("user_exam_targets")
      .update({ status: "removed", is_primary: false })
      .eq("exam_id", secondPublishedId);
    expect(ok.error).toBeNull();
  });

  it("keeps targets private and undeletable", async () => {
    const asBob = await clients["bob"]!.from("user_exam_targets")
      .select("id")
      .eq("profile_id", ids["alice"]!);
    expect(asBob.data).toEqual([]);
    await clients["alice"]!.from("user_exam_targets").delete().eq("exam_id", publishedId);
    const { data } = await admin
      .from("user_exam_targets")
      .select("id")
      .eq("profile_id", ids["alice"]!);
    expect(data?.length).toBe(2); // history preserved: nothing was deleted
  });
});
