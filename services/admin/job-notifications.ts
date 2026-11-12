import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { jobNotificationSchema, jobPostSchema } from "@/lib/validation/admin";
import {
  createJobNotification,
  updateJobNotification,
  getJobNotificationById,
  createJobPost,
  updateJobPost,
} from "@/db/admin/job-notifications";
import { recordAuditEvent, recordJobHistoryEntries, diffFields } from "@/lib/audit";
import type { ServiceResult } from "@/services/profile/types";

type CreateResult =
  | { success: true; id: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "notification"
  );
}

async function organizationExists(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<boolean> {
  const { data } = await supabase.from("organizations").select("id").eq("id", id).maybeSingle();
  return data !== null;
}
async function departmentBelongsToOrg(
  supabase: SupabaseClient<Database>,
  id: string,
  orgId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("departments")
    .select("id")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  return data !== null;
}
async function sourceExists(supabase: SupabaseClient<Database>, id: string): Promise<boolean> {
  const { data } = await supabase.from("job_sources").select("id").eq("id", id).maybeSingle();
  return data !== null;
}

function hostMatchesDomain(url: string, domain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    const normalizedDomain = domain.toLowerCase();
    return host === normalizedDomain || host.endsWith(`.${normalizedDomain}`);
  } catch {
    return false;
  }
}

/**
 * SECURITY.md §12/§32: "any URL ... is checked against this allow-listed
 * domain ... before a job can move past `review_required`." Re-verified
 * here (not just at job_sources creation time, services/admin/job-sources.ts)
 * because a notification's URLs and its source can each be edited
 * independently after the source was first linked — the check that matters
 * is the one immediately before the job leaves review, not a one-time check
 * at an earlier unrelated step.
 */
async function verifyOfficialUrlsAgainstSource(
  supabase: SupabaseClient<Database>,
  notification: {
    official_advertisement_url: string;
    official_application_url: string | null;
    source_id: string;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: source } = await supabase
    .from("job_sources")
    .select("official_domain")
    .eq("id", notification.source_id)
    .maybeSingle();
  if (!source) return { ok: false, error: "This notification's source is no longer valid." };

  if (!hostMatchesDomain(notification.official_advertisement_url, source.official_domain)) {
    return {
      ok: false,
      error: `The official advertisement URL is not on the source's official domain (${source.official_domain}).`,
    };
  }
  if (
    notification.official_application_url &&
    !hostMatchesDomain(notification.official_application_url, source.official_domain)
  ) {
    return {
      ok: false,
      error: `The official application URL is not on the source's official domain (${source.official_domain}).`,
    };
  }
  return { ok: true };
}

