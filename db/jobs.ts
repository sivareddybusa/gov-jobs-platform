import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

// Public/user-facing job reads. RLS's job_notifications_select_published /
// job_posts_select_published policies (DATABASE.md §26) allow any caller —
// authenticated or anonymous — to read `published` notifications and their
// posts; these functions never need to check role, unlike db/admin/*
// (which reads unpublished data too, gated by requireAdminRole upstream).

export type JobNotificationSummary = Database["public"]["Tables"]["job_notifications"]["Row"] & {
  organizations: { id: string; name: string; state_id: string | null };
};
export type JobPostRow = Database["public"]["Tables"]["job_posts"]["Row"];

// `!inner` (not a plain embed) is required: PostgREST only applies a filter
// on an embedded resource's column (e.g. `organizations.state_id=eq...`) as
// a row-excluding join when the embed is inner; a plain embed just nulls
// out the embedded object for non-matching rows without excluding the
// parent row, which would silently return unfiltered results to
// searchPublishedNotifications's stateId filter (confirmed against the real
// local PostgREST instance — a plain embed returned every row with
// `organizations: null` for a filter that should have excluded them).
// Every notification's organization_id is a NOT NULL FK, so `!inner` never
// drops a row when no state filter is applied.
const NOTIFICATION_SELECT = "*, organizations!inner(id, name, state_id)";

export async function listLatestPublishedNotifications(
  db: DB,
  limit = 10,
): Promise<JobNotificationSummary[]> {
  const { data } = await db
    .from("job_notifications")
    .select(NOTIFICATION_SELECT)
    .eq("status", "published")
    .order("notification_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as JobNotificationSummary[] | null) ?? [];
}

export async function listClosingSoonPublishedNotifications(
  db: DB,
  limit = 10,
): Promise<JobNotificationSummary[]> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await db
    .from("job_notifications")
    .select(NOTIFICATION_SELECT)
    .eq("status", "published")
    .not("application_end_date", "is", null)
    .gte("application_end_date", today)
    .order("application_end_date", { ascending: true })
    .limit(limit);
  return (data as JobNotificationSummary[] | null) ?? [];
}

export async function searchPublishedNotifications(
  db: DB,
  filters: {
    query?: string | undefined;
    stateId?: string | undefined;
    organizationId?: string | undefined;
    limit?: number | undefined;
  },
): Promise<JobNotificationSummary[]> {
  let q = db.from("job_notifications").select(NOTIFICATION_SELECT).eq("status", "published");
  if (filters.query && filters.query.trim()) {
    // MVP-simple keyword match across title/description (PRD.md §16: "the
    // product requirement is relevance and reasonable latency at MVP
    // scale, not a specific search engine" — the GIN expression index
    // already in place from Phase 2 is available for a future upgrade to
    // proper `to_tsvector`/`websearch_to_tsquery` ranking without a schema
    // change, deferred to Phase 9 per the roadmap).
    const term = filters.query.trim().replace(/[%_]/g, "");
    q = q.or(`title.ilike.%${term}%,description.ilike.%${term}%`);
  }
  if (filters.stateId) {
    // Notifications don't carry a state directly — filter via the
    // organization's state (state-level recruiting bodies).
    q = q.eq("organizations.state_id", filters.stateId);
  }
  if (filters.organizationId) q = q.eq("organization_id", filters.organizationId);
  const { data } = await q
    .order("notification_date", { ascending: false })
    .limit(filters.limit ?? 50);
  return (data as JobNotificationSummary[] | null) ?? [];
}

export async function getPublishedNotificationBySlug(
  db: DB,
  slug: string,
): Promise<JobNotificationSummary | null> {
  const { data } = await db
    .from("job_notifications")
    .select(NOTIFICATION_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return data as JobNotificationSummary | null;
}

export async function listJobPostsForNotification(
  db: DB,
  jobNotificationId: string,
): Promise<JobPostRow[]> {
  const { data } = await db
    .from("job_posts")
    .select("*")
    .eq("job_notification_id", jobNotificationId)
    .order("created_at");
  return data ?? [];
}

/** Batched variant for a dashboard/list view — one query instead of N. */
export async function listJobPostsForNotifications(
  db: DB,
  jobNotificationIds: string[],
): Promise<JobPostRow[]> {
  if (jobNotificationIds.length === 0) return [];
  const { data } = await db
    .from("job_posts")
    .select("*")
    .in("job_notification_id", jobNotificationIds);
  return data ?? [];
}

export async function getJobSourceById(db: DB, id: string) {
  const { data } = await db.from("job_sources").select("*").eq("id", id).maybeSingle();
  return data;
}
