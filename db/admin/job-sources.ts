import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type JobSourceRow = Database["public"]["Tables"]["job_sources"]["Row"];
export type JobSourceInsert = Database["public"]["Tables"]["job_sources"]["Insert"];
export type JobSourceUpdate = Database["public"]["Tables"]["job_sources"]["Update"];

export async function listJobSources(supabase: SupabaseClient<Database>): Promise<JobSourceRow[]> {
  const { data } = await supabase.from("job_sources").select("*").order("name");
  return data ?? [];
}

export async function getJobSourceById(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<JobSourceRow | null> {
  const { data } = await supabase.from("job_sources").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function createJobSource(
  supabase: SupabaseClient<Database>,
  input: JobSourceInsert,
): Promise<{ data: JobSourceRow | null; error: PostgrestError | null }> {
  return supabase.from("job_sources").insert(input).select("*").single();
}

export async function updateJobSource(
  supabase: SupabaseClient<Database>,
  id: string,
  patch: JobSourceUpdate,
): Promise<{ data: JobSourceRow | null; error: PostgrestError | null }> {
  return supabase.from("job_sources").update(patch).eq("id", id).select("*").single();
}
