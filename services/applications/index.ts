import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  trackApplicationSchema,
  updateApplicationSchema,
  removeApplicationSchema,
} from "@/lib/validation/applications";
import {
  getApplication,
  insertApplication,
  updateApplication,
  deleteApplication,
} from "@/db/job-applications";
import { recordAuditEvent } from "@/lib/audit";
import type { ServiceResult } from "@/services/profile/types";

type DB = SupabaseClient<Database>;

/**
 * Application Tracker use cases. `userId` is always the server-resolved
 * session id; RLS (`job_applications_all_own`) is the independent second
 * layer. Status history is written by a database trigger, not here, so it
 * cannot be skipped or forged. Each mutation is additionally audit-logged.
 */

export async function trackApplicationUseCase(
  db: DB,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = trackApplicationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };

  const { data, error } = await insertApplication(db, userId, parsed.data.jobPostId);
  if (error || !data) {
    return { success: false, error: "Could not track this job. It may already be tracked." };
  }
  await recordAuditEvent({
    actorId: userId,
    eventType: "job_application.created",
    entityTable: "job_applications",
    entityId: data.id,
    metadata: { jobPostId: parsed.data.jobPostId },
  });
  return { success: true };
}

export async function updateApplicationUseCase(
  db: DB,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = updateApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { applicationId, status, appliedOn, applicationNumber, notes } = parsed.data;

  const existing = await getApplication(db, userId, applicationId);
  if (!existing) return { success: false, error: "Application not found." };

  const { data, error } = await updateApplication(db, userId, applicationId, {
    status,
    applied_on: appliedOn,
    application_number: applicationNumber,
    notes,
  });
  if (error || !data) return { success: false, error: "Could not update this application." };

  await recordAuditEvent({
    actorId: userId,
    eventType: "job_application.updated",
    entityTable: "job_applications",
    entityId: applicationId,
    metadata: { fromStatus: existing.status, toStatus: status },
  });
  return { success: true };
}

export async function removeApplicationUseCase(
  db: DB,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = removeApplicationSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };

  const existing = await getApplication(db, userId, parsed.data.applicationId);
  if (!existing) return { success: false, error: "Application not found." };

  const { error } = await deleteApplication(db, userId, parsed.data.applicationId);
  if (error) return { success: false, error: "Could not remove this application." };

  await recordAuditEvent({
    actorId: userId,
    eventType: "job_application.deleted",
    entityTable: "job_applications",
    entityId: parsed.data.applicationId,
    metadata: { lastStatus: existing.status },
  });
  return { success: true };
}
