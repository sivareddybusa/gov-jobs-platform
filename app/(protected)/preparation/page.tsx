import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "My Preparation" };

export default async function PreparationPage() {
  await requireUser("/preparation");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My Preparation"
        description="Your exam preparation hub: syllabus progress, study plan, practice and mock tests for the exams you are targeting."
      />
      <EmptyState
        title="You haven't chosen an exam to prepare for"
        description="Pick the government exam you are aiming for and your preparation dashboard will be set up around it. You can prepare for more than one exam and switch your primary one any time."
        action={
          <Link href="/preparation/exams">
            <Button fullWidth={false} className="px-5">
              Find an Exam
            </Button>
          </Link>
        }
      />
    </div>
  );
}
