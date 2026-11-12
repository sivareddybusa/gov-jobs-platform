import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { jobSourceSchema } from "@/lib/validation/admin";
import { createJobSource, updateJobSource } from "@/db/admin/job-sources";
import type { ServiceResult } from "@/services/profile/types";

async function organizationExists(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<boolean> {
  const { data } = await supabase.from("organizations").select("id").eq("id", id).maybeSingle();
  return data !== null;
}

export async function createJobSourceUseCase(
  supabase: SupabaseClient<Database>,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = jobSourceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (
    parsed.data.organizationId &&
    !(await organizationExists(supabase, parsed.data.organizationId))
  ) {
    return { success: false, error: "Selected organization is no longer valid." };
  }
  // Trust anchor for later SSRF/document-fetch validation (SECURITY.md,
  // DATABASE.md §9): the URL host must actually be under the declared
  // official domain, not just any https:// URL.
  try {
    const host = new URL(parsed.data.sourceUrl).hostname.toLowerCase();
    const domain = parsed.data.officialDomain.toLowerCase();
    if (host !== domain && !host.endsWith(`.${domain}`)) {
      return {
        success: false,
        error: "The source URL's host must match the official domain (or a subdomain of it).",
        fieldErrors: { sourceUrl: ["Must be on the official domain"] },
      };
    }
  } catch {
    return { success: false, error: "Invalid source URL." };
  }

  const { error } = await createJobSource(supabase, {
    organization_id: parsed.data.organizationId ?? null,
    name: parsed.data.name,
    official_domain: parsed.data.officialDomain,
    source_type: parsed.data.sourceType,
    source_url: parsed.data.sourceUrl,
  });
  if (error) return { success: false, error: "Could not create source." };
  return { success: true };
}

export async function updateJobSourceUseCase(
  supabase: SupabaseClient<Database>,
  id: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = jobSourceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }
  if (
    parsed.data.organizationId &&
    !(await organizationExists(supabase, parsed.data.organizationId))
  ) {
    return { success: false, error: "Selected organization is no longer valid." };
  }

  const { error } = await updateJobSource(supabase, id, {
    organization_id: parsed.data.organizationId ?? null,
    name: parsed.data.name,
    official_domain: parsed.data.officialDomain,
    source_type: parsed.data.sourceType,
    source_url: parsed.data.sourceUrl,
  });
  if (error) return { success: false, error: "Could not update source." };
  return { success: true };
}
