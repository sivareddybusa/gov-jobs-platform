import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type {
  EligibilityProfile,
  Gender,
  JobEligibilityRules,
  RelaxationCombinationMode,
  StateScopeType,
  StatusRequirementType,
  QualificationVerificationStatus,
} from "@/domain/eligibility";
type DB = SupabaseClient<Database>;

/**
 * Shapes real Supabase rows into the pure `domain/eligibility` module's
 * input types. This is the ONLY place database rows cross into the
 * eligibility engine — the engine itself (domain/eligibility/*) never
 * imports Supabase, per ARCHITECTURE.md's framework-independence
 * requirement for domain/. Read-only; every query here is either
 * ownership-scoped (profile data) or covered by RLS's published-post read
 * policies (rule tables) — see db/admin/eligibility-rules.ts's own comment
 * on why those reads are safe for any caller, not just admins.
 */
export async function buildEligibilityProfile(
  supabase: DB,
  userId: string,
): Promise<EligibilityProfile> {
  const [{ data: profile }, { data: statusRows }, { data: qualRows }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
    supabase.from("profile_statuses").select("status_id").eq("profile_id", userId),
    supabase
      .from("user_qualifications")
      .select("qualification_id, qualifications(education_levels(rank))")
      .eq("profile_id", userId),
  ]);

  let educationLevelRank: number | null = null;
  if (profile?.education_level_id) {
    const { data: level } = await supabase
      .from("education_levels")
      .select("rank")
      .eq("id", profile.education_level_id)
      .maybeSingle();
    educationLevelRank = level?.rank ?? null;
  }

  const qualifications = (qualRows ?? [])
    .map((q) => {
      const rank = (q.qualifications as { education_levels: { rank: number } | null } | null)
        ?.education_levels?.rank;
      return rank !== undefined && rank !== null
        ? { qualificationId: q.qualification_id, educationLevelRank: rank }
        : null;
    })
    .filter((q): q is { qualificationId: string; educationLevelRank: number } => q !== null);

  return {
    dateOfBirth: profile?.date_of_birth ?? null,
    categoryId: profile?.category_id ?? null,
    statusIds: (statusRows ?? []).map((s) => s.status_id),
    stateId: profile?.state_id ?? null,
    domicileStateId: profile?.domicile_state_id ?? null,
    gender: (profile?.gender as Gender | null) ?? null,
    experienceYears: profile?.experience_years ?? null,
    qualifications,
    educationLevelRank,
  };
}

export async function buildJobEligibilityRules(
  supabase: DB,
  jobPostId: string,
): Promise<JobEligibilityRules> {
  const batch = await buildJobEligibilityRulesBatch(supabase, [jobPostId]);
  return batch.get(jobPostId) ?? EMPTY_RULES;
}

const EMPTY_RULES: JobEligibilityRules = {
  ageRule: null,
  relaxations: [],
  statusRequirements: [],
  stateScope: null,
  genderRule: null,
  experienceRule: null,
  qualificationRequirements: [],
};

type QualReqJoinRow = {
  job_post_id: string;
  group_id: number;
  qualification_id: string | null;
  verification_status: string;
  qualifications: { is_generic: boolean; education_levels: { rank: number } | null } | null;
  education_levels: { rank: number } | null;
};

/**
 * Batched variant of buildJobEligibilityRules — one query per rule table
 * (7 total) regardless of how many posts are being evaluated, instead of
 * one query per table *per post*. Used by evaluateJobsForUser (dashboard/
 * search list views), where evaluating N posts individually was a real,
 * documented N+1 cost (docs/PROJECT_STATUS.md's Dashboard/Search phase
 * report). buildJobEligibilityRules (above) is now implemented in terms of
 * this function with a single-element list, so both callers share one
 * code path rather than maintaining the row-shaping logic twice.
 */
