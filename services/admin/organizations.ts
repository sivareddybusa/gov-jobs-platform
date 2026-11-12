import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { organizationSchema, departmentSchema } from "@/lib/validation/admin";
import { createOrganization, updateOrganization, createDepartment } from "@/db/admin/organizations";
import { stateIsActive } from "@/db/reference-data";
import type { ServiceResult } from "@/services/profile/types";

/**
 * `requireAdminRole('admin')` has already resolved and authorized the
 * caller before this is invoked (mirrors services/profile/*'s trust of
 * requireUser's userId) — RLS's `organizations_write_admin` policy is the
 * independent second layer underneath this write regardless.
 */
export async function createOrganizationUseCase(
  supabase: SupabaseClient<Database>,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (parsed.data.stateId && !(await stateIsActive(supabase, parsed.data.stateId))) {
    return { success: false, error: "Selected state is no longer valid." };
  }

  const { error } = await createOrganization(supabase, {
    name: parsed.data.name,
    short_code: parsed.data.shortCode ?? null,
    org_type: parsed.data.orgType,
    state_id: parsed.data.stateId ?? null,
    website_url: parsed.data.websiteUrl ?? null,
  });
  if (error)
    return {
      success: false,
      error: "Could not create organization. The name may already be in use.",
    };
  return { success: true };
}

export async function updateOrganizationUseCase(
  supabase: SupabaseClient<Database>,
  id: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (parsed.data.stateId && !(await stateIsActive(supabase, parsed.data.stateId))) {
    return { success: false, error: "Selected state is no longer valid." };
  }

  const { error } = await updateOrganization(supabase, id, {
    name: parsed.data.name,
    short_code: parsed.data.shortCode ?? null,
    org_type: parsed.data.orgType,
    state_id: parsed.data.stateId ?? null,
    website_url: parsed.data.websiteUrl ?? null,
  });
  if (error) return { success: false, error: "Could not update organization." };
  return { success: true };
}

export async function addDepartmentUseCase(
  supabase: SupabaseClient<Database>,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = departmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  const { error } = await createDepartment(supabase, parsed.data);
  if (error) return { success: false, error: "Could not add department. It may already exist." };
  return { success: true };
}
