"use client";

import { useState, useTransition } from "react";
import { answerPracticeAction } from "@/app/(protected)/practice/actions";
import type { PracticeQuestion, AnswerResult } from "@/db/questions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Answered = { selected: number; result: AnswerResult };

/** One question at a time with instant feedback. The answer arrives only after the attempt is recorded. */
export function PracticeSession({ questions }: { questions: PracticeQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Answered>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const done = index >= questions.length;
  const score = Object.values(answers).filter((a) => a.result.isCorrect).length;

  if (done) {
    return (
      <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <h2 className="text-base font-semibold text-gray-900">Set complete</h2>
        <p data-testid="practice-score" className="text-sm text-gray-700">
          You got {score} of {questions.length} correct.
        </p>
        {/* A plain anchor on purpose: a full navigation fetches a fresh set. */}
        <a href="" className="text-sm font-medium text-brand-600 hover:underline">
          Practice another set
        </a>
      </Card>
    );
  }

  const q = questions[index]!;
  const answered = answers[q.id];

  function choose(option: number) {
    if (answered || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await answerPracticeAction({ questionId: q.id, selected: option });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setAnswers((prev) => ({ ...prev, [q.id]: { selected: option, result: res.result } }));
    });
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
        <span>
          Question {index + 1} of {questions.length}
          {q.topic ? ` · ${q.topic}` : ""}
        </span>
        <span className="flex items-center gap-2">
          {q.origin === "official_paper" ? (
            <Badge tone="green">Official paper</Badge>
          ) : (
            <Badge tone="amber">AI-generated practice</Badge>
          )}
        </span>
      </div>
      <p data-testid="practice-prompt" className="text-sm font-medium text-gray-900">
        {q.prompt}
      </p>
      <ul className="flex flex-col gap-2">
        {q.options.map((option, i) => {
          const isCorrect = answered && answered.result.correctIndex === i;
          const isWrongPick = answered && answered.selected === i && !answered.result.isCorrect;
          return (
            <li key={i}>
              <button
                type="button"
                disabled={!!answered || pending}
                onClick={() => choose(i)}
                data-testid={`option-${i}`}
                data-state={isCorrect ? "correct" : isWrongPick ? "wrong" : undefined}
                className={`w-full rounded-lg border px-3.5 py-2.5 text-left text-sm transition ${
                  isCorrect
                    ? "border-green-500 bg-green-50 text-green-900"
                    : isWrongPick
                      ? "border-red-500 bg-red-50 text-red-900"
                      : "border-gray-200 bg-white text-gray-800 hover:border-brand-500 disabled:hover:border-gray-200"
                }`}
              >
                <span className="mr-2 font-semibold">{String.fromCharCode(65 + i)}.</span>
                {option}
              </button>
            </li>
          );
        })}
      </ul>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {answered ? (
        <div className="flex flex-col gap-2 border-t border-gray-100 pt-3">
          <p
            data-testid="practice-feedback"
            className={`text-sm font-medium ${answered.result.isCorrect ? "text-green-700" : "text-red-700"}`}
          >
            {answered.result.isCorrect
              ? "Correct"
              : `Incorrect. The correct answer is ${String.fromCharCode(65 + answered.result.correctIndex)}.`}
          </p>
          {answered.result.explanation ? (
            <p className="text-sm text-gray-700">{answered.result.explanation}</p>
          ) : null}
          {q.origin === "official_paper" && q.sourceUrl ? (
            <a
              href={q.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              Official paper ↗
            </a>
          ) : (
            <p className="text-xs text-gray-500">
              Written by AI for practice and cross-checked automatically. It is not a real exam
              question; confirm facts against official sources.
            </p>
          )}
          <Button
            type="button"
            fullWidth={false}
            className="self-start px-5"
            onClick={() => setIndex((i) => i + 1)}
          >
            {index + 1 < questions.length ? "Next question" : "Finish"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
