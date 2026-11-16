import { z } from "zod";

export const startMockInputSchema = z.object({ examId: z.string().uuid() });

export const saveMockAnswerInputSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  /** null clears the answer. */
  selected: z.number().int().min(0).max(3).nullable(),
});

export const submitMockInputSchema = z.object({ attemptId: z.string().uuid() });
