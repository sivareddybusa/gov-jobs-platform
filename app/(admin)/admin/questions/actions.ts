"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminRole } from "@/lib/auth/require-admin";
import type { ActionState } from "@/lib/auth/action-state";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAuditEvent } from "@/lib/audit";
import { setQuestionStatus } from "@/db/admin/questions";
import { runConfiguredQuestionSync } from "@/services/exams/run";

export async function runQuestionSyncAction(): Promise<ActionState> {
  const { user } = await requireAdminRole("admin");
  const result = await runConfiguredQuestionSync();
  if (result.status === "unavailable") return { status: "error", message: result.reason };
  const s = result.summary;
  await recordAuditEvent({
    actorId: user.id,
    eventType: "questions.sync_triggered",
    entityTable: "questions",
    entityId: user.id,
    metadata: { ...s },
  });
  revalidatePath("/admin/questions");
  revalidatePath("/practice");
  return {
    status: "success",
    message: `Read ${s.papers} official papers (${s.official} questions) and generated for ${s.topics} topics: ${s.published} published, ${s.rejected} rejected by checks, ${s.failed} failed.`,
  };
}

const statusInput = z.object({
  questionId: z.string().uuid(),
  status: z.enum(["published", "hidden"]),
});

/** Take a wrong question down (or restore it). Admin role; recorded in the audit log. */
export async function setQuestionStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireAdminRole("admin");
  const parsed = statusInput.safeParse({
    questionId: formData.get("questionId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  const { error } = await setQuestionStatus(
    createAdminClient(),
    parsed.data.questionId,
    parsed.data.status,
  );
  if (error) return { status: "error", message: "Could not update the question." };
  await recordAuditEvent({
    actorId: user.id,
    eventType: parsed.data.status === "hidden" ? "question.hidden" : "question.restored",
    entityTable: "questions",
    entityId: parsed.data.questionId,
  });
  revalidatePath("/admin/questions");
  revalidatePath("/practice");
  return { status: "success", message: "Updated." };
}
