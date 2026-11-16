// Pure helpers for mock tests. The authoritative score is computed by the database on submit;
// scoreAttempt() mirrors that formula so the two can be cross-checked in tests and so the
// review page can break results down by subject.

export const MIN_MOCK_QUESTIONS = 5;
export const DEFAULT_MOCK_QUESTIONS = 20;
export const SECONDS_PER_QUESTION = 60;
/** Practice marking, NOT an official exam's scheme. Mirrors the database defaults. */
export const PRACTICE_MARKS = { correct: 1, wrong: 0.25 } as const;

export type MockRow = {
  subject: string | null;
  selectedIndex: number | null;
  correctIndex: number;
};

export type Marks = { correct: number; wrong: number };

export type MockTally = { correct: number; wrong: number; unanswered: number; score: number };

export function scoreAttempt(rows: MockRow[], marks: Marks = PRACTICE_MARKS): MockTally {
  let correct = 0;
  let wrong = 0;
  let unanswered = 0;
  for (const r of rows) {
    if (r.selectedIndex === null) unanswered++;
    else if (r.selectedIndex === r.correctIndex) correct++;
    else wrong++;
  }
  return { correct, wrong, unanswered, score: correct * marks.correct - wrong * marks.wrong };
}

export type SubjectResult = { subject: string; total: number } & Omit<MockTally, "score">;

export const NO_SUBJECT_LABEL = "Official paper questions";

/** Per-subject counts, in order of first appearance. */
export function subjectBreakdown(rows: MockRow[]): SubjectResult[] {
  const bySubject = new Map<string, MockRow[]>();
  for (const r of rows) {
    const key = r.subject ?? NO_SUBJECT_LABEL;
    bySubject.set(key, [...(bySubject.get(key) ?? []), r]);
  }
  return [...bySubject.entries()].map(([subject, rs]) => {
    const { correct, wrong, unanswered } = scoreAttempt(rs);
    return { subject, total: rs.length, correct, wrong, unanswered };
  });
}

/** Seconds left on the clock (never negative). */
export function remainingSeconds(expiresAtIso: string, nowMs: number): number {
  return Math.max(0, Math.ceil((new Date(expiresAtIso).getTime() - nowMs) / 1000));
}

/** 75 -> "1:15", 3725 -> "1:02:05". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** How many questions a test will have, given what the bank holds (null = too few to start). */
export function plannedQuestionCount(
  available: number,
  wanted = DEFAULT_MOCK_QUESTIONS,
): number | null {
  const n = Math.min(wanted, available);
  return n >= MIN_MOCK_QUESTIONS ? n : null;
}
