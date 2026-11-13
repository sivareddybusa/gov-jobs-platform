import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

/**
 * Records a system-wide audit event. `audit_logs` has no INSERT policy for
 * any role, including admins (DATABASE.md §25, RLS: "audit_logs — SELECT
 * admin+; no INSERT/UPDATE/DELETE policy for any role") — this is
 * deliberate so an audit trail can't be forged even by a compromised admin
 * session, and the only write path is this trusted server-only helper using
 * the service-role client. Callers must have already performed (and
 * confirmed the success of) the underlying admin action through the
 * caller's own RLS-scoped client before recording it here — this function
 * is a record of what happened, not an authorization check itself.
 */
export async function recordAuditEvent(event: {
  /** null = the system itself (e.g. the scheduled exam sync). */
  actorId: string | null;
  eventType: string;
  entityTable: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({
    actor_id: event.actorId,
    event_type: event.eventType,
    entity_table: event.entityTable,
    entity_id: event.entityId,
    metadata: (event.metadata as Json | undefined) ?? null,
  });
}

/**
 * Records a field-level change to a job notification/post. `job_history`
 * has the same no-INSERT-for-anyone RLS posture as `audit_logs` (DATABASE.md
 * §21) — same rationale, same service-role-only write path.
 */
export async function recordJobHistoryEntries(
  entries: Array<{
    jobNotificationId: string;
    jobPostId?: string | null;
    changedBy: string;
    fieldName: string;
    oldValue: string | null;
    newValue: string | null;
  }>,
): Promise<void> {
  if (entries.length === 0) return;
  const admin = createAdminClient();
  await admin.from("job_history").insert(
    entries.map((e) => ({
      job_notification_id: e.jobNotificationId,
      job_post_id: e.jobPostId ?? null,
      changed_by: e.changedBy,
      field_name: e.fieldName,
      old_value: e.oldValue,
      new_value: e.newValue,
    })),
  );
}

/** Diffs two plain field maps into job_history-shaped entries, skipping unchanged fields. */
export function diffFields(
  before: Record<string, string | null>,
  after: Record<string, string | null>,
): Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> {
  const changes: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }> =
    [];
  for (const key of Object.keys(after)) {
    if (before[key] !== after[key]) {
      changes.push({ fieldName: key, oldValue: before[key] ?? null, newValue: after[key] ?? null });
    }
  }
  return changes;
}
