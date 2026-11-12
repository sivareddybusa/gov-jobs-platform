import Link from "next/link";
import { EligibilityBadge } from "./eligibility-badge";
import type { EligibilityStatus } from "@/domain/eligibility";
import type { JobNotificationSummary } from "@/db/jobs";

export function JobCard({
  notification,
  eligibilityStatus,
}: {
  notification: JobNotificationSummary;
  /** Best (most favorable) status across the notification's posts, or undefined if not yet computed (e.g. logged-out view). */
  eligibilityStatus?: EligibilityStatus | undefined;
}) {
  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <Link
            href={`/jobs/${notification.slug}`}
            className="font-medium text-gray-900 hover:text-brand-700"
          >
            {notification.title}
          </Link>
          <p className="mt-0.5 text-xs text-gray-500">{notification.organizations.name}</p>
        </div>
        {eligibilityStatus ? <EligibilityBadge status={eligibilityStatus} /> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>Notified {notification.notification_date}</span>
        {notification.application_end_date ? (
          <span>Closes {notification.application_end_date}</span>
        ) : null}
      </div>
    </li>
  );
}
