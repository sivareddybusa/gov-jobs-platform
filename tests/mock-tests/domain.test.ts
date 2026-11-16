import { describe, expect, it } from "vitest";
import {
  formatClock,
  plannedQuestionCount,
  remainingSeconds,
  scoreAttempt,
  subjectBreakdown,
} from "@/domain/mock-tests";

const rows = [
  { subject: "Maths", selectedIndex: 1, correctIndex: 1 }, // correct
  { subject: "Maths", selectedIndex: 0, correctIndex: 1 }, // wrong
  { subject: "English", selectedIndex: null, correctIndex: 2 }, // unanswered
  { subject: null, selectedIndex: 3, correctIndex: 3 }, // correct
];

describe("scoreAttempt", () => {
  it("+1 correct, -0.25 wrong, 0 unanswered by default", () => {
    expect(scoreAttempt(rows)).toEqual({ correct: 2, wrong: 1, unanswered: 1, score: 1.75 });
  });
  it("supports another marking scheme and negative totals", () => {
    expect(scoreAttempt(rows, { correct: 2, wrong: 0.5 }).score).toBe(3.5);
    expect(
      scoreAttempt([{ subject: null, selectedIndex: 0, correctIndex: 1 }], { correct: 1, wrong: 1 })
        .score,
    ).toBe(-1);
  });
});

describe("subjectBreakdown", () => {
  it("groups by subject in first-seen order, naming the subject-less bucket", () => {
    expect(subjectBreakdown(rows)).toEqual([
      { subject: "Maths", total: 2, correct: 1, wrong: 1, unanswered: 0 },
      { subject: "English", total: 1, correct: 0, wrong: 0, unanswered: 1 },
      { subject: "Official paper questions", total: 1, correct: 1, wrong: 0, unanswered: 0 },
    ]);
  });
});

describe("clock helpers", () => {
  it("never goes negative and rounds up", () => {
    const now = Date.parse("2026-01-01T00:00:00Z");
    expect(remainingSeconds("2026-01-01T00:01:00Z", now)).toBe(60);
    expect(remainingSeconds("2026-01-01T00:00:00.400Z", now)).toBe(1);
    expect(remainingSeconds("2025-12-31T23:59:00Z", now)).toBe(0);
  });
  it("formats m:ss and h:mm:ss", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClock(-4)).toBe("0:00");
  });
});

describe("plannedQuestionCount", () => {
  it("caps at the wanted size and refuses too few", () => {
    expect(plannedQuestionCount(100)).toBe(20);
    expect(plannedQuestionCount(8)).toBe(8);
    expect(plannedQuestionCount(4)).toBeNull();
  });
});
