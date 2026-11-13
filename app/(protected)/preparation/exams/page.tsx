import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Find an Exam" };

export default async function FindExamPage() {
  await requireUser("/preparation/exams");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Find an Exam"
        description="Search our verified catalog of government recruitment exams and start preparing."
      />
      <EmptyState
        title="The exam catalog is being set up"
        description="Exams are added to the catalog only after our team verifies them against official sources, so nothing is listed yet. In the meantime you can search live job notifications."
        action={
          <Link href="/jobs">
            <Button variant="secondary" fullWidth={false} className="px-5">
              Search Government Jobs
            </Button>
          </Link>
        }
      />
    </div>
  );
}
