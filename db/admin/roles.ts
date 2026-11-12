import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type AdminRoleAssignmentRow = Database["public"]["Tables"]["admin_role_assignments"]["Row"];

/** RLS's `admin_role_assignments_select_admin`/`_write_super_admin` are the independent enforcement layer here (DATABASE.md §24). */
export async function listRoleAssignments(
  supabase: SupabaseClient<Database>,
): Promise<AdminRoleAssignmentRow[]> {
  const { data } = await supabase
    .from("admin_role_assignments")
    .select("*")
    .order("granted_at", { ascending: false });
  return data ?? [];
}

export async function grantRole(
  supabase: SupabaseClient<Database>,
  input: { userId: string; roleCode: string; grantedBy: string },
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from("admin_role_assignments")
    .insert({ user_id: input.userId, role_code: input.roleCode, granted_by: input.grantedBy });
  return { error };
}

export async function revokeRole(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("admin_role_assignments").delete().eq("id", id);
  return { error };
}
