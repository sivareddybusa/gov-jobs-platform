import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export type MockAttempt = Database["public"]["Tables"]["mock_attempts"]["Row"];
export type MockAttemptWithExam = MockAttempt & {
  exams: { name: string; slug: string } | null;
  /** True while the attempt is open AND its server deadline has not passed. */
  running: boolean;
  /** The server clock when this was read, for the countdown. */
  serverNowMs: number;
};

export type MockQuestion = {
  position: number;
  questionId: string;
  prompt: string;
  options: string[];
  subject: string | null;
  topic: string | null;
  selectedIndex: number | null;
  /** Present only after the attempt has ended. */
  correctIndex: number | null;
  explanation: string | null;
};

// Every write goes through a database function that checks ownership, the deadline and the
// attempt's state; these helpers only call them. `db` is the signed-in user's client.

type RawAttempt = MockAttempt & { exams: { name: string; slug: string } | null };

function withClock(a: RawAttempt): MockAttemptWithExam {
  const now = Date.now();
  return {
    ...a,
    serverNowMs: now,
    running: a.status === "in_progress" && new Date(a.expires_at).getTime() > now,
  };
}

export async function startMockAttempt(
  db: DB,
  examId: string,
  count?: number,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await db.rpc("start_mock_attempt", {
    p_exam_id: examId,
    ...(count ? { p_count: count } : {}),
  });
  if (error || !data) return { error: friendly(error?.message) };
  return { id: data };
}

export async function saveMockAnswer(
  db: DB,
  attemptId: string,
  questionId: string,
  selected: number | null,
): Promise<{ ok: true } | { ok: false; error: string; finished: boolean }> {
  const { data, error } = await db.rpc("save_mock_answer", {
    p_attempt_id: attemptId,
    p_question_id: questionId,
    // The generated type is non-null; the function accepts null to clear an answer.
    p_selected: selected as number,
  });
  if (error) {
    return {
      ok: false,
      error: friendly(error.message),
      finished: /already finished/.test(error.message),
    };
  }
  // 'expired': the deadline passed, the attempt was closed and scored, and this answer was not stored.
  if (data === "expired") return { ok: false, error: friendly("Time is up"), finished: true };
  return { ok: true };
}

export async function submitMockAttempt(db: DB, attemptId: string): Promise<string | null> {
  const { data, error } = await db.rpc("submit_mock_attempt", { p_attempt_id: attemptId });
  return error ? null : data;
}

export async function getMockAttempt(db: DB, userId: string, id: string) {
  const { data } = await db
    .from("mock_attempts")
    .select("*, exams(name, slug)")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? withClock(data as RawAttempt) : null;
}

export async function listMockAttempts(db: DB, userId: string, limit = 30) {
  const { data } = await db
    .from("mock_attempts")
    .select("*, exams(name, slug)")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(limit);
  return ((data as RawAttempt[] | null) ?? []).map(withClock);
}

export async function getMockQuestions(db: DB, attemptId: string): Promise<MockQuestion[]> {
  const { data } = await db.rpc("get_mock_questions", { p_attempt_id: attemptId });
  return (data ?? []).map((r) => ({
    position: r.question_position,
    questionId: r.question_id,
    prompt: r.prompt,
    options: Array.isArray(r.options) ? r.options.map(String) : [],
    subject: r.subject,
    topic: r.topic,
    selectedIndex: r.selected_index,
    correctIndex: r.correct_index,
    explanation: r.explanation,
  }));
}

/** Database errors reach users only as one of these messages. */
function friendly(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/Not enough questions/.test(message))
    return "There are not enough questions for a mock test yet.";
  if (/Time is up/.test(message)) return "Time is up. Your test has been submitted.";
  if (/already finished/.test(message)) return "This test is already finished.";
  if (/Exam not available/.test(message)) return "This exam is not available.";
  return "Something went wrong. Please try again.";
}
