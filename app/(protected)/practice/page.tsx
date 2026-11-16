import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { listExamTargets } from "@/db/exam-targets";
import { getPracticeSummaries } from "@/db/questions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Practice Questions" };

export default async function PracticePage() {
  const { supabase, user } = await requireUser("/practice");
  const targets = (await listExamTargets(supabase, user.id)).filter(
    (t) => t.status === "active" && t.exams && t.exams.status === "published",
  );
  const summaries = await getPracticeSummaries(
    supabase,
    targets.map((t) => t.exam_id),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Practice Questions"
        description="Topic-wise practice with instant feedback for the exams you are preparing for."
      />
      {targets.length === 0 ? (
        <EmptyState
          title="Choose an exam first"
          description="Practice questions are shown for the exams you are preparing for."
          action={
            <Link href="/preparation/exams">
              <Button fullWidth={false} className="px-5">
                Find an Exam
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {targets.map((t) => {
            const s = summaries.get(t.exam_id);
            return (
              <li key={t.id}>
                <Card className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-gray-900">{t.exams!.name}</h2>
                    {s ? (
                      <span className="text-xs text-gray-500">
                        {s.total} {s.total === 1 ? "question" : "questions"}
                        {s.official > 0 ? ` · ${s.official} from official papers` : ""}
                      </span>
                    ) : null}
                  </div>
                  {s && s.total > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/practice/${t.exams!.slug}`}>
                        <Button fullWidth={false} className="px-4 py-1.5 text-xs">
                          Practice all subjects
                        </Button>
                      </Link>
                      {s.subjects.map((subject) => (
                        <Link
                          key={subject.name}
                          href={`/practice/${t.exams!.slug}?subject=${encodeURIComponent(subject.name)}`}
                          className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:border-brand-500 hover:text-brand-700"
                        >
                          {subject.name} ({subject.count})
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">
                      No practice questions are available for this exam yet. They are added
                      automatically from its syllabus and official papers.
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
