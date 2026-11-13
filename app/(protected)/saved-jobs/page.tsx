import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { listSavedJobs } from "@/db/saved-jobs";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Saved Jobs" };

export default async function SavedJobsPage() {
  const { supabase, user } = await requireUser("/saved-jobs");
  const saved = await listSavedJobs(supabase, user.id);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Saved Jobs" description="Jobs you bookmarked to come back to." />
      {saved.length === 0 ? (
        <EmptyState
          title="You haven't saved any jobs yet"
          description="Use “Save” on a job post to keep it here."
          action={
            <Link href="/jobs">
              <Button fullWidth={false} className="px-5">
                Search Government Jobs
              </Button>
            </Link>
          }
        />
      ) : (
        <Card className="divide-y divide-gray-100 p-0">
          {saved.map((s) => {
            const n = s.job_posts?.job_notifications;
            if (!n) return null;
            const expired = Boolean(n.application_end_date && n.application_end_date < today);
            return (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <Link
                    href={`/jobs/${n.slug}`}
                    className="font-medium text-gray-900 hover:text-brand-700"
                  >
                    {s.job_posts?.title} — {n.title}
                  </Link>
                  <p className="text-xs text-gray-500">{n.organizations.name}</p>
                </div>
                {expired ? (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                    Expired
                  </span>
                ) : null}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
