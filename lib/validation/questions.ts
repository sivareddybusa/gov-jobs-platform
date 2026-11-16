import { z } from "zod";
import type { QuestionDraft } from "@/domain/questions";

const text = (max: number) => z.string().trim().min(1).max(max);

/** One question as an LLM may return it. Untrusted: validated here, then checked by domain rules. */
const draftSchema = z.object({
  prompt: text(2000),
  options: z.array(text(500)).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().trim().max(4000).default(""),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
});

export const generatedQuestionsSchema = z.object({
  questions: z.array(z.unknown()).max(20).default([]),
});

/** Keeps the well-formed questions of an LLM batch and silently drops malformed ones. */
export function parseDrafts(json: unknown): QuestionDraft[] {
  const batch = generatedQuestionsSchema.safeParse(json);
  if (!batch.success) throw new Error("The generator output failed validation.");
  const out: QuestionDraft[] = [];
  for (const raw of batch.data.questions) {
    const q = draftSchema.safeParse(raw);
    if (q.success) out.push(q.data);
  }
  return out;
}

export const solveResultSchema = z.object({
  answers: z
    .array(
      z.object({
        id: z.number().int().min(0),
        // null = the solver could not decide confidently.
        answerIndex: z.number().int().min(0).max(3).nullable(),
      }),
    )
    .max(20)
    .default([]),
});

/** Official paper extraction: correctIndex is null when the document gives no answer for that question. */
export const officialExtractionSchema = z.object({
  questions: z.array(z.unknown()).max(30).default([]),
});
export const officialDraftSchema = z.object({
  prompt: text(2000),
  options: z.array(text(500)).length(4),
  correctIndex: z.number().int().min(0).max(3).nullable(),
});

/** Candidate input to the answer action. */
export const answerInputSchema = z.object({
  questionId: z.string().uuid(),
  selected: z.number().int().min(0).max(3),
});
