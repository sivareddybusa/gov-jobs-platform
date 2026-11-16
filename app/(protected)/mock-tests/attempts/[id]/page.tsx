import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { getMockAttempt, getMockQuestions } from "@/db/mock-tests";
import { MockRunner } from "@/components/mock-tests/mock-runner";
import { MockResults } from "@/components/mock-tests/mock-results";

export const metadata = { title: "Mock Test" };

export default async function MockAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, user } = await requireUser(`/mock-tests/attempts/${id}`);

  // get_mock_questions closes an attempt whose time has run out, so load it first and re-read.
  const questions = await getMockQuestions(supabase, id);
  const attempt = await getMockAttempt(supabase, user.id, id);
  if (!attempt || questions.length === 0) notFound();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/mock-tests" className="text-sm font-medium text-brand-600 hover:underline">
        ← Mock tests
      </Link>
      {attempt.status === "in_progress" ? (
        <MockRunner
          attemptId={attempt.id}
          examName={attempt.exams?.name ?? "Mock test"}
          expiresAt={attempt.expires_at}
          serverNow={attempt.serverNowMs}
          questions={questions.map((q) => ({
            id: q.questionId,
            prompt: q.prompt,
            options: q.options,
            subject: q.subject,
            selectedIndex: q.selectedIndex,
          }))}
        />
      ) : (
        <MockResults attempt={attempt} questions={questions} />
      )}
    </div>
  );
}
