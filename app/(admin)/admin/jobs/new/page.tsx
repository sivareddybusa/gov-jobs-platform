import { requireAdminRole } from "@/lib/auth/require-admin";
import { listOrganizations } from "@/db/admin/organizations";
import { listJobSources } from "@/db/admin/job-sources";
import { JobNotificationForm } from "../job-notification-form";
import { createJobNotificationAction } from "../actions";
import { Card } from "@/components/ui/card";

export const metadata = { title: "New job notification · Admin" };

export default async function NewJobNotificationPage() {
  const { supabase } = await requireAdminRole("editor");
  const [organizations, sources] = await Promise.all([
    listOrganizations(supabase),
    listJobSources(supabase),
  ]);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">New job notification</h1>
      <Card>
        <JobNotificationForm
          action={createJobNotificationAction}
          organizations={organizations}
          departments={[]}
          sources={sources}
        />
      </Card>
    </div>
  );
}
