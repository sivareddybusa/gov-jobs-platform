import Link from "next/link";
import { requireAdminRole } from "@/lib/auth/require-admin";
import { listJobNotifications } from "@/db/admin/job-notifications";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Jobs · Admin" };

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

export default async function JobsPage() {
  const { supabase } = await requireAdminRole("reviewer");
  const notifications = await listJobNotifications(supabase);

  return (
    <div>
      <PageHeader
        title="Job notifications"
        actions={
          <Link href="/admin/jobs/new">
            <Button fullWidth={false}>+ New job notification</Button>
          </Link>
        }
      />
      {notifications.length === 0 ? (
        <p className="text-sm text-gray-500">No job notifications yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <Card className="flex items-center justify-between gap-2 p-3.5">
                <div>
                  <Link
                    href={`/admin/jobs/${n.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-brand-700"
                  >
                    {n.title}
                  </Link>
                  <span className="ml-2 text-xs text-gray-500">{n.organizations?.name}</span>
                </div>
                <Badge tone={STATUS_TONE[n.status] ?? "gray"}>{n.status}</Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
