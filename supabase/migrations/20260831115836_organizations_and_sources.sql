-- Phase 2: database foundation.
-- §8 (organizations, departments), §9 (job_sources).

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  short_code text unique,
  org_type text not null check (org_type in ('central', 'state', 'psu', 'autonomous_body', 'other')),
  state_id uuid references public.states (id),
  website_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.organizations is 'Government recruiting bodies (DATABASE.md §8).';

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  unique (organization_id, name)
);
comment on table public.departments is 'Sub-units of an organization (DATABASE.md §8).';

-- §9 job_sources — every job must have a traceable source; official_domain is
-- the trust anchor URL validation is checked against at the application layer.
create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id),
  name text not null,
  official_domain text not null,
  source_type text not null check (
    source_type in ('official_website', 'official_portal', 'official_pdf', 'api', 'manual_admin_entry')
  ),
  source_url text not null,
  is_active boolean not null default true,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.job_sources is 'Traceable source of a job notification (DATABASE.md §9).';
