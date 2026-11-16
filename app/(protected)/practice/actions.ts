"use server";

import { requireUser } from "@/lib/auth/require-user";
import { answerInputSchema } from "@/lib/validation/questions";
import { answerQuestion, type AnswerResult } from "@/db/questions";

export type AnswerActionResult =
  { ok: true; result: AnswerResult } | { ok: false; message: string };

/** Records a practice attempt and returns the correct answer. Input is validated; the DB re-checks availability. */
export async function answerPracticeAction(input: unknown): Promise<AnswerActionResult> {
  const parsed = answerInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Invalid answer." };
  const { supabase } = await requireUser("/practice");
  const result = await answerQuestion(supabase, parsed.data.questionId, parsed.data.selected);
  if (!result) return { ok: false, message: "This question is no longer available." };
  return { ok: true, result };
}
