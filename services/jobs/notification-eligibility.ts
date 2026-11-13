import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { listJobPostsForNotifications, type JobNotificationSummary } from "@/db/jobs";
import { evaluateJobsForUser } from "@/services/eligibility/evaluate";
import type { EligibilityStatus } from "@/domain/eligibility";

export function bestEligibilityStatus(
  statuses: EligibilityStatus[],
): EligibilityStatus | undefined {
  if (statuses.length === 0) return undefined;
  if (statuses.includes("eligible")) return "eligible";
  if (statuses.includes("needs_verification")) return "needs_verification";
  return "not_eligible";
}

/**
 * Best eligibility status per notification (most favourable across its posts),
 * computed by the deterministic engine. Notifications without posts map to
 * `undefined`.
 */
export async function summarizeNotificationEligibility(
  db: SupabaseClient<Database>,
  userId: string,
  notifications: JobNotificationSummary[],
): Promise<Map<string, EligibilityStatus | undefined>> {
  const posts = await listJobPostsForNotifications(
    db,
    notifications.map((n) => n.id),
  );
  const byPost = await evaluateJobsForUser(
    db,
    userId,
    posts.map((p) => p.id),
  );
  const postsByNotification = new Map<string, EligibilityStatus[]>();
  for (const post of posts) {
    const status = byPost.get(post.id)?.status;
    if (!status) continue;
    const list = postsByNotification.get(post.job_notification_id) ?? [];
    list.push(status);
    postsByNotification.set(post.job_notification_id, list);
  }
  return new Map(
    notifications.map((n) => [n.id, bestEligibilityStatus(postsByNotification.get(n.id) ?? [])]),
  );
}
