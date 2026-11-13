import { requireUser } from "@/lib/auth/require-user";
import { listLatestPublishedNotifications } from "@/db/jobs";
import { summarizeNotificationEligibility } from "@/services/jobs/notification-eligibility";
import { JobCard } from "@/components/jobs/job-card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata = { title: "Latest Notifications" };

export default async function LatestNotificationsPage() {
  const { supabase, user } = await requireUser("/latest-notifications");
  const notifications = await listLatestPublishedNotifications(supabase, 30);
  const statusById = await summarizeNotificationEligibility(supabase, user.id, notifications);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Latest Notifications"
        description="Most recently published government job notifications."
      />
      {notifications.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="Published notifications will appear here as soon as they are available."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {notifications.map((n) => (
            <JobCard key={n.id} notification={n} eligibilityStatus={statusById.get(n.id)} />
          ))}
        </ul>
      )}
    </div>
  );
}
