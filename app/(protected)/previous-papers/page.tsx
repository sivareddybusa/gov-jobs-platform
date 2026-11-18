import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { listExamTargets } from "@/db/exam-targets";
import { listPapersByKind } from "@/db/materials";
import { getPracticeSummaries } from "@/db/questions";
import { PaperList, hasPapers } from "@/components/preparation/paper-list";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Previous Year Papers" };

export default async function PreviousPapersPage() {
  const { supabase, user } = await requireUser("/previous-papers");
  const targets = (await listExamTargets(supabase, user.id)).filter(
    (t) => t.status === "active" && t.exams && t.exams.status === "published",
  );
  const examIds = targets.map((t) => t.exam_id);
  const summaries = await getPracticeSummaries(supabase, examIds);
  const withPapers = await Promise.all(
    targets.map(async (t) => ({ target: t, grouped: await listPapersByKind(supabase, t.exam_id) })),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Previous Year Papers"
        description="Official question papers and answer keys for the exams you are preparing for, linked from the conducting body's own website."
      />
      {withPapers.length === 0 ? (
        <EmptyState
          title="Choose an exam first"
          description="Previous papers are shown for the exams you are preparing for."
          action={
            <Link href="/preparation/exams">
              <Button fullWidth={false} className="px-5">
                Find an Exam
              </Button>
            </Link>
          }
        />
      ) : (
        withPapers.map(({ target, grouped }) => {
          const official = summaries.get(target.exam_id)?.official ?? 0;
          return (
            <section key={target.id}>
              <h2 className="mb-3 text-sm font-semibold text-gray-900">
                <Link
                  href={`/preparation/exams/${target.exams!.slug}`}
                  className="hover:text-brand-700"
                >
                  {target.exams!.name}
                </Link>
              </h2>
              {hasPapers(grouped) ? (
                <Card>
                  <PaperList grouped={grouped} />
                </Card>
              ) : (
                <Card className="text-sm text-gray-500">
                  No official question papers have been found for this exam yet. They appear here
                  automatically once the exam&apos;s official website lists them.
                </Card>
              )}
              {official > 0 ? (
                <p className="mt-2 text-xs text-gray-600">
                  {official} {official === 1 ? "question" : "questions"} from official papers{" "}
                  {official === 1 ? "is" : "are"} also available in{" "}
                  <Link
                    href={`/practice/${target.exams!.slug}`}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    Practice
                  </Link>
                  .
                </p>
              ) : null}
            </section>
          );
        })
      )}
    </div>
  );
}
