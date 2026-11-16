import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { QuestionOrigin } from "@/domain/questions";

type DB = SupabaseClient<Database>;

/** A question as candidates see it: never includes the answer. */
export type PracticeQuestion = {
  id: string;
  prompt: string;
  options: string[];
  origin: QuestionOrigin;
  subject: string | null;
  topic: string | null;
  difficulty: string | null;
  sourceUrl: string | null;
};

export type PracticeSummary = {
  total: number;
  official: number;
  /** Subject name -> published question count. */
  subjects: Array<{ name: string; count: number }>;
};

/** Candidate read: RLS limits this to published questions of published, verified exams. */
export async function getPracticeSummaries(
  db: DB,
  examIds: string[],
): Promise<Map<string, PracticeSummary>> {
  const out = new Map<string, PracticeSummary>();
  if (examIds.length === 0) return out;
  const { data } = await db
    .from("questions")
    .select("exam_id, origin, subject")
    .in("exam_id", examIds)
    .eq("status", "published")
    .limit(20_000);
  const bySubject = new Map<string, Map<string, number>>();
  for (const r of data ?? []) {
    const s = out.get(r.exam_id) ?? { total: 0, official: 0, subjects: [] };
    s.total++;
    if (r.origin === "official_paper") s.official++;
    out.set(r.exam_id, s);
    const name = r.subject ?? "Official paper questions";
    const m = bySubject.get(r.exam_id) ?? new Map<string, number>();
    m.set(name, (m.get(name) ?? 0) + 1);
    bySubject.set(r.exam_id, m);
  }
  for (const [examId, m] of bySubject) {
    out.get(examId)!.subjects = [...m.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * A practice set: questions this user has not answered yet come first (random
 * within each group). `subject` filters; the official-paper bucket is "Official paper questions".
 */
export async function getPracticeSet(
  db: DB,
  userId: string,
  examId: string,
  opts: { subject?: string | undefined; limit: number },
): Promise<{ questions: PracticeQuestion[]; total: number; answered: number }> {
  let q = db
    .from("questions")
    .select("id, prompt, options, origin, subject, topic, difficulty, source_url")
    .eq("exam_id", examId)
    .eq("status", "published")
    .limit(2000);
  if (opts.subject === "Official paper questions") q = q.is("subject", null);
  else if (opts.subject) q = q.eq("subject", opts.subject);
  const { data } = await q;
  const rows = data ?? [];
  const ids = rows.map((r) => r.id);

  const answeredIds = new Set<string>();
  if (ids.length > 0) {
    const { data: attempts } = await db
      .from("practice_attempts")
      .select("question_id")
      .eq("user_id", userId)
      .in("question_id", ids);
    for (const a of attempts ?? []) answeredIds.add(a.question_id);
  }

  const fresh = shuffle(rows.filter((r) => !answeredIds.has(r.id)));
  const seen = shuffle(rows.filter((r) => answeredIds.has(r.id)));
  const picked = [...fresh, ...seen].slice(0, opts.limit);
  return {
    total: rows.length,
    answered: answeredIds.size,
    questions: picked.map((r) => ({
      id: r.id,
      prompt: r.prompt,
      options: Array.isArray(r.options) ? r.options.map(String) : [],
      origin: r.origin as QuestionOrigin,
      subject: r.subject,
      topic: r.topic,
      difficulty: r.difficulty,
      sourceUrl: r.source_url,
    })),
  };
}

export type AnswerResult = { correctIndex: number; isCorrect: boolean; explanation: string | null };

/** Records the attempt and reveals the answer (the database function enforces availability). */
export async function answerQuestion(
  db: DB,
  questionId: string,
  selected: number,
): Promise<AnswerResult | null> {
  const { data, error } = await db.rpc("answer_practice_question", {
    p_question_id: questionId,
    p_selected: selected,
  });
  const row = data?.[0];
  if (error || !row) return null;
  return {
    correctIndex: row.correct_index,
    isCorrect: row.is_correct,
    explanation: row.explanation,
  };
}
