import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export type AgeRuleRow = Database["public"]["Tables"]["job_age_rules"]["Row"];
export type RelaxationRow = Database["public"]["Tables"]["job_relaxations"]["Row"] & {
  categories: { name: string } | null;
  statuses: { name: string } | null;
};
export type StatusRequirementRow =
  Database["public"]["Tables"]["job_status_requirements"]["Row"] & {
    statuses: { name: string } | null;
  };
export type StateScopeRow = Database["public"]["Tables"]["job_state_scope"]["Row"];
export type StateScopeStateRow = Database["public"]["Tables"]["job_state_scope_states"]["Row"] & {
  states: { name: string } | null;
};
export type GenderRuleRow = Database["public"]["Tables"]["job_gender_rules"]["Row"];
export type ExperienceRuleRow = Database["public"]["Tables"]["job_experience_rules"]["Row"];
export type QualificationRequirementRow =
  Database["public"]["Tables"]["job_qualification_requirements"]["Row"] & {
    qualifications: { name: string } | null;
    education_levels: { name: string } | null;
  };

// --- Age rule (0 or 1 per post) -------------------------------------------

export async function getAgeRule(supabase: DB, jobPostId: string): Promise<AgeRuleRow | null> {
  const { data } = await supabase
    .from("job_age_rules")
    .select("*")
    .eq("job_post_id", jobPostId)
    .maybeSingle();
  return data;
}

export async function upsertAgeRule(
  supabase: DB,
  input: {
    jobPostId: string;
    minAge: number | null;
    maxAge: number | null;
    ageCutoffDate: string;
    relaxationCombinationMode: string;
  },
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("job_age_rules").upsert(
    {
      job_post_id: input.jobPostId,
      min_age: input.minAge,
      max_age: input.maxAge,
      age_cutoff_date: input.ageCutoffDate,
      relaxation_combination_mode: input.relaxationCombinationMode,
    },
    { onConflict: "job_post_id" },
  );
  return { error };
}

// --- Relaxations (many per post) ------------------------------------------

export async function listRelaxations(supabase: DB, jobPostId: string): Promise<RelaxationRow[]> {
  const { data } = await supabase
    .from("job_relaxations")
    .select("*, categories(name), statuses(name)")
    .eq("job_post_id", jobPostId)
    .order("created_at");
  return (data as RelaxationRow[] | null) ?? [];
}

export async function addRelaxation(
  supabase: DB,
  input: {
    jobPostId: string;
    categoryId?: string | undefined;
    statusId?: string | undefined;
    ageRelaxationYears: number;
  },
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("job_relaxations").insert({
    job_post_id: input.jobPostId,
    category_id: input.categoryId ?? null,
    status_id: input.statusId ?? null,
    age_relaxation_years: input.ageRelaxationYears,
  });
  return { error };
}

export async function removeRelaxation(
  supabase: DB,
  id: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("job_relaxations").delete().eq("id", id);
  return { error };
}

// --- Status requirements (many per post) -----------------------------------

export async function listStatusRequirements(
  supabase: DB,
  jobPostId: string,
): Promise<StatusRequirementRow[]> {
  const { data } = await supabase
    .from("job_status_requirements")
    .select("*, statuses(name)")
    .eq("job_post_id", jobPostId)
    .order("created_at");
  return (data as StatusRequirementRow[] | null) ?? [];
}

export async function addStatusRequirement(
  supabase: DB,
  input: { jobPostId: string; statusId: string; requirementType: string },
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("job_status_requirements").insert({
    job_post_id: input.jobPostId,
    status_id: input.statusId,
    requirement_type: input.requirementType,
  });
  return { error };
}

export async function removeStatusRequirement(
  supabase: DB,
  id: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("job_status_requirements").delete().eq("id", id);
  return { error };
}

// --- State scope (0 or 1 per post) + its states (many) --------------------

