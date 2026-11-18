import { NO_SUBJECT_LABEL, formatClock, subjectBreakdown } from "@/domain/mock-tests";
import type { MockAttemptWithExam, MockQuestion } from "@/db/mock-tests";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/** Results of a finished test. Correct answers and explanations are shown only because it has ended. */
export function MockResults({
  attempt,
  questions,
}: {
  attempt: MockAttemptWithExam;
  questions: MockQuestion[];
}) {
  const marks = { correct: Number(attempt.marks_correct), wrong: Number(attempt.marks_wrong) };
  const max = attempt.question_count * marks.correct;
  const score = Number(attempt.score ?? 0);
  const usedSeconds = attempt.submitted_at
    ? Math.round(
        (new Date(attempt.submitted_at).getTime() - new Date(attempt.started_at).getTime()) / 1000,
      )
    : 0;
  const rows = questions.map((q) => ({
    subject: q.subject,
    selectedIndex: q.selectedIndex,
    correctIndex: q.correctIndex ?? -1,
  }));
  const breakdown = subjectBreakdown(rows);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">
          {attempt.exams?.name ?? "Mock test"}
        </h1>
        <p className="text-xs text-gray-500">
          {attempt.status === "expired"
            ? "Time ran out; answers saved before then were scored. "
            : ""}
          Practice scoring: +{marks.correct} correct, −{marks.wrong} wrong (not an official scheme).
        </p>
      </div>

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Score" value={`${score} / ${max}`} testId="result-score" big />
        <Stat label="Correct" value={String(attempt.correct_count ?? 0)} testId="result-correct" />
        <Stat label="Wrong" value={String(attempt.wrong_count ?? 0)} testId="result-wrong" />
        <Stat
          label="Unanswered"
          value={String(attempt.unanswered_count ?? 0)}
          testId="result-unanswered"
        />
        <Stat label="Time used" value={formatClock(usedSeconds)} />
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">By subject</h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Subject</th>
                <th className="px-3 py-2 font-medium">Questions</th>
                <th className="px-3 py-2 font-medium">Correct</th>
                <th className="px-3 py-2 font-medium">Wrong</th>
                <th className="px-3 py-2 font-medium">Unanswered</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((s) => (
                <tr key={s.subject} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2 text-gray-900">{s.subject || NO_SUBJECT_LABEL}</td>
                  <td className="px-3 py-2">{s.total}</td>
                  <td className="px-3 py-2 text-green-700">{s.correct}</td>
                  <td className="px-3 py-2 text-red-700">{s.wrong}</td>
                  <td className="px-3 py-2 text-gray-500">{s.unanswered}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Review</h2>
        <ol className="flex flex-col gap-3">
          {questions.map((q) => {
            const right = q.selectedIndex !== null && q.selectedIndex === q.correctIndex;
            return (
              <li key={q.questionId}>
                <Card className="flex flex-col gap-3" data-testid="review-item">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">
                      {q.position + 1}. {q.prompt}
                    </p>
                    {q.selectedIndex === null ? (
                      <Badge tone="gray">Unanswered</Badge>
                    ) : right ? (
                      <Badge tone="green">Correct</Badge>
                    ) : (
                      <Badge tone="red">Wrong</Badge>
                    )}
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {q.options.map((option, i) => {
                      const isCorrect = i === q.correctIndex;
                      const isWrongPick = i === q.selectedIndex && !isCorrect;
                      return (
                        <li
                          key={i}
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            isCorrect
                              ? "border-green-500 bg-green-50 text-green-900"
                              : isWrongPick
                                ? "border-red-500 bg-red-50 text-red-900"
                                : "border-gray-200 text-gray-700"
                          }`}
                        >
                          <span className="mr-2 font-semibold">{String.fromCharCode(65 + i)}.</span>
                          {option}
                          {i === q.selectedIndex ? " (your answer)" : ""}
                        </li>
                      );
                    })}
                  </ul>
                  {q.explanation ? <p className="text-sm text-gray-700">{q.explanation}</p> : null}
                </Card>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  testId,
  big,
}: {
  label: string;
  value: string;
  testId?: string;
  big?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p
        data-testid={testId}
        className={
          big ? "text-xl font-semibold text-gray-900" : "text-base font-semibold text-gray-900"
        }
      >
        {value}
      </p>
    </div>
  );
}
