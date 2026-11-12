import { requireUser } from "@/lib/auth/require-user";
import { searchPublishedNotifications, listJobPostsForNotifications } from "@/db/jobs";
import { listOrganizations } from "@/db/admin/organizations";
import { listActiveStates } from "@/db/reference-data";
import { evaluateJobsForUser } from "@/services/eligibility/evaluate";
import { JobCard } from "@/components/jobs/job-card";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { EligibilityStatus } from "@/domain/eligibility";

export const metadata = { title: "Browse jobs" };

const SEARCH_LIMIT = 50;

function bestStatus(statuses: EligibilityStatus[]): EligibilityStatus | undefined {
  if (statuses.length === 0) return undefined;
  if (statuses.includes("eligible")) return "eligible";
  if (statuses.includes("needs_verification")) return "needs_verification";
  return "not_eligible";
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    stateId?: string;
    organizationId?: string;
    eligibility?: string;
  }>;
}) {
  const { supabase, user } = await requireUser("/jobs");
  const params = await searchParams;

  const [notifications, organizations, states] = await Promise.all([
    searchPublishedNotifications(supabase, {
      query: params.q,
      stateId: params.stateId,
      organizationId: params.organizationId,
      limit: SEARCH_LIMIT,
    }),
    listOrganizations(supabase),
    listActiveStates(supabase),
  ]);

  const notificationIds = notifications.map((n) => n.id);
  const posts = await listJobPostsForNotifications(supabase, notificationIds);
  const eligibilityByPost = await evaluateJobsForUser(
    supabase,
    user.id,
    posts.map((p) => p.id),
  );

  const postsByNotification = new Map<string, string[]>();
  for (const post of posts) {
    const list = postsByNotification.get(post.job_notification_id) ?? [];
    list.push(post.id);
    postsByNotification.set(post.job_notification_id, list);
  }

  let filtered = notifications.map((n) => {
    const postIds = postsByNotification.get(n.id) ?? [];
    const statuses = postIds
      .map((id) => eligibilityByPost.get(id)?.status)
      .filter((s): s is EligibilityStatus => s !== undefined);
    return { notification: n, status: bestStatus(statuses) };
  });

  if (params.eligibility && params.eligibility !== "all") {
    filtered = filtered.filter((f) => f.status === params.eligibility);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Browse jobs"
        description="Search and filter every published notification."
      />

      <Card>
        <form method="get" className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="q" className="text-sm font-medium text-gray-700">
              Keyword
            </label>
            <input
              id="q"
              name="q"
              defaultValue={params.q ?? ""}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/40"
              placeholder="Title or description"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="stateId" className="text-sm font-medium text-gray-700">
              State
            </label>
            <select
              id="stateId"
              name="stateId"
              defaultValue={params.stateId ?? ""}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/40"
            >
              <option value="">All states</option>
              {states.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="organizationId" className="text-sm font-medium text-gray-700">
              Organization
            </label>
            <select
              id="organizationId"
              name="organizationId"
              defaultValue={params.organizationId ?? ""}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/40"
            >
              <option value="">All organizations</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="eligibility" className="text-sm font-medium text-gray-700">
              Eligibility
            </label>
            <select
              id="eligibility"
              name="eligibility"
              defaultValue={params.eligibility ?? "all"}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/40"
            >
              <option value="all">Any</option>
              <option value="eligible">Eligible</option>
              <option value="needs_verification">Needs verification</option>
              <option value="not_eligible">Not eligible</option>
            </select>
          </div>
          <Button type="submit" fullWidth={false} className="px-5">
            Search
          </Button>
        </form>
      </Card>

      {filtered.length === 0 ? (
        <Card className="text-sm text-gray-500">No jobs match your filters.</Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map(({ notification, status }) => (
            <JobCard key={notification.id} notification={notification} eligibilityStatus={status} />
          ))}
        </ul>
      )}
    </div>
  );
}
