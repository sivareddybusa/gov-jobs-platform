import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { examTransitionSchema } from "@/lib/validation/exams";
import { canPublishExam, type ExamVerificationStatus } from "@/domain/exams";
import { getExamById, updateExamRow } from "@/db/admin/exams";
import { recordAuditEvent } from "@/lib/audit";
import type { ServiceResult } from "@/services/profile/types";

type DB = SupabaseClient<Database>;

/**
 * Admins do not author exams: the Google-fed sync (services/exams/sync.ts)
 * does. An admin may only take content down (unpublish/archive) or restore a
 * verified exam. The caller has already passed requireAdminRole("admin"); RLS
 * (`exams_update_admin`) and the review-rights trigger sit underneath.
 */
export async function transitionExamUseCase(
  db: DB,
  actorId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = examTransitionSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };
  const { examId, action } = parsed.data;
  const exam = await getExamById(db, examId);
  if (!exam) return { success: false, error: "Exam not found." };

  const now = new Date().toISOString();
  let patch: Parameters<typeof updateExamRow>[2];
  switch (action) {
    case "publish": {
      const check = canPublishExam({
        verificationStatus: exam.verification_status as ExamVerificationStatus,
        officialWebsiteUrl: exam.official_website_url,
        sourceUrl: exam.source_url,
      });
      if (!check.ok) return { success: false, error: check.reason };
      patch = { status: "published", published_at: now };
      break;
    }
    case "unpublish":
      patch = { status: "draft", published_at: null };
      break;
    case "archive":
      patch = { status: "archived", published_at: null };
      break;
  }

  const { data, error } = await updateExamRow(db, examId, patch);
  if (error || !data) return { success: false, error: "Could not change the exam's status." };
  await recordAuditEvent({
    actorId,
    eventType: `exam.${action}`,
    entityTable: "exams",
    entityId: examId,
    metadata: { from: { status: exam.status, verification: exam.verification_status } },
  });
  return { success: true };
}