export async function createJobNotificationUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<CreateResult> {
  const parsed = jobNotificationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const d = parsed.data;
  if (!(await organizationExists(supabase, d.organizationId))) {
    return { success: false, error: "Selected organization is no longer valid." };
  }
  if (
    d.departmentId &&
    !(await departmentBelongsToOrg(supabase, d.departmentId, d.organizationId))
  ) {
    return {
      success: false,
      error: "Selected department does not belong to the selected organization.",
    };
  }
  if (!(await sourceExists(supabase, d.sourceId))) {
    return { success: false, error: "Selected source is no longer valid." };
  }

  // Retry once on a slug collision (extremely unlikely — slug carries a
  // random suffix — but never silently overwrite an existing notification).
  for (let attempt = 0; attempt < 2; attempt++) {
    const slug = `${slugify(d.title)}-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error } = await createJobNotification(supabase, {
      organization_id: d.organizationId,
      department_id: d.departmentId ?? null,
      source_id: d.sourceId,
      title: d.title,
      slug,
      description: d.description ?? null,
      recruitment_type: d.recruitmentType,
      official_advertisement_url: d.officialAdvertisementUrl,
      official_application_url: d.officialApplicationUrl ?? null,
      notification_date: d.notificationDate,
      application_start_date: d.applicationStartDate ?? null,
      application_end_date: d.applicationEndDate ?? null,
    });
    if (!error && data) {
      await recordAuditEvent({
        actorId: userId,
        eventType: "job_notification.create",
        entityTable: "job_notifications",
        entityId: data.id,
      });
      return { success: true, id: data.id };
    }
    if (error && !error.message.includes("slug")) {
      return { success: false, error: "Could not create job notification." };
    }
  }
  return {
    success: false,
    error: "Could not create job notification (slug collision). Please try again.",
  };
}

export async function updateJobNotificationUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = jobNotificationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const d = parsed.data;
  if (!(await organizationExists(supabase, d.organizationId))) {
    return { success: false, error: "Selected organization is no longer valid." };
  }
  if (
    d.departmentId &&
    !(await departmentBelongsToOrg(supabase, d.departmentId, d.organizationId))
  ) {
    return {
      success: false,
      error: "Selected department does not belong to the selected organization.",
    };
  }
  if (!(await sourceExists(supabase, d.sourceId))) {
    return { success: false, error: "Selected source is no longer valid." };
  }

  const before = await getJobNotificationById(supabase, id);
  if (!before) return { success: false, error: "Notification not found." };

  const after = {
    title: d.title,
    description: d.description ?? null,
    official_advertisement_url: d.officialAdvertisementUrl,
    official_application_url: d.officialApplicationUrl ?? null,
    notification_date: d.notificationDate,
    application_start_date: d.applicationStartDate ?? null,
    application_end_date: d.applicationEndDate ?? null,
  };
  const { error } = await updateJobNotification(supabase, id, {
    organization_id: d.organizationId,
    department_id: d.departmentId ?? null,
    source_id: d.sourceId,
    ...after,
  });
  if (error) return { success: false, error: "Could not update job notification." };

  const changes = diffFields(
    {
      title: before.title,
      description: before.description,
      official_advertisement_url: before.official_advertisement_url,
      official_application_url: before.official_application_url,
      notification_date: before.notification_date,
      application_start_date: before.application_start_date,
      application_end_date: before.application_end_date,
    },
    after,
  );
  if (changes.length > 0) {
    await recordJobHistoryEntries(
      changes.map((c) => ({ jobNotificationId: id, changedBy: userId, ...c })),
    );
  }
  return { success: true };
}

const STATUS_TRANSITIONS: Record<string, { from: string[]; to: string }> = {
  publish: { from: ["approved", "expired"], to: "published" },
  unpublish: { from: ["published"], to: "approved" },
  expire: { from: ["published"], to: "expired" },
  archive: { from: ["published", "expired", "approved", "discovered"], to: "archived" },
  approve: { from: ["review_required", "discovered", "imported", "processing"], to: "approved" },
};

/** Admin+ status transitions (publish/unpublish/expire/archive), reviewer+ for approve. Always audit-logged. */
export async function transitionJobNotificationStatusUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  id: string,
  action: keyof typeof STATUS_TRANSITIONS,
): Promise<ServiceResult> {
  const transition = STATUS_TRANSITIONS[action]!;
  const notification = await getJobNotificationById(supabase, id);
  if (!notification) return { success: false, error: "Notification not found." };
  if (!transition.from.includes(notification.status)) {
    return {
      success: false,
      error: `Cannot ${action} a notification currently in status "${notification.status}".`,
    };
  }

  // SECURITY.md §32 checklist: domain verification must happen before a job
  // moves past review_required. Re-checked again at publish (not just
  // approve) since the notification is still editable by an editor in
  // between those two steps.
  if (action === "approve" || action === "publish") {
    const domainCheck = await verifyOfficialUrlsAgainstSource(supabase, notification);
    if (!domainCheck.ok) return { success: false, error: domainCheck.error };
  }

  const patch: Record<string, unknown> = { status: transition.to };
  if (transition.to === "published") patch["published_at"] = new Date().toISOString();
  if (transition.to === "expired") patch["expires_at"] = new Date().toISOString();

  const { error } = await updateJobNotification(supabase, id, patch);
  if (error) return { success: false, error: "Could not update status." };

  await recordAuditEvent({
    actorId: userId,
    eventType: `job_notification.${action}`,
    entityTable: "job_notifications",
    entityId: id,
    metadata: { from: notification.status, to: transition.to },
  });
  await recordJobHistoryEntries([
    {
      jobNotificationId: id,
      changedBy: userId,
      fieldName: "status",
      oldValue: notification.status,
      newValue: transition.to,
    },
  ]);
  return { success: true };
}

export async function createJobPostUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobNotificationId: string,
  input: unknown,
): Promise<CreateResult> {
  const parsed = jobPostSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { data, error } = await createJobPost(supabase, {
    job_notification_id: jobNotificationId,
    title: parsed.data.title,
    vacancy_count: parsed.data.vacancyCount ?? null,
    pay_scale_min: parsed.data.payScaleMin ?? null,
    pay_scale_max: parsed.data.payScaleMax ?? null,
    pay_scale_note: parsed.data.payScaleNote ?? null,
  });
  if (error || !data) return { success: false, error: "Could not create job post." };

  await recordJobHistoryEntries([
    {
      jobNotificationId,
      jobPostId: data.id,
      changedBy: userId,
      fieldName: "created",
      oldValue: null,
      newValue: parsed.data.title,
    },
  ]);
  return { success: true, id: data.id };
}

export async function updateJobPostUseCase(
  supabase: SupabaseClient<Database>,
  userId: string,
  jobNotificationId: string,
  id: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = jobPostSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { error } = await updateJobPost(supabase, id, {
    title: parsed.data.title,
    vacancy_count: parsed.data.vacancyCount ?? null,
    pay_scale_min: parsed.data.payScaleMin ?? null,
    pay_scale_max: parsed.data.payScaleMax ?? null,
    pay_scale_note: parsed.data.payScaleNote ?? null,
  });
  if (error) return { success: false, error: "Could not update job post." };

  await recordJobHistoryEntries([
    {
      jobNotificationId,
      jobPostId: id,
      changedBy: userId,
      fieldName: "updated",
      oldValue: null,
      newValue: parsed.data.title,
    },
  ]);
  return { success: true };
}
