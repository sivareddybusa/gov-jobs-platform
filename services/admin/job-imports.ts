import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeFetch, SafeFetchError } from "@/lib/ingestion/safe-fetch";
import { extractText, DocumentTypeError } from "@/lib/ingestion/extract-text";
import { extractJobWithMeta } from "@/lib/ingestion/ai-extract";
import {
  startIngestionSchema,
  rejectImportSchema,
  jobExtractionSchema,
  validateExtractionPlausibility,
  type JobExtraction,
} from "@/lib/validation/ingestion";
import { jobNotificationSchema, jobPostSchema, ageRuleSchema } from "@/lib/validation/admin";
import {
  createJobImport,
  updateJobImportPipelineState,
  updateJobImportAsReviewer,
  getJobImportById,
} from "@/db/admin/job-imports";
import {
  createJobNotificationUseCase,
  createJobPostUseCase,
} from "@/services/admin/job-notifications";
import { upsertAgeRuleUseCase } from "@/services/admin/eligibility-rules";
import { recordAuditEvent } from "@/lib/audit";
import type { ServiceResult } from "@/services/profile/types";

/**
 * The full ingestion pipeline (ARCHITECTURE.md's Job Ingestion Architecture,
 * SECURITY.md §10-§12): fetch -> extract text -> AI extraction -> schema
 * validation -> business validation -> review_required. Every step's
 * outcome (including failures) is recorded on the job_imports row via the
 * service-role client (RLS has no INSERT/UPDATE-by-app-role policy for
 * this table by design — db/admin/job-imports.ts's own comment). Runs
 * synchronously in one admin-triggered Server Action call — this project
 * has no scheduled/background ingestion (PRD.md §20/§21 explicitly defer
 * that), so there's no queue to hand this off to.
 */
export async function startIngestionUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult & { id?: string }> {
  const parsed = startIngestionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { data: source } = await supabase
    .from("job_sources")
    .select("id")
    .eq("id", parsed.data.jobSourceId)
    .maybeSingle();
  if (!source) return { success: false, error: "Selected source is no longer valid." };

  const admin = createAdminClient();
  const { data: importRow, error: createError } = await createJobImport(admin, {
    job_source_id: parsed.data.jobSourceId,
    source_url: parsed.data.documentUrl,
    status: "discovered",
  });
  if (createError || !importRow) return { success: false, error: "Could not start ingestion." };

  await recordAuditEvent({
    actorId: userId,
    eventType: "job_import.start",
    entityTable: "job_imports",
    entityId: importRow.id,
  });

  // From here on, failures are recorded on the row (validation_failed) and
  // reported back, never thrown past this function — a failed fetch/
  // extraction is an expected, handled outcome, not an application error.
  let body: Buffer;
  try {
    const fetched = await safeFetch(parsed.data.documentUrl);
    body = fetched.body;
  } catch (err) {
    const message = err instanceof SafeFetchError ? err.message : "Could not fetch the document.";
    await updateJobImportPipelineState(admin, importRow.id, {
      status: "validation_failed",
      validation_errors: { stage: "fetch", message },
    });
    return { success: false, error: message, id: importRow.id };
  }
  await updateJobImportPipelineState(admin, importRow.id, { status: "downloaded" });

  let text: string;
  try {
    const extracted = await extractText(body);
    text = extracted.text;
  } catch (err) {
    const message =
      err instanceof DocumentTypeError ? err.message : "Could not extract text from the document.";
    await updateJobImportPipelineState(admin, importRow.id, {
      status: "validation_failed",
      validation_errors: { stage: "extract", message },
    });
    return { success: false, error: message, id: importRow.id };
  }
  await updateJobImportPipelineState(admin, importRow.id, { status: "extracted" });

  let extraction: JobExtraction;
  let aiProvider: string;
  let aiModel: string;
  try {
    ({ extraction, provider: aiProvider, model: aiModel } = await extractJobWithMeta(text));
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI extraction failed.";
    await updateJobImportPipelineState(admin, importRow.id, {
      status: "validation_failed",
      validation_errors: { stage: "ai_extraction", message },
    });
    return { success: false, error: message, id: importRow.id };
  }

  const problems = validateExtractionPlausibility(extraction);
  const nextStatus = problems.length > 0 ? "validation_failed" : "review_required";

  await updateJobImportPipelineState(admin, importRow.id, {
    status: nextStatus,
    ai_provider: aiProvider,
    ai_model: aiModel,
    raw_extraction_output: extraction,
    extracted_at: new Date().toISOString(),
    validation_errors: problems.length > 0 ? { stage: "business_validation", problems } : null,
  });

  if (problems.length > 0) {
    return { success: false, error: problems.join(" "), id: importRow.id };
  }
  return { success: true, id: importRow.id };
}

