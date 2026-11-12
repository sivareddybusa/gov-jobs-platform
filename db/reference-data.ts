import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type ReferenceOption = { id: string; name: string };

/**
 * Read-only lookups over the platform's reference tables
 * (categories/states/education_levels/qualifications/statuses), used both to
 * populate form <select> options and to re-verify a submitted FK id
 * server-side before any write (DATABASE.md §5-§7, §5A; CLAUDE.md: "never
 * trust client-side authorization" extends to "never trust a client-supplied
 * reference id without re-checking it exists and is active").
 *
 * `qualifications` has no `is_active` column (DATABASE.md §7) — its
 * existence check is a plain lookup, not an active-flag check.
 */

export async function listActiveCategories(
  supabase: SupabaseClient<Database>,
): Promise<ReferenceOption[]> {
  const { data } = await supabase
    .from("categories")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

export async function categoryIsActive(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("categories")
    .select("id")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  return data !== null;
}

export async function listActiveStates(
  supabase: SupabaseClient<Database>,
): Promise<ReferenceOption[]> {
  const { data } = await supabase
    .from("states")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

export async function stateIsActive(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("states")
    .select("id")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  return data !== null;
}

export async function listActiveEducationLevels(
  supabase: SupabaseClient<Database>,
): Promise<ReferenceOption[]> {
  const { data } = await supabase
    .from("education_levels")
    .select("id, name")
    .eq("is_active", true)
    .order("rank");
  return data ?? [];
}

export async function educationLevelIsActive(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("education_levels")
    .select("id")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  return data !== null;
}

export async function listQualificationOptions(
  supabase: SupabaseClient<Database>,
): Promise<ReferenceOption[]> {
  const { data } = await supabase.from("qualifications").select("id, name").order("name");
  return data ?? [];
}

export async function qualificationExists(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<boolean> {
  const { data } = await supabase.from("qualifications").select("id").eq("id", id).maybeSingle();
  return data !== null;
}

export async function listActiveStatuses(
  supabase: SupabaseClient<Database>,
): Promise<ReferenceOption[]> {
  const { data } = await supabase
    .from("statuses")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

export async function statusIsActive(
  supabase: SupabaseClient<Database>,
  id: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("statuses")
    .select("id")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  return data !== null;
}
