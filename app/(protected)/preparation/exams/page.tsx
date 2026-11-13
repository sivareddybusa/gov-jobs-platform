import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { searchPublishedExams } from "@/db/exams";
import { listExamTargets } from "@/db/exam-targets";
import { examSearchParamsSchema } from "@/lib/validation/exams";
import { EXAM_CATEGORIES, EXAM_CATEGORY_LABELS } from "@/domain/exams";
import type { ExamCategory } from "@/domain/exams";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StartPreparingForm } from "../start-preparing-form";

export const metadata = { title: "Find an Exam" };

export default async function FindExamPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const { supabase, user } = await requireUser("/preparation/exams");
  const raw = await searchParams;
  const parsed = examSearchParamsSchema.safeParse({
    q: raw.q || undefined,
    category: raw.category || undefined,
  });
  const filters = parsed.success ? parsed.data : {};

  const [exams, targets] = await Promise.all([
    searchPublishedExams(supabase, { query: filters.q, category: filters.category }),
    listExamTargets(supabase, user.id),
  ]);
  const activeExamIds = new Set(targets.filter((t) => t.status === "active").map((t) => t.exam_id));
  const filtered = Boolean(filters.q || filters.category);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Find an Exam"
        description="Search our verified catalog of government recruitment exams and start preparing."
      />

      <Card>
        <form method="get" className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="q" className="text-sm font-medium text-gray-700">
              Exam name
            </label>
            <input
              id="q"
              name="q"
              defaultValue={filters.q ?? ""}
              placeholder="e.g. IBPS, SSC CGL, RRB"
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/40"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="category" className="text-sm font-medium text-gray-700">
              Category
            </label>
            <select
              id="category"
              name="category"
              defaultValue={filters.category ?? ""}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-brand-500 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/40"
            >
              <option value="">All categories</option>
              {EXAM_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {EXAM_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" fullWidth={false} className="px-5">
            Search
          </Button>
        </form>
      </Card>

      {exams.length === 0 ? (
        <EmptyState
          title={filtered ? "No exams match your search" : "No exams in the catalog yet"}
          description={
            filtered
              ? "Try a different name or clear the category filter. Only exams found on official government websites are listed."
              : "Exams are collected automatically from official government websites and appear here once found. Check back soon, or search live job notifications meanwhile."
          }
          action={
            <Link href="/jobs">
              <Button variant="secondary" fullWidth={false} className="px-5">
                Search Government Jobs
              </Button>
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {exams.map((exam) => (
            <li key={exam.id}>
              <Card className="flex h-full flex-col gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/preparation/exams/${exam.slug}`}
                      className="font-medium text-gray-900 hover:text-brand-700"
                    >
                      {exam.name}
                    </Link>
                    <Badge tone="green">Verified</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {EXAM_CATEGORY_LABELS[exam.category as ExamCategory]}
                    {exam.organizations ? ` · ${exam.organizations.name}` : ""}
                  </p>
                  {exam.description ? (
                    <p className="mt-2 line-clamp-3 text-sm text-gray-600">{exam.description}</p>
                  ) : null}
                </div>
                <div className="mt-auto">
                  {activeExamIds.has(exam.id) ? (
                    <Link
                      href="/preparation"
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      Preparing · view in My Preparation
                    </Link>
                  ) : (
                    <StartPreparingForm examId={exam.id} />
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
