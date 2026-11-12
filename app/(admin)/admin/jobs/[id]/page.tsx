import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/require-admin";
import { listOrganizations, listDepartments } from "@/db/admin/organizations";
import { listJobSources } from "@/db/admin/job-sources";
import { getJobNotificationById, listJobPosts } from "@/db/admin/job-notifications";
import { listJobHistory } from "@/db/admin/job-history";
import { JobNotificationForm } from "../job-notification-form";
import { updateJobNotificationAction } from "../actions";
import { StatusActions } from "./status-actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Edit job notification · Admin" };

// UI-only hint of which transitions make sense from the current status —
// purely cosmetic; transitionJobNotificationStatusUseCase re-validates the
// actual precondition server-side regardless (services/admin/job-notifications.ts).
const AVAILABLE_ACTIONS: Record<string, string[]> = {
  discovered: ["approve"],
  imported: ["approve"],
  processing: ["approve"],
  review_required: ["approve"],
  approved: ["publish", "archive"],
  published: ["unpublish", "expire", "archive"],
  expired: ["publish", "archive"],
  archived: [],
};

const STATUS_TONE: Record<string, "gray" | "green" | "red" | "amber" | "brand"> = {
  discovered: "gray",
  imported: "gray",
  processing: "amber",
  review_required: "amber",
  approved: "brand",
  published: "green",
  unpublished: "gray",
  expired: "red",
  archived: "gray",
};

export default async function EditJobNotificationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdminRole("reviewer");
  const notification = await getJobNotificationById(supabase, id);
  if (!notification) notFound();

  const [organizations, departments, sources, posts, history] = await Promise.all([
    listOrganizations(supabase),
    listDepartments(supabase, notification.organization_id),
    listJobSources(supabase),
    listJobPosts(supabase, id),
    listJobHistory(supabase, id),
  ]);

  const boundAction = updateJobNotificationAction.bind(null, id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Edit job notification</h1>
          <Badge tone={STATUS_TONE[notification.status] ?? "gray"}>{notification.status}</Badge>
        </div>
        <StatusActions
          id={id}
          available={(AVAILABLE_ACTIONS[notification.status] ?? []) as never}
        />
        <Card className="mt-4">
          <JobNotificationForm
            action={boundAction}
            organizations={organizations}
            departments={departments}
            sources={sources}
            defaultValues={{
              organizationId: notification.organization_id,
              departmentId: notification.department_id ?? "",
              sourceId: notification.source_id,
              title: notification.title,
              description: notification.description ?? "",
              recruitmentType: notification.recruitment_type,
              officialAdvertisementUrl: notification.official_advertisement_url,
              officialApplicationUrl: notification.official_application_url ?? "",
              notificationDate: notification.notification_date,
              applicationStartDate: notification.application_start_date ?? "",
              applicationEndDate: notification.application_end_date ?? "",
            }}
          />
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Job posts</h2>
          <Link
            href={`/admin/jobs/${id}/posts/new`}
            className="text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            + New post
          </Link>
        </div>
        {posts.length === 0 ? (
          <p className="text-sm text-gray-500">No posts yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {posts.map((p) => (
              <li key={p.id}>
                <Card className="p-3.5">
                  <Link
                    href={`/admin/jobs/${id}/posts/${p.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-brand-700"
                  >
                    {p.title}
                  </Link>
                  {p.vacancy_count !== null ? (
                    <span className="ml-2 text-xs text-gray-500">{p.vacancy_count} vacancies</span>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Change history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">No changes recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-xs text-gray-600">
            {history.map((h) => (
              <li key={h.id} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5">
                {new Date(h.changed_at).toLocaleString()} — {h.field_name}: {h.old_value ?? "∅"} →{" "}
                {h.new_value ?? "∅"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
