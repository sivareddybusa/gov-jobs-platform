import { requireAdminRole } from "@/lib/auth/require-admin";
import { listQuestionStats, listRecentQuestions } from "@/db/admin/questions";
import { isLlmConfigured } from "@/lib/llm/resolve";
import { QUESTION_ORIGIN_LABELS, type QuestionOrigin } from "@/domain/questions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QuestionStatusButton, RunQuestionsButton } from "./controls";

export const metadata = { title: "Questions · Admin" };

export default async function AdminQuestionsPage() {
  const { supabase, user } = await requireAdminRole("reviewer");
  const canAdmin = await supabase.rpc("is_admin", { check_user_id: user.id, min_role: "admin" });
  const isAdmin = canAdmin.data === true;
  // Reviewers read every question through RLS (no service role needed to monitor).
  const [stats, recent, llm] = await Promise.all([
    listQuestionStats(supabase),
    listRecentQuestions(supabase),
    isLlmConfigured(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Questions"
        description="Practice questions are created automatically: read from official sample papers, or written by AI for syllabus topics and published only after automatic checks and an independent second solve agree. Admins monitor and can hide wrong questions; they do not write them."
        actions={isAdmin ? <RunQuestionsButton disabled={!llm} /> : null}
      />
      {!llm ? (
        <Card className="border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          No AI provider is in use. A super admin can add one under Admin → AI providers.
        </Card>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">By exam</h2>
        <ul className="flex flex-col gap-2">
          {stats.map((s) => (
            <li key={s.examId}>
              <Card className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{s.examName}</p>
                  <p className="text-xs text-gray-500">
                    {s.aiPublished} AI-generated · {s.officialPublished} official · {s.hidden}{" "}
                    hidden
                  </p>
                  <p className="text-xs text-gray-500">
                    {s.error
                      ? `Last error: ${s.error}`
                      : s.syncedAt
                        ? `Generated ${new Date(s.syncedAt).toLocaleDateString("en-IN")}`
                        : "No generation run yet"}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Latest questions</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500">
            No questions yet. They appear after the first generation run.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recent.map((q) => (
              <li key={q.id}>
                <Card className="flex flex-wrap items-start justify-between gap-3 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-gray-900">{q.prompt}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {q.examName}
                      {q.topic ? ` · ${q.topic}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex gap-2">
                      <Badge tone={q.origin === "official_paper" ? "green" : "amber"}>
                        {QUESTION_ORIGIN_LABELS[q.origin as QuestionOrigin]}
                      </Badge>
                      <Badge tone={q.status === "published" ? "brand" : "gray"}>{q.status}</Badge>
                    </div>
                    {isAdmin ? (
                      <QuestionStatusButton questionId={q.id} hidden={q.status === "hidden"} />
                    ) : null}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
