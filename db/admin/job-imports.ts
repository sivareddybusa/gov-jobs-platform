import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type JobImportRow = Database["public"]["Tables"]["job_imports"]["Row"];
export type JobImportInsert = Database["public"]["Tables"]["job_imports"]["Insert"];
export type JobImportUpdate = Database["public"]["Tables"]["job_imports"]["Update"];

/**
 * `job_imports` has SELECT/UPDATE RLS policies for reviewer+ but NO INSERT
 * policy for any application role (DATABASE.md §22 / the migration's own
 * comment: "ingestion writes go through the service-role client") —
 * `createJobImport`/`updateJobImportPipelineState` below always take an
 * admin (service-role) client, never the caller's own session. The
 * reviewer's own terminal decision (approve/reject) instead uses
 * `updateJobImportAsReviewer` with the caller's own RLS-scoped client,
 * since RLS explicitly permits that UPDATE for a reviewer+ session — least
 * privilege: only the automated pipeline internals need to bypass RLS.
 */
export async function listJobImports(
  supabase: SupabaseClient<Database>,
): Promise<Array<JobImportRow & { job_sources: { name: string } | null }>> {
  const { data } = await supabase
    .from("job_imports")
    .select("*, job_sources(name)")
    .order("created_at", { ascending: false });
  return (data as Array<JobImportRow & { job_sources: { name: string } | null }>) ?? [];
}

export async function getJobImportById(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<
  (JobImportRow & { job_sources: { name: string; official_domain: string } | null }) | null
> {
  const { data } = await supabase
    .from("job_imports")
    .select("*, job_sources(name, official_domain)")
    .eq("id", id)
    .maybeSingle();
  return data as
    (JobImportRow & { job_sources: { name: string; official_domain: string } | null }) | null;
}

export async function createJobImport(
  adminClient: SupabaseClient<Database>,
  input: JobImportInsert,
): Promise<{ data: JobImportRow | null; error: PostgrestError | null }> {
  return adminClient.from("job_imports").insert(input).select("*").single();
}

/** Service-role only — used for the automated fetch/extract/parse pipeline's own status transitions. */
export async function updateJobImportPipelineState(
  adminClient: SupabaseClient<Database>,
  id: string,
  patch: JobImportUpdate,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await adminClient.from("job_imports").update(patch).eq("id", id);
  return { error };
}

/** Caller's own RLS-scoped client — RLS's job_imports_update_reviewer policy is the enforcement layer. */
export async function updateJobImportAsReviewer(
  supabase: SupabaseClient<Database>,
  id: string,
  patch: JobImportUpdate,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("job_imports").update(patch).eq("id", id);
  return { error };
}
