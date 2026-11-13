import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { listApplications, listStatusHistory } from "@/db/job-applications";
import { APPLICATION_STATUS_LABELS, isTerminalApplicationStatus } from "@/domain/applications";
import type { ApplicationStatus } from "@/domain/applications";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { ApplicationEditor } from "./application-editor";

export const metadata = { title: "Application Tracker" };

export default async function ApplicationsPage() {
  const { supabase, user } = await requireUser("/applications");
  const applications = await listApplications(supabase, user.id);
  const history = await listStatusHistory(
    supabase,
    applications.map((a) => a.id),
  );
  const historyByApp = new Map<string, typeof history>();
  for (const h of history) {
    const list = historyByApp.get(h.application_id) ?? [];
    list.push(h);
    historyByApp.set(h.application_id, list);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Application Tracker"
        description="Keep track of the jobs you are pursuing. Only you can see this."
      />

      {applications.length === 0 ? (
        <EmptyState
          title="You aren't tracking any applications yet"
          description="Open a job and choose “Track application” on the post you plan to apply for."
          action={
            <Link href="/jobs">
              <Button fullWidth={false} className="px-5">
                Search Government Jobs
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {applications.map((a) => {
            const notification = a.job_posts?.job_notifications;
            const status = a.status as ApplicationStatus;
            const timeline = historyByApp.get(a.id) ?? [];
            return (
              <li key={a.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      {notification ? (
                        <Link
                          href={`/jobs/${notification.slug}`}
                          className="font-medium text-gray-900 hover:text-brand-700"
                        >
                          {a.job_posts?.title} — {notification.title}
                        </Link>
                      ) : (
                        <span className="font-medium text-gray-900">{a.job_posts?.title}</span>
                      )}
                      {notification ? (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {notification.organizations.name}
                          {notification.application_end_date
                            ? ` · Closes ${notification.application_end_date}`
                            : ""}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      tone={
                        status === "selected"
                          ? "green"
                          : isTerminalApplicationStatus(status)
                            ? "gray"
                            : "brand"
                      }
                    >
                      {APPLICATION_STATUS_LABELS[status]}
                    </Badge>
                  </div>

                  {timeline.length > 0 ? (
                    <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      {timeline.map((h) => (
                        <li key={h.id}>
                          {APPLICATION_STATUS_LABELS[h.to_status as ApplicationStatus] ??
                            h.to_status}{" "}
                          · {new Date(h.changed_at).toLocaleDateString("en-IN")}
                        </li>
                      ))}
                    </ol>
                  ) : null}

                  <details className="mt-4 border-t border-gray-100 pt-3">
                    <summary className="cursor-pointer text-sm font-medium text-brand-600">
                      Update details
                    </summary>
                    <div className="mt-3">
                      <ApplicationEditor
                        applicationId={a.id}
                        status={a.status}
                        appliedOn={a.applied_on}
                        applicationNumber={a.application_number}
                        notes={a.notes}
                      />
                    </div>
                  </details>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
