import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { listExamTargets } from "@/db/exam-targets";
import { getPracticeSummaries } from "@/db/questions";
import { listMockAttempts } from "@/db/mock-tests";
import {
  DEFAULT_MOCK_QUESTIONS,
  MIN_MOCK_QUESTIONS,
  PRACTICE_MARKS,
  plannedQuestionCount,
} from "@/domain/mock-tests";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { StartMockForm } from "@/components/mock-tests/start-mock-form";

export const metadata = { title: "Mock Tests" };

export default async function MockTestsPage() {
  const { supabase, user } = await requireUser("/mock-tests");
  const targets = (await listExamTargets(supabase, user.id)).filter(
    (t) => t.status === "active" && t.exams && t.exams.status === "published",
  );
  const [summaries, attempts] = await Promise.all([
    getPracticeSummaries(
      supabase,
      targets.map((t) => t.exam_id),
    ),
    listMockAttempts(supabase, user.id),
  ]);
  const running = new Map(attempts.filter((a) => a.running).map((a) => [a.exam_id, a.id]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mock Tests"
        description="Timed tests built from your exam's question bank and scored on the server."
      />
      <Card className="text-xs text-gray-500">
        Practice scoring: +{PRACTICE_MARKS.correct} for a correct answer, −{PRACTICE_MARKS.wrong}{" "}
        for a wrong one, 0 if unanswered, one minute per question. This is not any official
        exam&apos;s marking scheme.
      </Card>

      {targets.length === 0 ? (
        <EmptyState
          title="Choose an exam first"
          description="Mock tests are available for the exams you are preparing for."
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
            const available = summaries.get(t.exam_id)?.total ?? 0;
            const planned = plannedQuestionCount(available);
            const runningId = running.get(t.exam_id);
            return (
              <li key={t.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">{t.exams!.name}</h2>
                    <p className="text-xs text-gray-500">
                      {planned
                        ? `${planned} questions · ${planned} minutes${planned < DEFAULT_MOCK_QUESTIONS ? " (all the questions available so far)" : ""}`
                        : `Needs at least ${MIN_MOCK_QUESTIONS} questions; ${available} available so far. They are added automatically.`}
                    </p>
                  </div>
                  {runningId ? (
                    <Link href={`/mock-tests/attempts/${runningId}`}>
                      <Button fullWidth={false} className="px-4 py-2">
                        Resume test
                      </Button>
                    </Link>
                  ) : planned ? (
                    <StartMockForm examId={t.exam_id} label="Start mock test" />
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {attempts.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Your attempts</h2>
          <ul className="flex flex-col gap-2">
            {attempts.map((a) => (
              <li key={a.id}>
                <Link href={`/mock-tests/attempts/${a.id}`}>
                  <Card className="flex flex-wrap items-center justify-between gap-2 p-3.5 hover:border-brand-500">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{a.exams?.name ?? "Exam"}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(a.started_at).toLocaleString("en-IN")} · {a.question_count}{" "}
                        questions
                      </p>
                    </div>
                    {a.running ? (
                      <Badge tone="amber">In progress</Badge>
                    ) : (
                      <span
                        data-testid="attempt-score"
                        className="text-sm font-semibold text-gray-900"
                      >
                        {a.score ?? 0} / {Number(a.question_count) * Number(a.marks_correct)}
                      </span>
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
