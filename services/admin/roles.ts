import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { grantRoleSchema, revokeRoleSchema } from "@/lib/validation/admin";
import { grantRole, revokeRole } from "@/db/admin/roles";
import { recordAuditEvent } from "@/lib/audit";
import type { ServiceResult } from "@/services/profile/types";

/** super_admin only (RLS's admin_role_assignments_write_super_admin is the independent enforcement layer). */
export async function grantRoleUseCase(
  supabase: SupabaseClient<Database>,
  grantedBy: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = grantRoleSchema.safeParse(input);
  if (!parsed.success)
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };

  // No pre-check for user existence here: admin_role_assignments.user_id is
  // a NOT NULL FK to auth.users(id) — an invalid id fails the insert below
  // with a foreign-key violation, surfaced as the same generic error.
  const { error } = await grantRole(supabase, {
    userId: parsed.data.userId,
    roleCode: parsed.data.roleCode,
    grantedBy,
  });
  if (error)
    return {
      success: false,
      error: "Could not grant role. The user may already hold it, or the user id is invalid.",
    };

  await recordAuditEvent({
    actorId: grantedBy,
    eventType: "admin_role.grant",
    entityTable: "admin_role_assignments",
    entityId: parsed.data.userId,
    metadata: { roleCode: parsed.data.roleCode },
  });
  return { success: true };
}

export async function revokeRoleUseCase(
  supabase: SupabaseClient<Database>,
  revokedBy: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = revokeRoleSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: "Invalid request." };

  const { error } = await revokeRole(supabase, parsed.data.id);
  if (error) return { success: false, error: "Could not revoke role." };

  await recordAuditEvent({
    actorId: revokedBy,
    eventType: "admin_role.revoke",
    entityTable: "admin_role_assignments",
    entityId: parsed.data.id,
  });
  return { success: true };
}
