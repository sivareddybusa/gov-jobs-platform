// Real-database tests for the Application Tracker and user preferences:
// RLS ownership boundaries, the trigger-written status history (no client
// write path), and the language FK. Skips cleanly if the local stack is down.
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

describe.skipIf(!up)("application tracker + preferences (RLS)", () => {
  const admin: SupabaseClient<Database> = createClient(API_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stamp = Date.now();
  const password = "correct horse battery staple 9";
  let aliceId = "";
  let bobId = "";
  let alice: SupabaseClient<Database>;
  let bob: SupabaseClient<Database>;
  let anon: SupabaseClient<Database>;
  let orgId = "";
  let sourceId = "";
  let notificationId = "";
  let postId = "";
  let applicationId = "";

  async function signedIn(email: string, key: string) {
    const c = createClient<Database>(API_URL, ANON_KEY, {
      auth: { storageKey: key, persistSession: true, autoRefreshToken: false },
    });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return c;
  }

  beforeAll(async () => {
    const mk = async (name: string) => {
      const { data, error } = await admin.auth.admin.createUser({
        email: `${name}-${stamp}@example.test`,
        password,
        email_confirm: true,
      });
      if (error || !data.user) throw error ?? new Error("createUser failed");
      return data.user;
    };
    const a = await mk("trk-alice");
    const b = await mk("trk-bob");
    aliceId = a.id;
    bobId = b.id;

    const { data: org } = await admin
      .from("organizations")
      .insert({ name: `Trk Org ${stamp}`, org_type: "central" })
      .select("id")
      .single();
    orgId = org!.id;
    const { data: src } = await admin
      .from("job_sources")
      .insert({
        name: "Trk Source",
        official_domain: "example.gov.in",
        source_type: "manual_admin_entry",
        source_url: "https://example.gov.in/n",
      })
      .select("id")
      .single();
    sourceId = src!.id;
    const { data: n } = await admin
      .from("job_notifications")
      .insert({
        organization_id: orgId,
        source_id: sourceId,
        title: "Trk Notification",
        slug: `trk-${stamp}`,
        recruitment_type: "direct",
        official_advertisement_url: "https://example.gov.in/ad.pdf",
        notification_date: "2026-01-01",
        status: "published",
      })
      .select("id")
      .single();
    notificationId = n!.id;
    const { data: p } = await admin
      .from("job_posts")
      .insert({ job_notification_id: notificationId, title: "Trk Post" })
      .select("id")
      .single();
    postId = p!.id;

    anon = createClient<Database>(API_URL, ANON_KEY, {
      auth: { storageKey: "trk-anon", persistSession: false, autoRefreshToken: false },
    });
    alice = await signedIn(a.email!, "trk-alice");
    bob = await signedIn(b.email!, "trk-bob");
  });

  afterAll(async () => {
    if (aliceId) await admin.auth.admin.deleteUser(aliceId);
    if (bobId) await admin.auth.admin.deleteUser(bobId);
    if (notificationId) await admin.from("job_notifications").delete().eq("id", notificationId);
    if (sourceId) await admin.from("job_sources").delete().eq("id", sourceId);
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  });

  it("lets a user track a job post for themselves", async () => {
    const { data, error } = await alice
      .from("job_applications")
      .insert({ profile_id: aliceId, job_post_id: postId })
      .select("id, status")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("interested");
    applicationId = data!.id;
  });

  it("prevents tracking the same post twice", async () => {
    const { error } = await alice
      .from("job_applications")
      .insert({ profile_id: aliceId, job_post_id: postId });
    expect(error).not.toBeNull();
  });

  it("prevents inserting an application on behalf of another user", async () => {
    const { error } = await bob
      .from("job_applications")
      .insert({ profile_id: aliceId, job_post_id: postId });
    expect(error).not.toBeNull();
  });

  it("hides applications from other users and anonymous callers", async () => {
    const asBob = await bob.from("job_applications").select("id");
    expect(asBob.data).toEqual([]);
    const asAnon = await anon.from("job_applications").select("id");
    expect(asAnon.data ?? []).toEqual([]);
  });

  it("does not let another user update or delete the application", async () => {
    await bob.from("job_applications").update({ status: "selected" }).eq("id", applicationId);
    await bob.from("job_applications").delete().eq("id", applicationId);
    const { data } = await admin
      .from("job_applications")
      .select("status")
      .eq("id", applicationId)
      .single();
    expect(data?.status).toBe("interested");
  });

  it("rejects an invalid status via the check constraint", async () => {
    const { error } = await alice
      .from("job_applications")
      .update({ status: "hired" })
      .eq("id", applicationId);
    expect(error).not.toBeNull();
  });

  it("records status history through the trigger on create and change", async () => {
    await alice.from("job_applications").update({ status: "applied" }).eq("id", applicationId);
    // a non-status edit must not add a history row
    await alice.from("job_applications").update({ notes: "submitted" }).eq("id", applicationId);
    await alice
      .from("job_applications")
      .update({ status: "exam_scheduled" })
      .eq("id", applicationId);

    const { data } = await alice
      .from("job_application_status_history")
      .select("from_status, to_status")
      .eq("application_id", applicationId)
      .order("changed_at", { ascending: true });
    expect(data).toEqual([
      { from_status: null, to_status: "interested" },
      { from_status: "interested", to_status: "applied" },
      { from_status: "applied", to_status: "exam_scheduled" },
    ]);
  });

  it("hides status history from other users", async () => {
    const { data } = await bob
      .from("job_application_status_history")
      .select("id")
      .eq("application_id", applicationId);
    expect(data).toEqual([]);
  });

  it("gives even the owner no write path into status history", async () => {
    const ins = await alice
      .from("job_application_status_history")
      .insert({ application_id: applicationId, to_status: "selected" });
    expect(ins.error).not.toBeNull();
    await alice.from("job_application_status_history").delete().eq("application_id", applicationId);
    await alice
      .from("job_application_status_history")
      .update({ to_status: "selected" })
      .eq("application_id", applicationId);
    const { data } = await admin
      .from("job_application_status_history")
      .select("to_status")
      .eq("application_id", applicationId);
    expect(data).toHaveLength(3);
    expect(data?.some((r) => r.to_status === "selected")).toBe(false);
  });

  it("exposes English and Hindi as supported languages to anyone", async () => {
    const { data } = await anon.from("supported_languages").select("code").order("sort_order");
    expect(data?.map((r) => r.code)).toEqual(expect.arrayContaining(["en", "hi"]));
  });

  it("stores a user's own preferences and rejects an unknown language", async () => {
    const ok = await alice
      .from("user_preferences")
      .upsert({ profile_id: aliceId, language_code: "hi", email_notifications: true });
    expect(ok.error).toBeNull();
    const bad = await alice
      .from("user_preferences")
      .upsert({ profile_id: aliceId, language_code: "xx" });
    expect(bad.error).not.toBeNull();
  });

  it("keeps preferences private and unwritable across users", async () => {
    const read = await bob.from("user_preferences").select("profile_id");
    expect(read.data).toEqual([]);
    const write = await bob
      .from("user_preferences")
      .upsert({ profile_id: aliceId, language_code: "en" });
    expect(write.error).not.toBeNull();
  });

  it("stops non-admins writing supported_languages", async () => {
    const { error } = await alice
      .from("supported_languages")
      .insert({ code: "ta", name: "Tamil", native_name: "தமிழ்" });
    expect(error).not.toBeNull();
  });
});
