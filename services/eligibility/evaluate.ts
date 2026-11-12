import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { evaluateEligibility, type EligibilityResult } from "@/domain/eligibility";
import {
  buildEligibilityProfile,
  buildJobEligibilityRules,
  buildJobEligibilityRulesBatch,
} from "./build-inputs";

/**
 * Evaluates one job post for one user. `userId` must always be the
 * server-resolved session id (never client-supplied) — profile data is
 * fetched via buildEligibilityProfile, which reads only that user's own
 * row/rows, and RLS's profiles_select_own/user_qualifications_all_own/
 * profile_statuses_all_own policies are the independent second layer.
 */
export async function evaluateJobForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobPostId: string,
): Promise<EligibilityResult> {
  const [profile, rules] = await Promise.all([
    buildEligibilityProfile(supabase, userId),
    buildJobEligibilityRules(supabase, jobPostId),
  ]);
  return evaluateEligibility(profile, rules);
}

/**
 * Batch variant for a dashboard/list view — one profile fetch, and one
 * batched rules fetch (7 queries total, not 7×N) via
 * buildJobEligibilityRulesBatch, closing the N+1 cost flagged in
 * docs/PROJECT_STATUS.md's Dashboard/Search phase report.
 */
export async function evaluateJobsForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobPostIds: string[],
): Promise<Map<string, EligibilityResult>> {
  const [profile, rulesByPost] = await Promise.all([
    buildEligibilityProfile(supabase, userId),
    buildJobEligibilityRulesBatch(supabase, jobPostIds),
  ]);
  const result = new Map<string, EligibilityResult>();
  for (const [jobPostId, rules] of rulesByPost) {
    result.set(jobPostId, evaluateEligibility(profile, rules));
  }
  return result;
}
