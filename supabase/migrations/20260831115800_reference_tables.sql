-- Phase 2: database foundation.
-- Reference/lookup tables with no dependency on user or job data.
-- DATABASE.md §5 (categories), §5A (statuses), §6 (states), §7 (education
-- levels/qualifications), §11 (job statuses), §24 (admin roles).

-- §5 Categories — canonical reservation categories only (General/UR, OBC, SC,
-- ST, EWS). PwD/PwBD and Ex-Servicemen are NOT modeled here — see `statuses`
-- below (§5A resolved decision).
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  parent_id uuid references public.categories (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.categories is 'Canonical reservation-category reference list (DATABASE.md §5).';

create table public.category_aliases (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories (id) on delete cascade,
  alias text not null,
  source_note text,
  unique (category_id, alias)
);
comment on table public.category_aliases is 'Alternate labels (e.g. state PSC-specific) mapping onto a canonical category (DATABASE.md §5).';

-- §5A Statuses — independent, composable special statuses (PwBD, Ex-Serviceman,
-- Departmental Candidate, ...), structurally separate from `categories`.
create table public.statuses (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.statuses is 'Canonical independent special-status reference list (DATABASE.md §5A).';

-- §6 States
create table public.states (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  is_union_territory boolean not null default false,
  is_active boolean not null default true
);
comment on table public.states is 'Indian states/UTs reference list (DATABASE.md §6).';

-- §7 Education levels and qualifications
create table public.education_levels (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  rank smallint not null,
  is_active boolean not null default true
);
comment on table public.education_levels is 'Ranked education-level reference list (DATABASE.md §7).';

create table public.qualifications (
  id uuid primary key default gen_random_uuid(),
  education_level_id uuid not null references public.education_levels (id),
  code text not null unique,
  name text not null,
  field_of_study text,
  is_generic boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.qualifications is 'Specific/generic degree qualifications (DATABASE.md §7).';

-- §11 Job statuses — lookup table, not a native enum (DATABASE.md §11 decision).
create table public.job_statuses (
  code text primary key,
  description text not null,
  sort_order smallint not null
);
comment on table public.job_statuses is 'Lookup of valid job_notifications lifecycle statuses (DATABASE.md §11).';

-- §24 Admin roles
create table public.admin_roles (
  code text primary key,
  description text not null
);
comment on table public.admin_roles is 'Lookup of admin role codes (DATABASE.md §24).';
