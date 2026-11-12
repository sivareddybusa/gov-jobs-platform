-- Phase 2: database foundation.
-- Per-job_post eligibility rule tables — one typed table per dimension,
-- never a JSON blob (DATABASE.md §12, ELIGIBILITY_ENGINE.md §3).
-- §13 (age), §14 (category & status relaxation), §14A (status-gated
-- eligibility), §15 (state/domicile), §16 (gender), §17 (experience),
-- §7/§18 (qualification requirements).

-- §13 Age rules — age itself is never stored; relaxation_combination_mode is
-- a single per-post fact, so it lives here rather than on job_relaxations.
create table public.job_age_rules (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null unique references public.job_posts (id) on delete cascade,
  min_age smallint check (min_age is null or min_age >= 0),
  max_age smallint check (max_age is null or max_age >= 0),
  age_cutoff_date date not null,
  relaxation_combination_mode text not null default 'unsupported' check (
    relaxation_combination_mode in ('additive', 'max_of', 'mutually_exclusive', 'unsupported')
  ),
  is_confident boolean not null default true,
  parse_note text,
  check (min_age is null or max_age is null or max_age >= min_age)
);
comment on table public.job_age_rules is 'Per-post age min/max/cutoff and relaxation combination mode (DATABASE.md §13).';

-- §14 job_relaxations — widened from the earlier job_category_relaxations to
-- reference either a category or a status, never both/neither. One table,
-- one evaluation path for both relaxation sources.
create table public.job_relaxations (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null references public.job_posts (id) on delete cascade,
  category_id uuid references public.categories (id),
  status_id uuid references public.statuses (id),
  age_relaxation_years smallint not null default 0 check (age_relaxation_years >= 0),
  is_confident boolean not null default true,
  parse_note text,
  created_at timestamptz not null default now(),
  check (
    (category_id is not null and status_id is null)
    or (category_id is null and status_id is not null)
  ),
  -- NULLS NOT DISTINCT: since exactly one of category_id/status_id is set
  -- per row, the other is always NULL, and plain UNIQUE would treat two
  -- NULLs as distinct (standard SQL behavior) — silently allowing duplicate
  -- rows for the same category (or same status) on the same post. This
  -- constraint is what DATABASE.md §14/§28 actually requires: "One row per
  -- (job_post_id, category_id) or (job_post_id, status_id)".
  unique nulls not distinct (job_post_id, category_id, status_id)
);
comment on table public.job_relaxations is 'Per-post age relaxation keyed by exactly one of category_id or status_id (DATABASE.md §14).';

-- §14A job_status_requirements — status-*gated* eligibility, distinct from
-- relaxation. 'preference' must never be treated as a hard eligibility gate.
create table public.job_status_requirements (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null references public.job_posts (id) on delete cascade,
  status_id uuid not null references public.statuses (id),
  requirement_type text not null check (requirement_type in ('required', 'optional', 'preference')),
  is_confident boolean not null default true,
  parse_note text,
  created_at timestamptz not null default now(),
  unique (job_post_id, status_id)
);
comment on table public.job_status_requirements is 'Per-post status gating: required/optional/preference (DATABASE.md §14A).';

-- §15 State / domicile rules
create table public.job_state_scope (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null unique references public.job_posts (id) on delete cascade,
  scope_type text not null check (scope_type in ('all_india', 'specific_states', 'domicile_required'))
);
comment on table public.job_state_scope is 'Per-post state/domicile eligibility scope (DATABASE.md §15).';

create table public.job_state_scope_states (
  id uuid primary key default gen_random_uuid(),
  job_state_scope_id uuid not null references public.job_state_scope (id) on delete cascade,
  state_id uuid not null references public.states (id),
  unique (job_state_scope_id, state_id)
);
comment on table public.job_state_scope_states is 'States belonging to a job_state_scope of specific_states/domicile_required (DATABASE.md §15).';

-- §16 Gender rules — absence of a row means unrestricted.
create table public.job_gender_rules (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null unique references public.job_posts (id) on delete cascade,
  allowed_gender text not null check (allowed_gender in ('all', 'male', 'female', 'other'))
);
comment on table public.job_gender_rules is 'Per-post gender restriction (DATABASE.md §16).';

-- §17 Experience rules
create table public.job_experience_rules (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null unique references public.job_posts (id) on delete cascade,
  min_years numeric(4, 1) check (min_years is null or min_years >= 0),
  max_years numeric(4, 1),
  domain_note text,
  as_of_date date,
  is_confident boolean not null default true,
  parse_note text
);
comment on table public.job_experience_rules is 'Per-post experience requirement (DATABASE.md §17).';

-- §7 / §18 Qualification requirements — AND-of-OR groups, with an auditable
-- verification_status so a low-confidence row never silently reads as a pass.
create table public.job_qualification_requirements (
  id uuid primary key default gen_random_uuid(),
  job_post_id uuid not null references public.job_posts (id) on delete cascade,
  qualification_id uuid references public.qualifications (id),
  education_level_id uuid references public.education_levels (id),
  group_id smallint not null default 1,
  verification_status text not null default 'ai_extracted' check (
    verification_status in ('verified', 'ai_extracted', 'ambiguous', 'unsupported')
  ),
  confidence_score numeric(3, 2) check (
    confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)
  ),
  parse_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.job_qualification_requirements is 'AND-of-OR qualification requirements per post, with verification_status (DATABASE.md §7).';

-- §27 indexes
create index job_relaxations_job_post_id_idx on public.job_relaxations (job_post_id);
create index job_relaxations_category_id_idx on public.job_relaxations (category_id);
create index job_relaxations_status_id_idx on public.job_relaxations (status_id);
create index job_status_requirements_job_post_id_idx on public.job_status_requirements (job_post_id);
create index job_state_scope_job_post_id_idx on public.job_state_scope (job_post_id);
create index job_state_scope_states_scope_id_idx on public.job_state_scope_states (job_state_scope_id);
create index job_state_scope_states_state_id_idx on public.job_state_scope_states (state_id);
create index job_gender_rules_job_post_id_idx on public.job_gender_rules (job_post_id);
create index job_experience_rules_job_post_id_idx on public.job_experience_rules (job_post_id);
create index job_qualification_requirements_job_post_id_idx on public.job_qualification_requirements (job_post_id);
create index job_qualification_requirements_qualification_id_idx on public.job_qualification_requirements (qualification_id);
