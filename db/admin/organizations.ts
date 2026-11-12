import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type OrganizationRow = Database["public"]["Tables"]["organizations"]["Row"];
export type OrganizationInsert = Database["public"]["Tables"]["organizations"]["Insert"];
export type OrganizationUpdate = Database["public"]["Tables"]["organizations"]["Update"];
export type DepartmentRow = Database["public"]["Tables"]["departments"]["Row"];

/**
 * All CRUD here goes through the caller's own authenticated Supabase
 * client (never the service-role client) — RLS's `organizations_write_admin`
 * /`departments_write_admin` policies (`is_admin(auth.uid(), 'admin')`) are
 * the authoritative, independent enforcement layer under the
 * services/admin/* role check (DATABASE.md §26).
 */
export async function listOrganizations(
  supabase: SupabaseClient<Database>,
): Promise<OrganizationRow[]> {
  const { data } = await supabase.from("organizations").select("*").order("name");
  return data ?? [];
}

export async function getOrganizationById(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<OrganizationRow | null> {
  const { data } = await supabase.from("organizations").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function createOrganization(
  supabase: SupabaseClient<Database>,
  input: OrganizationInsert,
): Promise<{ data: OrganizationRow | null; error: PostgrestError | null }> {
  return supabase.from("organizations").insert(input).select("*").single();
}

export async function updateOrganization(
  supabase: SupabaseClient<Database>,
  id: string,
  patch: OrganizationUpdate,
): Promise<{ data: OrganizationRow | null; error: PostgrestError | null }> {
  return supabase.from("organizations").update(patch).eq("id", id).select("*").single();
}

export async function listDepartments(
  supabase: SupabaseClient<Database>,
  organizationId: string,
): Promise<DepartmentRow[]> {
  const { data } = await supabase
    .from("departments")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");
  return data ?? [];
}

export async function createDepartment(
  supabase: SupabaseClient<Database>,
  input: { organizationId: string; name: string },
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from("departments")
    .insert({ organization_id: input.organizationId, name: input.name });
  return { error };
}