export async function buildJobEligibilityRulesBatch(
  supabase: DB,
  jobPostIds: string[],
): Promise<Map<string, JobEligibilityRules>> {
  const result = new Map<string, JobEligibilityRules>();
  if (jobPostIds.length === 0) return result;

  const [
    { data: ageRuleRows },
    { data: relaxationRows },
    { data: statusReqRows },
    { data: stateScopeRows },
    { data: genderRuleRows },
    { data: experienceRuleRows },
    { data: qualReqRows },
  ] = await Promise.all([
    supabase.from("job_age_rules").select("*").in("job_post_id", jobPostIds),
    supabase.from("job_relaxations").select("*").in("job_post_id", jobPostIds),
    supabase.from("job_status_requirements").select("*").in("job_post_id", jobPostIds),
    supabase.from("job_state_scope").select("*").in("job_post_id", jobPostIds),
    supabase.from("job_gender_rules").select("*").in("job_post_id", jobPostIds),
    supabase.from("job_experience_rules").select("*").in("job_post_id", jobPostIds),
    supabase
      .from("job_qualification_requirements")
      .select("*, qualifications(is_generic, education_levels(rank)), education_levels(rank)")
      .in("job_post_id", jobPostIds),
  ]);

  const scopeIds = (stateScopeRows ?? []).map((s) => s.id);
  const { data: stateScopeStateRows } =
    scopeIds.length > 0
      ? await supabase.from("job_state_scope_states").select("*").in("job_state_scope_id", scopeIds)
      : { data: [] as Array<{ job_state_scope_id: string; state_id: string }> };

  const statesByScope = new Map<string, string[]>();
  for (const row of stateScopeStateRows ?? []) {
    const list = statesByScope.get(row.job_state_scope_id) ?? [];
    list.push(row.state_id);
    statesByScope.set(row.job_state_scope_id, list);
  }

  const relaxationsByPost = groupBy(relaxationRows ?? [], (r) => r.job_post_id);
  const statusReqsByPost = groupBy(statusReqRows ?? [], (r) => r.job_post_id);
  const qualReqsByPost = groupBy((qualReqRows ?? []) as QualReqJoinRow[], (r) => r.job_post_id);
  const ageRuleByPost = new Map((ageRuleRows ?? []).map((r) => [r.job_post_id, r]));
  const stateScopeByPost = new Map((stateScopeRows ?? []).map((r) => [r.job_post_id, r]));
  const genderRuleByPost = new Map((genderRuleRows ?? []).map((r) => [r.job_post_id, r]));
  const experienceRuleByPost = new Map((experienceRuleRows ?? []).map((r) => [r.job_post_id, r]));

  for (const jobPostId of jobPostIds) {
    const ageRuleRow = ageRuleByPost.get(jobPostId);
    const stateScopeRow = stateScopeByPost.get(jobPostId);
    const genderRuleRow = genderRuleByPost.get(jobPostId);
    const experienceRuleRow = experienceRuleByPost.get(jobPostId);

    result.set(jobPostId, {
      ageRule: ageRuleRow
        ? {
            minAge: ageRuleRow.min_age,
            maxAge: ageRuleRow.max_age,
            ageCutoffDate: ageRuleRow.age_cutoff_date,
            relaxationCombinationMode:
              ageRuleRow.relaxation_combination_mode as RelaxationCombinationMode,
            isConfident: ageRuleRow.is_confident,
          }
        : null,
      relaxations: (relaxationsByPost.get(jobPostId) ?? []).map((r) => ({
        categoryId: r.category_id,
        statusId: r.status_id,
        ageRelaxationYears: r.age_relaxation_years,
        isConfident: r.is_confident,
      })),
      statusRequirements: (statusReqsByPost.get(jobPostId) ?? []).map((r) => ({
        statusId: r.status_id,
        requirementType: r.requirement_type as StatusRequirementType,
        isConfident: r.is_confident,
      })),
      stateScope: stateScopeRow
        ? {
            scopeType: stateScopeRow.scope_type as StateScopeType,
            stateIds: statesByScope.get(stateScopeRow.id) ?? [],
          }
        : null,
      genderRule: genderRuleRow
        ? { allowedGender: genderRuleRow.allowed_gender as "all" | "male" | "female" | "other" }
        : null,
      experienceRule: experienceRuleRow
        ? {
            minYears: experienceRuleRow.min_years,
            maxYears: experienceRuleRow.max_years,
            domainNote: experienceRuleRow.domain_note,
            isConfident: experienceRuleRow.is_confident,
          }
        : null,
      qualificationRequirements: (qualReqsByPost.get(jobPostId) ?? []).map((row) => ({
        groupId: row.group_id,
        qualificationId: row.qualification_id,
        isGeneric: row.qualifications?.is_generic ?? false,
        requiredEducationLevelRank: row.qualifications
          ? (row.qualifications.education_levels?.rank ?? null)
          : (row.education_levels?.rank ?? null),
        verificationStatus: row.verification_status as QualificationVerificationStatus,
      })),
    });
  }

  return result;
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}