/** Re-parses the stored extraction (untrusted stored JSON, re-validated defensively — not assumed still valid). */
export function parseStoredExtraction(raw: unknown): JobExtraction | null {
  const result = jobExtractionSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Approve step: creates the real job_notification + one job_post (+ an age
 * rule if the reviewer confirmed one) from the reviewer-edited candidate
 * data, reusing Phase 6's own services (same validation, same
 * verifyOfficialUrlsAgainstSource domain check, same audit logging) rather
 * than a separate write path — then marks the import approved and links
 * it to the created notification. The reviewer completes any remaining
 * rules (qualifications, relaxations, state/gender/experience) afterward
 * via the existing Phase 6 rules editor at /admin/jobs/[id]/posts/[postId]
 * — deliberately not rebuilt here (see docs/PROJECT_STATUS.md's Phase 7
 * scope note).
 */
export async function approveImportUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  importId: string,
  input: {
    notification: unknown;
    post: unknown;
    ageRule?: unknown;
    reviewNotes?: string | undefined;
  },
): Promise<ServiceResult & { jobNotificationId?: string; jobPostId?: string }> {
  const importRow = await getJobImportById(supabase, importId);
  if (!importRow) return { success: false, error: "Import not found." };
  if (importRow.status !== "review_required") {
    return {
      success: false,
      error: `Cannot approve an import currently in status "${importRow.status}".`,
    };
  }

  const notificationParsed = jobNotificationSchema.safeParse(input.notification);
  if (!notificationParsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: notificationParsed.error.flatten().fieldErrors,
    };
  }
  const postParsed = jobPostSchema.safeParse(input.post);
  if (!postParsed.success) {
    return {
      success: false,
      error: "Please fix the post fields below.",
      fieldErrors: postParsed.error.flatten().fieldErrors,
    };
  }

  const notificationResult = await createJobNotificationUseCase(
    supabase,
    userId,
    input.notification,
  );
  if (!notificationResult.success) return notificationResult;
  const jobNotificationId = notificationResult.id;

  const postResult = await createJobPostUseCase(supabase, userId, jobNotificationId, input.post);
  if (!postResult.success) {
    // The notification was created but its post failed — surface this
    // clearly rather than silently leaving an empty notification; the
    // reviewer can add a post manually on the notification's own edit page.
    return {
      success: false,
      error: `Notification created, but the post could not be created: ${postResult.error}`,
      jobNotificationId,
    };
  }
  const jobPostId = postResult.id;

  if (input.ageRule) {
    const ageParsed = ageRuleSchema.safeParse({ ...(input.ageRule as object), jobPostId });
    if (ageParsed.success) {
      await upsertAgeRuleUseCase(supabase, userId, { ...ageParsed.data });
    }
    // An invalid/incomplete age rule from the reviewer is not a hard
    // failure here — the notification+post are already real and the
    // reviewer can set the age rule directly on the post's own rules
    // editor page, same as any rule they'd add manually.
  }

  await updateJobImportAsReviewer(supabase, importId, {
    status: "approved",
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    review_notes: input.reviewNotes ?? null,
    job_notification_id: jobNotificationId,
  });

  await recordAuditEvent({
    actorId: userId,
    eventType: "job_import.approve",
    entityTable: "job_imports",
    entityId: importId,
    metadata: { jobNotificationId, jobPostId },
  });

  return { success: true, jobNotificationId, jobPostId };
}

export async function rejectImportUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = rejectImportSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };

  const importRow = await getJobImportById(supabase, parsed.data.id);
  if (!importRow) return { success: false, error: "Import not found." };
  if (importRow.status === "approved" || importRow.status === "rejected") {
    return {
      success: false,
      error: `Cannot reject an import already in status "${importRow.status}".`,
    };
  }

  const { error } = await updateJobImportAsReviewer(supabase, parsed.data.id, {
    status: "rejected",
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    review_notes: parsed.data.reviewNotes ?? null,
  });
  if (error) return { success: false, error: "Could not reject this import." };

  await recordAuditEvent({
    actorId: userId,
    eventType: "job_import.reject",
    entityTable: "job_imports",
    entityId: parsed.data.id,
  });
  return { success: true };
}
