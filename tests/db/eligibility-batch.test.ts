// Real integration test for services/eligibility/build-inputs.ts's batched
// rule-fetching (buildJobEligibilityRulesBatch), added alongside the N+1
// query reduction it implements (docs/PROJECT_STATUS.md's Dashboard/Search
// phase report flagged the per-post query cost this closes). The existing
// E2E fixtures (tests/e2e/admin.spec.ts, tests/e2e/dashboard.spec.ts) only
// ever exercise a post with zero rules or a single age rule — this test
// creates several posts with distinct, overlapping rule combinations and
// asserts the batched fetch produces results identical to fetching each
// post individually, since a batching bug would most likely show up as
// cross-post data bleeding (post A's rules leaking into post B's result),
// which a single-post-at-a-time fixture could never catch.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  buildJobEligibilityRules,
  buildJobEligibilityRulesBatch,
} from "@/services/eligibility/build-inputs";

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

describe.skipIf(!reachable)("buildJobEligibilityRulesBatch (real Postgres)", () => {
  const admin: SupabaseClient<Database> = createClient(API_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let orgId = "";
  let sourceId = "";
  let notificationId = "";
  let postNoRulesId = "";
  let postAgeOnlyId = "";
  let postFullId = "";
  let categoryId = "";
  let statusId = "";
  let qualificationId = "";
  let stateId = "";

  beforeAll(async () => {
    const { data: category } = await admin
      .from("categories")
      .select("id")
      .eq("code", "OBC")
      .single();
    categoryId = category!.id;
    const { data: status } = await admin.from("statuses").select("id").eq("code", "PWBD").single();
    statusId = status!.id;
    const { data: qualification } = await admin
      .from("qualifications")
      .select("id")
      .eq("code", "ANY_BACHELOR")
      .single();
    qualificationId = qualification!.id;
    const { data: state } = await admin.from("states").select("id").limit(1).single();
    stateId = state!.id;

    const { data: org } = await admin
      .from("organizations")
      .insert({ name: `Batch Test Org ${Date.now()}`, org_type: "central" })
      .select("id")
      .single();
    orgId = org!.id;

    const { data: source } = await admin
      .from("job_sources")
      .insert({
        name: "Batch Test Source",
        official_domain: "example.gov.in",
        source_type: "manual_admin_entry",
        source_url: "https://example.gov.in/notice",
      })
      .select("id")
      .single();
    sourceId = source!.id;

    const { data: notification } = await admin
      .from("job_notifications")
      .insert({
        organization_id: orgId,
        source_id: sourceId,
        title: "Batch Test Notification",
        slug: `batch-test-${Date.now()}`,
        recruitment_type: "direct",
        official_advertisement_url: "https://example.gov.in/ad.pdf",
        notification_date: "2026-01-01",
      })
      .select("id")
      .single();
    notificationId = notification!.id;

    const { data: postNoRules } = await admin
      .from("job_posts")
      .insert({ job_notification_id: notificationId, title: "No Rules Post" })
      .select("id")
      .single();
    postNoRulesId = postNoRules!.id;

    const { data: postAgeOnly } = await admin
      .from("job_posts")
      .insert({ job_notification_id: notificationId, title: "Age Only Post" })
      .select("id")
      .single();
    postAgeOnlyId = postAgeOnly!.id;
    await admin.from("job_age_rules").insert({
      job_post_id: postAgeOnlyId,
      min_age: 21,
      max_age: 28,
      age_cutoff_date: "2026-06-01",
      relaxation_combination_mode: "additive",
    });

    const { data: postFull } = await admin
      .from("job_posts")
      .insert({ job_notification_id: notificationId, title: "Full Rules Post" })
      .select("id")
      .single();
    postFullId = postFull!.id;
    await admin.from("job_age_rules").insert({
      job_post_id: postFullId,
      min_age: 18,
      max_age: 30,
      age_cutoff_date: "2026-06-01",
      relaxation_combination_mode: "max_of",
    });
    await admin.from("job_relaxations").insert([
      { job_post_id: postFullId, category_id: categoryId, age_relaxation_years: 3 },
      { job_post_id: postFullId, status_id: statusId, age_relaxation_years: 10 },
    ]);
    await admin
      .from("job_status_requirements")
      .insert({ job_post_id: postFullId, status_id: statusId, requirement_type: "preference" });
    const { data: scope } = await admin
      .from("job_state_scope")
      .insert({ job_post_id: postFullId, scope_type: "specific_states" })
      .select("id")
      .single();
    await admin
      .from("job_state_scope_states")
      .insert({ job_state_scope_id: scope!.id, state_id: stateId });
    await admin
      .from("job_gender_rules")
      .insert({ job_post_id: postFullId, allowed_gender: "female" });
    await admin
      .from("job_experience_rules")
      .insert({ job_post_id: postFullId, min_years: 2, max_years: 10 });
    await admin.from("job_qualification_requirements").insert({
      job_post_id: postFullId,
      qualification_id: qualificationId,
      group_id: 1,
      verification_status: "verified",
    });
  });

  afterAll(async () => {
    if (notificationId) await admin.from("job_notifications").delete().eq("id", notificationId);
    if (sourceId) await admin.from("job_sources").delete().eq("id", sourceId);
    if (orgId) await admin.from("organizations").delete().eq("id", orgId);
  });

  it("returns empty (unrestricted) rules for a post with no rule rows at all", async () => {
    const batch = await buildJobEligibilityRulesBatch(admin, [postNoRulesId]);
    const result = batch.get(postNoRulesId);
    expect(result).toBeDefined();
    expect(result!.ageRule).toBeNull();
    expect(result!.relaxations).toHaveLength(0);
    expect(result!.qualificationRequirements).toHaveLength(0);
  });

  it("batched fetch for multiple posts matches individual per-post fetches exactly", async () => {
    const postIds = [postNoRulesId, postAgeOnlyId, postFullId];
    const batch = await buildJobEligibilityRulesBatch(admin, postIds);

    for (const postId of postIds) {
      const individual = await buildJobEligibilityRules(admin, postId);
      expect(batch.get(postId)).toEqual(individual);
    }
  });

  it("does not leak one post's rules into another post's result (no cross-post bleeding)", async () => {
    const batch = await buildJobEligibilityRulesBatch(admin, [postAgeOnlyId, postFullId]);

    const ageOnly = batch.get(postAgeOnlyId)!;
    expect(ageOnly.ageRule?.minAge).toBe(21);
    expect(ageOnly.relaxations).toHaveLength(0);
    expect(ageOnly.genderRule).toBeNull();
    expect(ageOnly.qualificationRequirements).toHaveLength(0);

    const full = batch.get(postFullId)!;
    expect(full.ageRule?.minAge).toBe(18);
    expect(full.relaxations).toHaveLength(2);
    expect(full.genderRule?.allowedGender).toBe("female");
    expect(full.stateScope?.stateIds).toEqual([stateId]);
    expect(full.qualificationRequirements).toHaveLength(1);
    expect(full.qualificationRequirements[0]?.qualificationId).toBe(qualificationId);
  });

  it("returns an empty map for an empty input list without querying", async () => {
    const batch = await buildJobEligibilityRulesBatch(admin, []);
    expect(batch.size).toBe(0);
  });
});
