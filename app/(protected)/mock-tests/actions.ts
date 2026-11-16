"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/require-user";
import type { ActionState } from "@/lib/auth/action-state";
import {
  saveMockAnswerInputSchema,
  startMockInputSchema,
  submitMockInputSchema,
} from "@/lib/validation/mock-tests";
import { saveMockAnswer, startMockAttempt, submitMockAttempt } from "@/db/mock-tests";

export async function startMockAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = startMockInputSchema.safeParse({ examId: formData.get("examId") });
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  const { supabase } = await requireUser("/mock-tests");
  const result = await startMockAttempt(supabase, parsed.data.examId);
  if ("error" in result) return { status: "error", message: result.error };
  redirect(`/mock-tests/attempts/${result.id}`);
}

export type SaveResult = { ok: true } | { ok: false; error: string; finished: boolean };

/** Saves one answer. The database refuses it if the attempt is not yours or the clock has run out. */
export async function saveMockAnswerAction(input: unknown): Promise<SaveResult> {
  const parsed = saveMockAnswerInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid answer.", finished: false };
  const { supabase } = await requireUser("/mock-tests");
  return saveMockAnswer(
    supabase,
    parsed.data.attemptId,
    parsed.data.questionId,
    parsed.data.selected,
  );
}

export async function submitMockAction(input: unknown): Promise<{ ok: boolean }> {
  const parsed = submitMockInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false };
  const { supabase } = await requireUser("/mock-tests");
  const status = await submitMockAttempt(supabase, parsed.data.attemptId);
  revalidatePath("/mock-tests");
  return { ok: status !== null };
}
