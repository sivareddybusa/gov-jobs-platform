import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getOwnProfile, isProfileComplete } from "@/lib/auth/profile";
import {
  listLatestPublishedNotifications,
  listJobPostsForNotifications,
  type JobNotificationSummary,
} from "@/db/jobs";
import { listSavedJobs } from "@/db/saved-jobs";
import { evaluateJobsForUser } from "@/services/eligibility/evaluate";
import { JobCard } from "@/components/jobs/job-card";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import type { EligibilityStatus } from "@/domain/eligibility";

export const metadata = { title: "Dashboard" };

// Bounded to the platform's most recent DASHBOARD_SCAN_LIMIT published
// notifications for the eligible-count/recommended computation — evaluating
// every published post on every dashboard load doesn't scale past MVP size
// (PRD.md §22's "avoid unnecessary complexity" + the roadmap's Phase 9 note
// on N+1/search-boundary design). At MVP scale (a govt-jobs platform with
// dozens to low hundreds of live notifications) this covers the whole
// active set in practice; a true platform-wide count is Phase 9 scope.
const DASHBOARD_SCAN_LIMIT = 50;

function bestStatus(statuses: EligibilityStatus[]): EligibilityStatus | undefined {
  if (statuses.length === 0) return undefined;
  if (statuses.includes("eligible")) return "eligible";
  if (statuses.includes("needs_verification")) return "needs_verification";
  return "not_eligible";
}

export default async function DashboardPage() {
  const { supabase, user } = await requireUser("/dashboard");
  const profile = await getOwnProfile(supabase, user.id);

  if (!isProfileComplete(profile)) {
    redirect("/onboarding");
  }

  const [notifications, savedJobs] = await Promise.all([
    listLatestPublishedNotifications(supabase, DASHBOARD_SCAN_LIMIT),
    listSavedJobs(supabase, user.id),
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

  const notificationStatus = new Map<string, EligibilityStatus | undefined>();
  let eligibleCount = 0;
  for (const notification of notifications) {
    const postIds = postsByNotification.get(notification.id) ?? [];
    const statuses = postIds
      .map((id) => eligibilityByPost.get(id)?.status)
      .filter((s): s is EligibilityStatus => s !== undefined);
    const best = bestStatus(statuses);
    notificationStatus.set(notification.id, best);
    if (best === "eligible") eligibleCount++;
  }

  const latest = notifications.slice(0, 5);
  const closingSoon = notifications
    .filter((n) => n.application_end_date)
    .sort((a, b) => (a.application_end_date! < b.application_end_date! ? -1 : 1))
    .slice(0, 5);
  const recommended = notifications
    .filter((n) => notificationStatus.get(n.id) === "eligible")
    .slice(0, 5);

  const renderSection = (title: string, items: JobNotificationSummary[]) => (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-gray-900">{title}</h2>
      {items.length === 0 ? (
        <Card className="text-sm text-gray-500">Nothing here yet.</Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((n) => (
            <JobCard key={n.id} notification={n} eligibilityStatus={notificationStatus.get(n.id)} />
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Welcome back"
        description={`You're logged in as ${user.email}. You appear eligible for ${eligibleCount} of the ${notifications.length} most recent published notifications.`}
        actions={
          <Link
            href="/jobs"
            className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            Browse and search all jobs →
          </Link>
        }
      />

      {renderSection("Recommended for you", recommended)}
      {renderSection("Latest jobs", latest)}
      {renderSection("Closing soon", closingSoon)}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Saved jobs</h2>
        {savedJobs.length === 0 ? (
          <Card className="text-sm text-gray-500">You haven&apos;t saved any jobs yet.</Card>
        ) : (
          <Card className="divide-y divide-gray-100 p-0">
            {savedJobs.map((saved) => {
              const notification = saved.job_posts?.job_notifications;
              if (!notification) return null;
              // PRD.md §15: "visually indicate when the underlying job has
              // expired (application deadline passed)" — this is about the
              // deadline itself, not the `status` field, since nothing
              // auto-transitions status on deadline passing without an
              // explicit admin "expire" action (Phase 6) or a scheduled job
              // (out of MVP scope).
              const today = new Date().toISOString().slice(0, 10);
              const isExpired = Boolean(
                notification.application_end_date && notification.application_end_date < today,
              );
              return (
                <div
                  key={saved.id}
                  className="flex items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <Link
                    href={`/jobs/${notification.slug}`}
                    className="font-medium text-gray-900 hover:text-brand-700"
                  >
                    {notification.title}
                  </Link>
                  {isExpired ? (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                      Expired — no longer accepting applications
                    </span>
                  ) : null}
                </div>
              );
            })}
          </Card>
        )}
      </section>
    </div>
  );
}
