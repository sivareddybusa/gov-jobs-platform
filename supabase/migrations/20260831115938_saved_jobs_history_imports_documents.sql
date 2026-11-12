-- Phase 2: database foundation.
-- §20 (saved_jobs), §21 (job_history), §22 (job_imports), §23 (job_documents).

create table public.saved_jobs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  job_post_id uuid not null references public.job_posts (id) on delete cascade,
  saved_at timestamptz not null default now(),
  unique (profile_id, job_post_id)
);
comment on table public.saved_jobs is 'A user''s bookmarked jobs (DATABASE.md §20).';

-- §21 job_history — append-only field-level diff log. changed_by uses
-- ON DELETE SET NULL: the change record must outlive the acting account
-- (DATABASE.md §21, closing the gap SECURITY.md §23 identified).
create table public.job_history (
  id uuid primary key default gen_random_uuid(),
  job_notification_id uuid not null references public.job_notifications (id) on delete cascade,
  job_post_id uuid references public.job_posts (id) on delete cascade,
  changed_by uuid references auth.users (id) on delete set null,
  field_name text not null,
  old_value text,
  new_value text,
  change_reason text,
  changed_at timestamptz not null default now()
);
comment on table public.job_history is 'Field-level change log for notifications/posts; changed_by is ON DELETE SET NULL (DATABASE.md §21).';

-- §22 job_imports — AI/ingestion extraction tracking. reviewed_by uses
-- ON DELETE SET NULL for the same reason as job_history.changed_by.
create table public.job_imports (
  id uuid primary key default gen_random_uuid(),
  job_source_id uuid not null references public.job_sources (id),
  job_notification_id uuid references public.job_notifications (id),
  source_url text not null,
  document_url text,
  status text not null check (
    status in (
      'discovered', 'downloaded', 'extracted', 'parsed',
      'validation_failed', 'review_required', 'approved', 'rejected'
    )
  ),
  ai_provider text,
  ai_model text,
  raw_extraction_output jsonb,
  validation_errors jsonb,
  extracted_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.job_imports is 'AI/ingestion extraction tracking; reviewed_by is ON DELETE SET NULL (DATABASE.md §22).';

-- §23 job_documents
create table public.job_documents (
  id uuid primary key default gen_random_uuid(),
  job_notification_id uuid not null references public.job_notifications (id) on delete cascade,
  document_type text not null check (document_type in ('advertisement', 'corrigendum', 'result', 'other')),
  source_url text not null check (source_url ~* '^https://'),
  storage_path text,
  checksum text,
  version smallint not null default 1,
  published_date date,
  downloaded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_notification_id, source_url, version)
);
comment on table public.job_documents is 'Advertisement/corrigendum/document records (DATABASE.md §23).';

-- §27 indexes
create index saved_jobs_profile_id_idx on public.saved_jobs (profile_id);
create index job_history_job_notification_id_idx on public.job_history (job_notification_id);
create index job_history_job_post_id_idx on public.job_history (job_post_id);
create index job_imports_job_source_id_idx on public.job_imports (job_source_id);
create index job_imports_job_notification_id_idx on public.job_imports (job_notification_id);
create index job_documents_job_notification_id_idx on public.job_documents (job_notification_id);
