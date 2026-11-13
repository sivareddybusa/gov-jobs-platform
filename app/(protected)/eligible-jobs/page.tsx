import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { listLatestPublishedNotifications } from "@/db/jobs";
import { summarizeNotificationEligibility } from "@/services/jobs/notification-eligibility";
import { JobCard } from "@/components/jobs/job-card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Eligible Jobs" };

// Same bounded-scan rationale as the dashboard (see dashboard/page.tsx).
const SCAN_LIMIT = 50;

export default async function EligibleJobsPage() {
  const { supabase, user } = await requireUser("/eligible-jobs");
  const notifications = await listLatestPublishedNotifications(supabase, SCAN_LIMIT);
  const statusById = await summarizeNotificationEligibility(supabase, user.id, notifications);
  const eligible = notifications.filter((n) => statusById.get(n.id) === "eligible");
  const verify = notifications.filter((n) => statusById.get(n.id) === "needs_verification");

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Eligible Jobs"
        description={`Jobs you appear eligible for, based on your profile, among the ${notifications.length} most recent notifications.`}
      />
      {eligible.length === 0 && verify.length === 0 ? (
        <EmptyState
          title="No eligible jobs found"
          description="Nothing in the recent notifications matches your profile yet. Keeping your profile complete and up to date improves matching."
          action={
            <Link href="/profile">
              <Button variant="secondary" fullWidth={false} className="px-5">
                Review my profile
              </Button>
            </Link>
          }
        />
      ) : null}
      {eligible.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Eligible ({eligible.length})</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {eligible.map((n) => (
              <JobCard key={n.id} notification={n} eligibilityStatus="eligible" />
            ))}
          </ul>
        </section>
      ) : null}
      {verify.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">
            Needs verification ({verify.length})
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {verify.map((n) => (
              <JobCard key={n.id} notification={n} eligibilityStatus="needs_verification" />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
