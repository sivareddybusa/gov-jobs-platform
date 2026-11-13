import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { startTargetSchema, targetActionSchema } from "@/lib/validation/exams";
import {
  getExamTarget,
  getTargetForExam,
  insertExamTarget,
  listExamTargets,
  setPrimaryExamTarget,
  updateExamTarget,
} from "@/db/exam-targets";
import { recordAuditEvent } from "@/lib/audit";
import type { ServiceResult } from "@/services/profile/types";

type DB = SupabaseClient<Database>;

/**
 * Preparation-target use cases. `userId` is the server-resolved session id.
 * RLS guarantees a candidate can only target a published, verified exam and
 * only touch their own rows. Removal is a status change, never a delete, so
 * history is preserved.
 */
export async function startPreparingUseCase(
  db: DB,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = startTargetSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { examId, targetYear } = parsed.data;

  const existing = await getTargetForExam(db, userId, examId);
  if (existing) {
    if (existing.status === "active") {
      return { success: false, error: "You are already preparing for this exam." };
    }
    // Re-activate a previously paused/removed target instead of duplicating it.
    const hasPrimary = (await listExamTargets(db, userId)).some(
      (t) => t.is_primary && t.status === "active",
    );
    const { error } = await updateExamTarget(db, userId, existing.id, {
      status: "active",
      ended_at: null,
      is_primary: !hasPrimary,
      ...(targetYear !== undefined ? { target_year: targetYear } : {}),
    });
    if (error) return { success: false, error: "Could not resume this exam." };
    await recordAuditEvent({
      actorId: userId,
      eventType: "exam_target.resumed",
      entityTable: "user_exam_targets",
      entityId: existing.id,
    });
    return { success: true };
  }

  const targets = await listExamTargets(db, userId);
  const hasPrimary = targets.some((t) => t.is_primary && t.status === "active");
  const { data, error } = await insertExamTarget(db, {
    profileId: userId,
    examId,
    isPrimary: !hasPrimary,
    targetYear: targetYear ?? null,
  });
  if (error || !data) {
    return {
      success: false,
      error: "Could not start preparing. The exam may no longer be available.",
    };
  }
  await recordAuditEvent({
    actorId: userId,
    eventType: "exam_target.created",
    entityTable: "user_exam_targets",
    entityId: data.id,
    metadata: { examId, isPrimary: data.is_primary },
  });
  return { success: true };
}

export async function manageTargetUseCase(
  db: DB,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = targetActionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { targetId, action } = parsed.data;

  const target = await getExamTarget(db, userId, targetId);
  if (!target) return { success: false, error: "Target not found." };

  let error: { message: string } | null = null;
  switch (action) {
    case "make_primary":
      if (target.status !== "active") {
        return { success: false, error: "Resume this exam before making it primary." };
      }
      ({ error } = await setPrimaryExamTarget(db, targetId));
      break;
    case "pause":
    case "remove":
      ({ error } = await updateExamTarget(db, userId, targetId, {
        status: action === "pause" ? "paused" : "removed",
        is_primary: false,
        ended_at: new Date().toISOString(),
      }));
      break;
    case "resume": {
      if (target.status === "active") return { success: true };
      const hasPrimary = (await listExamTargets(db, userId)).some(
        (t) => t.is_primary && t.status === "active",
      );
      ({ error } = await updateExamTarget(db, userId, targetId, {
        status: "active",
        ended_at: null,
        is_primary: !hasPrimary,
      }));
      break;
    }
  }
  if (error) return { success: false, error: "Could not update this exam." };

  await recordAuditEvent({
    actorId: userId,
    eventType: `exam_target.${action}`,
    entityTable: "user_exam_targets",
    entityId: targetId,
    metadata: { examId: target.exam_id },
  });
  return { success: true };
}
