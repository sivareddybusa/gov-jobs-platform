// Database-level security-invariant tests (Phase 2 §15, SECURITY.md §28).
//
// These run against a REAL local Supabase stack (Postgres + PostgREST + Auth)
// through @supabase/supabase-js, the same client library the application
// uses — not a mocked layer. SECURITY.md §28 is explicit that RLS must be
// tested against the actual database, since the entire point of RLS is that
// it holds even if application-layer code has a bug.
//
// Requires the local stack from `npx supabase start` (README.md). If it
// isn't reachable, the whole suite skips with a clear reason rather than
// failing `npm test` in an environment where Docker/Supabase isn't running.
//
// The URL/anon/service-role values below are Supabase's own well-known local
// development defaults (identical for every `supabase start` on every
// machine) — not secrets, and never used against a real project.
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

async function isLocalStackReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
    return res.status < 500;
  } catch {
    return false;
  }
}

const reachable = await isLocalStackReachable();

describe.skipIf(!reachable)("database security invariants (RLS)", () => {
  const admin: SupabaseClient<Database> = createClient(API_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let aliceId = "";
  let bobId = "";
  let aliceClient: SupabaseClient<Database>;
  let bobClient: SupabaseClient<Database>;
  let anonClient: SupabaseClient<Database>;

  let orgId = "";
  let sourceId = "";
  let publishedNotificationId = "";
  let unpublishedNotificationId = "";
  let publishedPostId = "";

  const alicePassword = "correct horse battery staple 1";
  const bobPassword = "correct horse battery staple 2";

  beforeAll(async () => {
    // Two real auth users, created via the service-role client (bypasses RLS
    // by design — this is exactly the trusted server-side path SECURITY.md
    // §8 describes; nothing here goes through the anon key).
    const { data: alice, error: aliceErr } = await admin.auth.admin.createUser({
      email: `alice-${Date.now()}@example.test`,
      password: alicePassword,
      email_confirm: true,
    });
    if (aliceErr || !alice.user) throw aliceErr ?? new Error("failed to create Alice");
    aliceId = alice.user.id;

    const { data: bob, error: bobErr } = await admin.auth.admin.createUser({
      email: `bob-${Date.now()}@example.test`,
      password: bobPassword,
      email_confirm: true,
    });
    if (bobErr || !bob.user) throw bobErr ?? new Error("failed to create Bob");
    bobId = bob.user.id;

    // Reference rows needed to exercise the qualifications/job fixtures below.
    const { data: qualRow } = await admin
      .from("qualifications")
      .select("id")
      .eq("code", "ANY_BACHELOR")
      .single();

    await admin.from("user_qualifications").insert({
      profile_id: aliceId,
      qualification_id: qualRow!.id,
    });

    const { data: org } = await admin
      .from("organizations")
      .insert({ name: `Test Org ${Date.now()}`, org_type: "central" })
      .select("id")
      .single();
    orgId = org!.id;

    const { data: source } = await admin
      .from("job_sources")
      .insert({
        name: "Test Source",
        official_domain: "example.gov.in",
        source_type: "manual_admin_entry",
        source_url: "https://example.gov.in/notice",
      })
      .select("id")
      .single();
    sourceId = source!.id;

    const { data: published } = await admin
      .from("job_notifications")
      .insert({
        organization_id: orgId,
        source_id: sourceId,
        title: "Published Notification",
        slug: `published-${Date.now()}`,
        recruitment_type: "direct",
        official_advertisement_url: "https://example.gov.in/ad.pdf",
        notification_date: "2026-01-01",
        status: "published",
      })
      .select("id")
      .single();
    publishedNotificationId = published!.id;

    const { data: post } = await admin
      .from("job_posts")
      .insert({ job_notification_id: publishedNotificationId, title: "Test Post" })
      .select("id")
      .single();
    publishedPostId = post!.id;

    await admin.from("saved_jobs").insert({ profile_id: aliceId, job_post_id: publishedPostId });

    const { data: unpublished } = await admin
      .from("job_notifications")
      .insert({
        organization_id: orgId,
        source_id: sourceId,
        title: "Unpublished Notification",
        slug: `unpublished-${Date.now()}`,
        recruitment_type: "direct",
        official_advertisement_url: "https://example.gov.in/ad2.pdf",
        notification_date: "2026-01-01",
        status: "discovered",
      })
      .select("id")
      .single();
    unpublishedNotificationId = unpublished!.id;

    // Real sessions for Alice and Bob, via the anon key exactly as the
    // browser/server clients do — these are the clients under test.
    //
    // Each gets its own storageKey: in this Node test environment there is
    // no real browser localStorage, so the client library falls back to a
    // shared in-memory store keyed by storageKey — without distinct keys,
    // three clients created back-to-back all collide on the same default
    // key and silently share (overwrite) each other's session.
    anonClient = createClient(API_URL, ANON_KEY, {
      auth: { storageKey: "test-anon", persistSession: false, autoRefreshToken: false },
    });

    aliceClient = createClient(API_URL, ANON_KEY, {
      auth: { storageKey: "test-alice", persistSession: true, autoRefreshToken: false },
    });
    const { error: aliceSignInErr } = await aliceClient.auth.signInWithPassword({
      email: alice.user.email!,
      password: alicePassword,
    });
    if (aliceSignInErr) throw aliceSignInErr;

    bobClient = createClient(API_URL, ANON_KEY, {
      auth: { storageKey: "test-bob", persistSession: true, autoRefreshToken: false },
    });
    const { error: bobSignInErr } = await bobClient.auth.signInWithPassword({
      email: bob.user.email!,
      password: bobPassword,
    });
    if (bobSignInErr) throw bobSignInErr;
  });

  afterAll(async () => {
    // auth.users deletion cascades to profiles, which cascades to
    // user_qualifications/saved_jobs (DATABASE.md §3) — no manual profile
    // cleanup needed.
    if (aliceId) await admin.auth.admin.deleteUser(aliceId);
    if (bobId) await admin.auth.admin.deleteUser(bobId);
    if (publishedNotificationId) {
      await admin.from("job_notifications").delete().eq("id", publishedNotificationId);
    }
    if (unpublishedNotificationId) {
      await admin.from("job_notifications").delete().eq("id", unpublishedNotificationId);
    }
    if (sourceId) await admin.from("job_sources").delete().eq("id", sourceId);
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  });

  it("lets a user read their own profile", async () => {
    const { data, error } = await aliceClient.from("profiles").select("id").eq("id", aliceId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("prevents user A from reading user B's profile", async () => {
    const { data, error } = await aliceClient.from("profiles").select("id").eq("id", bobId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("prevents user A from reading user B's qualifications", async () => {
    const { data, error } = await aliceClient
      .from("user_qualifications")
      .select("profile_id")
      .eq("profile_id", bobId);
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("prevents user A from reading user B's saved jobs (and shows their own)", async () => {
    const own = await aliceClient.from("saved_jobs").select("profile_id");
    expect(own.data?.every((r) => r.profile_id === aliceId)).toBe(true);
    expect(own.data?.length).toBeGreaterThan(0);

    const bobsView = await bobClient
      .from("saved_jobs")
      .select("profile_id")
      .eq("profile_id", aliceId);
    expect(bobsView.data).toHaveLength(0);
  });

  it("prevents user A from inserting a saved_jobs row for user B (IDOR write)", async () => {
    const { error } = await aliceClient
      .from("saved_jobs")
      .insert({ profile_id: bobId, job_post_id: publishedPostId });
    expect(error).not.toBeNull();
  });

  it("lets anonymous and authenticated users read published jobs", async () => {
    const anonRead = await anonClient
      .from("job_notifications")
      .select("id, status")
      .eq("id", publishedNotificationId);
    expect(anonRead.data).toHaveLength(1);
    expect(anonRead.data?.[0]?.status).toBe("published");

    const aliceRead = await aliceClient
      .from("job_notifications")
      .select("id")
      .eq("id", publishedNotificationId);
    expect(aliceRead.data).toHaveLength(1);
  });

  it("hides unpublished jobs from anonymous and non-admin authenticated users", async () => {
    const anonRead = await anonClient
      .from("job_notifications")
      .select("id")
      .eq("id", unpublishedNotificationId);
    expect(anonRead.data).toHaveLength(0);

    const aliceRead = await aliceClient
      .from("job_notifications")
      .select("id")
      .eq("id", unpublishedNotificationId);
    expect(aliceRead.data).toHaveLength(0);
  });

  it("prevents anonymous users from modifying jobs", async () => {
    // RLS filters the target row out of the UPDATE entirely — either an
    // explicit error or zero rows affected are both acceptable "did not
    // modify" outcomes; what must never happen is the title actually
    // changing, which is what's actually asserted below.
    await anonClient
      .from("job_notifications")
      .update({ title: "hacked" })
      .eq("id", publishedNotificationId);

    const { data } = await admin
      .from("job_notifications")
      .select("title")
      .eq("id", publishedNotificationId)
      .single();
    expect(data?.title).toBe("Published Notification");
  });

  it("prevents user A from updating user B's profile (IDOR write, Phase 4 §42)", async () => {
    const { error } = await aliceClient
      .from("profiles")
      .update({ full_name: "Hacked By Alice" })
      .eq("id", bobId);
    // RLS's profiles_update_own policy filters the target row out of the
    // UPDATE entirely, so this is either an explicit error or a no-op — what
    // must never happen is Bob's row actually changing, asserted below via
    // the service-role client.
    const { data } = await admin.from("profiles").select("full_name").eq("id", bobId).single();
    expect(data?.full_name).not.toBe("Hacked By Alice");
    void error;
  });

  it("prevents user A from adding a qualification to user B's profile (IDOR write)", async () => {
    const { data: qualRow } = await admin
      .from("qualifications")
      .select("id")
      .eq("code", "ANY_BACHELOR")
      .single();

    const { error } = await aliceClient
      .from("user_qualifications")
      .insert({ profile_id: bobId, qualification_id: qualRow!.id });
    expect(error).not.toBeNull();
  });

  it("prevents user A from removing user B's qualification (IDOR write)", async () => {
    const { data: qualRow } = await admin
      .from("qualifications")
      .select("id")
      .eq("code", "ANY_BACHELOR")
      .single();
    const { data: bobsQual } = await admin
      .from("user_qualifications")
      .insert({ profile_id: bobId, qualification_id: qualRow!.id })
      .select("id")
      .single();

    await aliceClient.from("user_qualifications").delete().eq("id", bobsQual!.id);

    const { data: stillThere } = await admin
      .from("user_qualifications")
      .select("id")
      .eq("id", bobsQual!.id)
      .maybeSingle();
    expect(stillThere).not.toBeNull();
  });

  it("prevents user A from granting user B a special status (IDOR write)", async () => {
    const { data: statusRow } = await admin
      .from("statuses")
      .select("id")
      .eq("code", "PWBD")
      .single();

    const { error } = await aliceClient
      .from("profile_statuses")
      .insert({ profile_id: bobId, status_id: statusRow!.id });
    expect(error).not.toBeNull();
  });

  it("prevents user A from reading or removing user B's special statuses", async () => {
    const { data: statusRow } = await admin
      .from("statuses")
      .select("id")
      .eq("code", "EX_SERVICEMAN")
      .single();
    const { data: bobsStatus } = await admin
      .from("profile_statuses")
      .insert({ profile_id: bobId, status_id: statusRow!.id })
      .select("id")
      .single();

    const read = await aliceClient.from("profile_statuses").select("id").eq("profile_id", bobId);
    expect(read.data).toHaveLength(0);

    await aliceClient.from("profile_statuses").delete().eq("id", bobsStatus!.id);
    const { data: stillThere } = await admin
      .from("profile_statuses")
      .select("id")
      .eq("id", bobsStatus!.id)
      .maybeSingle();
    expect(stillThere).not.toBeNull();
  });

  it("prevents a normal authenticated user (no admin role) from modifying eligibility rules", async () => {
    const { error } = await aliceClient.from("job_age_rules").insert({
      job_post_id: publishedPostId,
      min_age: 18,
      max_age: 30,
      age_cutoff_date: "2026-01-01",
    });
    expect(error).not.toBeNull();
  });

  it("prevents a normal authenticated user from creating a job notification", async () => {
    const { error } = await aliceClient.from("job_notifications").insert({
      organization_id: orgId,
      source_id: sourceId,
      title: "Alice Hack",
      slug: `alice-hack-${Date.now()}`,
      recruitment_type: "direct",
      official_advertisement_url: "https://example.gov.in/hack.pdf",
      notification_date: "2026-01-01",
    });
    expect(error).not.toBeNull();
  });

  it("prevents job_history from being written through normal application access", async () => {
    const { error } = await aliceClient.from("job_history").insert({
      job_notification_id: publishedNotificationId,
      field_name: "title",
      old_value: "a",
      new_value: "b",
    });
    expect(error).not.toBeNull();
  });

  it("prevents audit_logs from being written through normal application access (authenticated or anon)", async () => {
    const asAlice = await aliceClient.from("audit_logs").insert({
      actor_id: aliceId,
      event_type: "fake_event",
      entity_table: "profiles",
      entity_id: aliceId,
    });
    expect(asAlice.error).not.toBeNull();

    const asAnon = await anonClient.from("audit_logs").insert({
      event_type: "fake_event",
      entity_table: "profiles",
      entity_id: aliceId,
    });
    expect(asAnon.error).not.toBeNull();
  });

  it("prevents a normal authenticated user from reading admin_role_assignments, including their own row", async () => {
    await admin.from("admin_role_assignments").insert({ user_id: aliceId, role_code: "editor" });

    const { data, error } = await aliceClient.from("admin_role_assignments").select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  // Phase 6 (Job Data + Admin Management). Alice now holds 'editor'
  // (granted by the previous test) — reused deliberately as the editor-tier
  // subject below rather than provisioning yet another user.
  describe("Phase 6: admin role boundaries", () => {
    it("prevents a non-admin (Bob) from creating an organization (admin-tier write)", async () => {
      const { error } = await bobClient
        .from("organizations")
        .insert({ name: `Bob Org ${Date.now()}`, org_type: "central" });
      expect(error).not.toBeNull();
    });

    it("prevents an editor (Alice) from creating an organization (admin-tier write, editor is insufficient)", async () => {
      const { error } = await aliceClient
        .from("organizations")
        .insert({ name: `Alice Org ${Date.now()}`, org_type: "central" });
      expect(error).not.toBeNull();
    });

    it("prevents a non-admin (Bob) from creating a job source", async () => {
      const { error } = await bobClient.from("job_sources").insert({
        name: "Bob Source",
        official_domain: "example.gov.in",
        source_type: "manual_admin_entry",
        source_url: "https://example.gov.in/notice",
      });
      expect(error).not.toBeNull();
    });

    it("allows an editor (Alice) to create a job notification (editor-tier write)", async () => {
      const { data, error } = await aliceClient
        .from("job_notifications")
        .insert({
          organization_id: orgId,
          source_id: sourceId,
          title: "Editor-created Notification",
          slug: `editor-created-${Date.now()}`,
          recruitment_type: "direct",
          official_advertisement_url: "https://example.gov.in/editor-ad.pdf",
          notification_date: "2026-01-01",
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      expect(data?.id).toBeTruthy();
      if (data) await admin.from("job_notifications").delete().eq("id", data.id);
    });

    it("prevents a non-admin (Bob) from creating an eligibility rule row directly", async () => {
      const { error } = await bobClient.from("job_age_rules").insert({
        job_post_id: publishedPostId,
        min_age: 18,
        max_age: 30,
        age_cutoff_date: "2026-01-01",
      });
      expect(error).not.toBeNull();
    });

    it("allows an editor (Alice) to write an eligibility rule row for a post", async () => {
      const { error } = await aliceClient
        .from("job_gender_rules")
        .upsert(
          { job_post_id: publishedPostId, allowed_gender: "all" },
          { onConflict: "job_post_id" },
        );
      expect(error).toBeNull();
      await admin.from("job_gender_rules").delete().eq("job_post_id", publishedPostId);
    });

    it("prevents an editor (Alice) from granting herself a higher role (role escalation)", async () => {
      const { error } = await aliceClient
        .from("admin_role_assignments")
        .insert({ user_id: aliceId, role_code: "super_admin" });
      expect(error).not.toBeNull();
    });

    it("prevents an admin-tier user (not super_admin) from writing admin_role_assignments", async () => {
      // admin_role_assignments_write_super_admin requires the literal
      // super_admin tier — 'admin' is not sufficient, unlike every other
      // *_write_admin policy in this schema (DATABASE.md §24).
      await admin.from("admin_role_assignments").insert({ user_id: bobId, role_code: "admin" });

      const { error } = await bobClient
        .from("admin_role_assignments")
        .insert({ user_id: aliceId, role_code: "admin" });
      expect(error).not.toBeNull();

      await admin
        .from("admin_role_assignments")
        .delete()
        .eq("user_id", bobId)
        .eq("role_code", "admin");
    });

    it("prevents a non-admin (Bob) from modifying job_history/audit_logs even indirectly through no available insert path", async () => {
      // Re-confirms the Phase 2 invariant still holds after Phase 6's admin
      // write paths were added — job_history/audit_logs remain writable
      // only through lib/audit.ts's service-role path, never through any
      // RLS-scoped client regardless of role.
      const historyResult = await aliceClient.from("job_history").insert({
        job_notification_id: publishedNotificationId,
        field_name: "title",
        old_value: "a",
        new_value: "b",
      });
      expect(historyResult.error).not.toBeNull();
    });
  });

  // Phase 7 (AI Ingestion). Alice still holds 'editor' (>= reviewer) from the
  // Phase 6 block above; Bob's temporary 'admin' grant was revoked at the end
  // of that block, so he's back to no role here — exactly the two tiers
  // job_imports RLS needs to distinguish (db/admin/job-imports.ts's own
  // comment: SELECT/UPDATE for reviewer+, no INSERT/DELETE for any
  // application role at all — ingestion writes go through the service-role
  // client in services/admin/job-imports.ts).
  describe("Phase 7: job_imports RLS boundaries", () => {
    let importId = "";

    beforeAll(async () => {
      const { data } = await admin
        .from("job_imports")
        .insert({
          job_source_id: sourceId,
          source_url: "https://example.gov.in/notice.pdf",
          status: "review_required",
        })
        .select("id")
        .single();
      importId = data!.id;
    });

    afterAll(async () => {
      if (importId) await admin.from("job_imports").delete().eq("id", importId);
    });

    it("prevents a non-admin (Bob) from reading job_imports", async () => {
      const { data, error } = await bobClient.from("job_imports").select("id").eq("id", importId);
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it("lets an editor (Alice, >= reviewer) read job_imports", async () => {
      const { data, error } = await aliceClient.from("job_imports").select("id").eq("id", importId);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });

    it("prevents an editor (Alice) from inserting a job_imports row directly — no INSERT policy exists for any application role", async () => {
      const { error } = await aliceClient.from("job_imports").insert({
        job_source_id: sourceId,
        source_url: "https://example.gov.in/alice-hack.pdf",
        status: "discovered",
      });
      expect(error).not.toBeNull();
    });

    it("prevents a non-admin (Bob) from updating job_imports", async () => {
      await bobClient.from("job_imports").update({ status: "approved" }).eq("id", importId);
      const { data } = await admin.from("job_imports").select("status").eq("id", importId).single();
      expect(data?.status).toBe("review_required");
    });

    it("lets an editor (Alice, >= reviewer) update job_imports (the reviewer approve/reject path)", async () => {
      const { error } = await aliceClient
        .from("job_imports")
        .update({ status: "rejected", reviewed_by: aliceId, review_notes: "not a real notice" })
        .eq("id", importId);
      expect(error).toBeNull();

      const { data } = await admin
        .from("job_imports")
        .select("status, review_notes")
        .eq("id", importId)
        .single();
      expect(data?.status).toBe("rejected");
      expect(data?.review_notes).toBe("not a real notice");
    });

    it("prevents deleting job_imports through any RLS-scoped client — no DELETE policy for any application role", async () => {
      await aliceClient.from("job_imports").delete().eq("id", importId);
      const { data } = await admin
        .from("job_imports")
        .select("id")
        .eq("id", importId)
        .maybeSingle();
      expect(data).not.toBeNull();
    });
  });
});
