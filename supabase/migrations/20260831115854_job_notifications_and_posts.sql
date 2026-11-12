-- Phase 2: database foundation.
-- §10 (job_notifications / job_posts two-table model), §27 (search index).

create table public.job_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id),
  department_id uuid references public.departments (id),
  source_id uuid not null references public.job_sources (id),
  title text not null,
  slug text not null unique,
  description text,
  recruitment_type text not null check (
    recruitment_type in ('direct', 'promotion', 'contract', 'deputation', 'other')
  ),
  official_advertisement_url text not null check (official_advertisement_url ~* '^https://'),
  official_application_url text check (
    official_application_url is null or official_application_url ~* '^https://'
  ),
  notification_date date not null,
  application_start_date date,
  application_end_date date,
  status text not null default 'discovered' references public.job_statuses (code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  expires_at timestamptz,
  check (
    application_end_date is null or application_start_date is null
    or application_end_date >= application_start_date
  )
);
comment on table public.job_notifications is 'A recruitment notification, parent of one or more job_posts (DATABASE.md §10).';

create table public.job_posts (
  id uuid primary key default gen_random_uuid(),
  job_notification_id uuid not null references public.job_notifications (id) on delete cascade,
  title text not null,
  vacancy_count integer check (vacancy_count is null or vacancy_count >= 0),
  pay_scale_min numeric(12, 2),
  pay_scale_max numeric(12, 2),
  pay_scale_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.job_posts is 'An individual post/position within a job_notification (DATABASE.md §10).';

-- §27 indexes tied to named query patterns in DATABASE.md.
create index job_notifications_status_notification_date_idx
  on public.job_notifications (status, notification_date desc);

create index job_notifications_closing_soon_idx
  on public.job_notifications (application_end_date)
  where status = 'published';

create index job_notifications_organization_id_idx
  on public.job_notifications (organization_id);

create index job_posts_job_notification_id_idx
  on public.job_posts (job_notification_id);

create index job_notifications_search_idx
  on public.job_notifications using gin (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  );

create index job_posts_title_idx on public.job_posts (title);
