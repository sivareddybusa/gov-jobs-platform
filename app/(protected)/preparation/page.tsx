import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { listExamTargets } from "@/db/exam-targets";
import { EXAM_CATEGORY_LABELS, TARGET_STATUS_LABELS } from "@/domain/exams";
import type { ExamCategory, TargetStatus } from "@/domain/exams";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { TargetActions } from "./target-actions";

export const metadata = { title: "My Preparation" };

export default async function PreparationPage() {
  const { supabase, user } = await requireUser("/preparation");
  const targets = await listExamTargets(supabase, user.id);
  const current = targets.filter((t) => t.status !== "removed");
  const removed = targets.filter((t) => t.status === "removed");

  const findExam = (
    <Link href="/preparation/exams">
      <Button fullWidth={false} className="px-5">
        Find an Exam
      </Button>
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My Preparation"
        description="The exams you are preparing for. Choose one primary exam; add others as secondary."
        actions={current.length > 0 ? findExam : undefined}
      />

      {current.length === 0 ? (
        <EmptyState
          title="You haven't chosen an exam to prepare for"
          description="Pick the government exam you are aiming for and your preparation dashboard will be set up around it. You can prepare for more than one exam and switch your primary one any time."
          action={findExam}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {current.map((t) => {
            const exam = t.exams;
            if (!exam) return null;
            const status = t.status as TargetStatus;
            return (
              <li key={t.id}>
                <Card className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/preparation/exams/${exam.slug}`}
                        className="font-medium text-gray-900 hover:text-brand-700"
                      >
                        {exam.name}
                      </Link>
                      {t.is_primary ? (
                        <Badge tone="brand">Primary</Badge>
                      ) : (
                        <Badge>Secondary</Badge>
                      )}
                      {status === "paused" ? (
                        <Badge tone="amber">{TARGET_STATUS_LABELS[status]}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {EXAM_CATEGORY_LABELS[exam.category as ExamCategory]}
                      {t.target_year ? ` · Target year ${t.target_year}` : ""}
                      {exam.status !== "published" ? " · No longer in the catalog" : ""}
                    </p>
                  </div>
                  <TargetActions
                    targetId={t.id}
                    actions={
                      status === "active"
                        ? [...(t.is_primary ? [] : (["make_primary"] as const)), "pause", "remove"]
                        : ["resume", "remove"]
                    }
                  />
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {removed.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-gray-900">Previously prepared</h2>
          <Card className="divide-y divide-gray-100 p-0">
            {removed.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="text-gray-700">{t.exams?.name}</span>
                <TargetActions targetId={t.id} actions={["resume"]} />
              </div>
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
