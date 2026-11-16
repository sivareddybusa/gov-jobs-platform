"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMockAnswerAction, submitMockAction } from "@/app/(protected)/mock-tests/actions";
import { formatClock, remainingSeconds } from "@/domain/mock-tests";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type RunnerQuestion = {
  id: string;
  prompt: string;
  options: string[];
  subject: string | null;
  selectedIndex: number | null;
};

/**
 * The running test. The deadline is the server's `expiresAt`; the clock here is only a display
 * (offset by the server's "now" so a wrong device clock does not matter). The server refuses late
 * answers and scores the test itself, so nothing here can change the result.
 */
export function MockRunner({
  attemptId,
  examName,
  expiresAt,
  serverNow,
  questions,
}: {
  attemptId: string;
  examName: string;
  expiresAt: string;
  serverNow: number;
  questions: RunnerQuestion[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.selectedIndex])),
  );
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  // Server clock minus this device's clock, measured once on mount (see the effect).
  const offset = useRef(0);
  const [left, setLeft] = useState(() => remainingSeconds(expiresAt, serverNow));
  const submitted = useRef(false);
  // Saves still in flight. Server actions run one at a time, so quick clicks queue up.
  const [saving, setSaving] = useState(0);

  function finish() {
    if (submitted.current) return;
    submitted.current = true;
    startTransition(async () => {
      await submitMockAction({ attemptId });
      router.refresh();
    });
  }

  useEffect(() => {
    offset.current = serverNow - Date.now();
    const timer = setInterval(() => {
      const remaining = remainingSeconds(expiresAt, Date.now() + offset.current);
      setLeft(remaining);
      if (remaining <= 0) finish();
    }, 1000);
    return () => clearInterval(timer);
    // finish is stable enough: it only reads refs and the attempt id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt, serverNow]);

  // Warn before leaving the page while an answer is still being saved.
  useEffect(() => {
    if (saving === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);

  const q = questions[index]!;
  const answeredCount = Object.values(selected).filter((v) => v !== null).length;

  function choose(option: number | null) {
    if (submitted.current) return;
    const previous = selected[q.id] ?? null;
    setError(null);
    setSelected((s) => ({ ...s, [q.id]: option }));
    setSaving((n) => n + 1);
    saveMockAnswerAction({ attemptId, questionId: q.id, selected: option }).then((res) => {
      setSaving((n) => n - 1);
      if (res.ok) return;
      if (res.finished) {
        router.refresh();
        return;
      }
      setSelected((s) => ({ ...s, [q.id]: previous }));
      setError(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{examName}</h1>
          <p className="text-xs text-gray-500">
            {answeredCount} of {questions.length} answered ·{" "}
            <span data-testid="save-status">{saving > 0 ? "Saving…" : "All answers saved"}</span>
          </p>
        </div>
        <p
          data-testid="mock-clock"
          className={`rounded-lg border px-3 py-1.5 font-mono text-sm font-semibold ${
            left <= 60 ? "border-red-300 bg-red-50 text-red-700" : "border-gray-200 text-gray-900"
          }`}
          aria-live="off"
        >
          {formatClock(left)}
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5" aria-label="Question navigator">
        {questions.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setIndex(i)}
            data-testid={`nav-${i}`}
            aria-current={i === index}
            className={`h-8 w-8 rounded-md border text-xs font-medium ${
              i === index
                ? "border-brand-600 bg-brand-600 text-white"
                : selected[item.id] !== null
                  ? "border-green-400 bg-green-50 text-green-800"
                  : "border-gray-200 bg-white text-gray-700"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <Card className="flex flex-col gap-4">
        <p className="text-xs text-gray-500">
          Question {index + 1} of {questions.length}
          {q.subject ? ` · ${q.subject}` : ""}
        </p>
        <p data-testid="mock-prompt" className="text-sm font-medium text-gray-900">
          {q.prompt}
        </p>
        <ul className="flex flex-col gap-2">
          {q.options.map((option, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => choose(i)}
                disabled={pending}
                data-testid={`mock-option-${i}`}
                aria-pressed={selected[q.id] === i}
                className={`w-full rounded-lg border px-3.5 py-2.5 text-left text-sm transition ${
                  selected[q.id] === i
                    ? "border-brand-600 bg-brand-50 text-brand-900"
                    : "border-gray-200 bg-white text-gray-800 hover:border-brand-500"
                }`}
              >
                <span className="mr-2 font-semibold">{String.fromCharCode(65 + i)}.</span>
                {option}
              </button>
            </li>
          ))}
        </ul>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            className="px-4 py-1.5 text-xs"
            disabled={index === 0}
            onClick={() => setIndex((i) => i - 1)}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth={false}
            className="px-4 py-1.5 text-xs"
            disabled={index === questions.length - 1}
            onClick={() => setIndex((i) => i + 1)}
          >
            Next
          </Button>
          <Button
            type="button"
            variant="ghost"
            fullWidth={false}
            className="px-4 py-1.5 text-xs"
            disabled={selected[q.id] === null}
            onClick={() => choose(null)}
          >
            Clear answer
          </Button>
        </div>
      </Card>

      {confirming ? (
        <Card className="flex flex-col gap-3 border-amber-200 bg-amber-50">
          <p className="text-sm text-amber-900">
            Submit now? You have {questions.length - answeredCount} unanswered question
            {questions.length - answeredCount === 1 ? "" : "s"}. You cannot change answers after
            submitting.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              fullWidth={false}
              className="px-4 py-1.5 text-xs"
              disabled={pending}
              onClick={finish}
              data-testid="confirm-submit"
            >
              {pending ? "Submitting…" : "Yes, submit"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth={false}
              className="px-4 py-1.5 text-xs"
              onClick={() => setConfirming(false)}
            >
              Keep working
            </Button>
          </div>
        </Card>
      ) : (
        <div>
          <Button
            type="button"
            fullWidth={false}
            className="px-5"
            onClick={() => setConfirming(true)}
            data-testid="submit-test"
          >
            Submit test
          </Button>
        </div>
      )}
    </div>
  );
}