export async function getStateScope(
  supabase: DB,
  jobPostId: string,
): Promise<StateScopeRow | null> {
  const { data } = await supabase
    .from("job_state_scope")
    .select("*")
    .eq("job_post_id", jobPostId)
    .maybeSingle();
  return data;
}

export async function upsertStateScope(
  supabase: DB,
  input: { jobPostId: string; scopeType: string },
): Promise<{ data: StateScopeRow | null; error: PostgrestError | null }> {
  return supabase
    .from("job_state_scope")
    .upsert(
      { job_post_id: input.jobPostId, scope_type: input.scopeType },
      { onConflict: "job_post_id" },
    )
    .select("*")
    .single();
}

export async function listStateScopeStates(
  supabase: DB,
  jobStateScopeId: string,
): Promise<StateScopeStateRow[]> {
  const { data } = await supabase
    .from("job_state_scope_states")
    .select("*, states(name)")
    .eq("job_state_scope_id", jobStateScopeId);
  return (data as StateScopeStateRow[] | null) ?? [];
}

export async function addStateScopeState(
  supabase: DB,
  input: { jobStateScopeId: string; stateId: string },
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from("job_state_scope_states")
    .insert({ job_state_scope_id: input.jobStateScopeId, state_id: input.stateId });
  return { error };
}

export async function removeStateScopeState(
  supabase: DB,
  id: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("job_state_scope_states").delete().eq("id", id);
  return { error };
}

// --- Gender rule (0 or 1 per post) -----------------------------------------

export async function getGenderRule(
  supabase: DB,
  jobPostId: string,
): Promise<GenderRuleRow | null> {
  const { data } = await supabase
    .from("job_gender_rules")
    .select("*")
    .eq("job_post_id", jobPostId)
    .maybeSingle();
  return data;
}

export async function upsertGenderRule(
  supabase: DB,
  input: { jobPostId: string; allowedGender: string },
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from("job_gender_rules")
    .upsert(
      { job_post_id: input.jobPostId, allowed_gender: input.allowedGender },
      { onConflict: "job_post_id" },
    );
  return { error };
}

// --- Experience rule (0 or 1 per post) -------------------------------------

export async function getExperienceRule(
  supabase: DB,
  jobPostId: string,
): Promise<ExperienceRuleRow | null> {
  const { data } = await supabase
    .from("job_experience_rules")
    .select("*")
    .eq("job_post_id", jobPostId)
    .maybeSingle();
  return data;
}

export async function upsertExperienceRule(
  supabase: DB,
  input: {
    jobPostId: string;
    minYears: number | null;
    maxYears: number | null;
    domainNote: string | null;
    asOfDate: string | null;
  },
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("job_experience_rules").upsert(
    {
      job_post_id: input.jobPostId,
      min_years: input.minYears,
      max_years: input.maxYears,
      domain_note: input.domainNote,
      as_of_date: input.asOfDate,
    },
    { onConflict: "job_post_id" },
  );
  return { error };
}

// --- Qualification requirements (many per post) -----------------------------

export async function listQualificationRequirements(
  supabase: DB,
  jobPostId: string,
): Promise<QualificationRequirementRow[]> {
  const { data } = await supabase
    .from("job_qualification_requirements")
    .select("*, qualifications(name), education_levels(name)")
    .eq("job_post_id", jobPostId)
    .order("group_id");
  return (data as QualificationRequirementRow[] | null) ?? [];
}

export async function addQualificationRequirement(
  supabase: DB,
  input: {
    jobPostId: string;
    qualificationId?: string | undefined;
    educationLevelId?: string | undefined;
    groupId: number;
    verificationStatus: string;
  },
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("job_qualification_requirements").insert({
    job_post_id: input.jobPostId,
    qualification_id: input.qualificationId ?? null,
    education_level_id: input.educationLevelId ?? null,
    group_id: input.groupId,
    verification_status: input.verificationStatus,
  });
  return { error };
}

export async function removeQualificationRequirement(
  supabase: DB,
  id: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase.from("job_qualification_requirements").delete().eq("id", id);
  return { error };
}
