import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getPublishedExamBySlug } from "@/db/exams";
import { getPracticeSet } from "@/db/questions";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { PracticeSession } from "@/components/practice/practice-session";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `Practice · ${slug.replace(/-/g, " ")}` };
}

const SET_SIZE = 10;

export default async function PracticeExamPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ subject?: string | string[] }>;
}) {
  const { slug } = await params;
  const { subject: rawSubject } = await searchParams;
  const subject =
    typeof rawSubject === "string" && rawSubject.length <= 300 ? rawSubject : undefined;
  const { supabase, user } = await requireUser(`/practice/${slug}`);
  const exam = await getPublishedExamBySlug(supabase, slug);
  if (!exam) notFound();

  const set = await getPracticeSet(supabase, user.id, exam.id, { subject, limit: SET_SIZE });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/practice" className="text-sm font-medium text-brand-600 hover:underline">
        ← Practice
      </Link>
      <PageHeader
        title={exam.name}
        description={`${subject ?? "All subjects"} · you have answered ${set.answered} of ${set.total} questions here`}
      />
      {set.questions.length === 0 ? (
        <Card className="text-sm text-gray-500">
          No practice questions are available for this selection yet.
        </Card>
      ) : (
        <PracticeSession questions={set.questions} />
      )}
    </div>
  );
}
