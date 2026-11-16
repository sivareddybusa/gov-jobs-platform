-- Phase 4: official study-material LINKS per exam. Files stay on the official
-- site (nothing is copied or hosted here). Rows are written only by the
-- service role from the automatic sync (services/materials/sync.ts).

create table public.exam_materials (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  kind text not null check (kind in ('notification', 'syllabus', 'sample_paper', 'guidance')),
  title text not null check (char_length(title) between 1 and 300),
  -- Must be an https link on an official host.
  url text not null check (public.is_official_exam_url(url) and char_length(url) <= 2000),
  host text not null check (char_length(host) between 1 and 255),
  discovered_at timestamptz not null default now(),
  -- Refreshed every time the search still returns the link.
  last_seen_at timestamptz not null default now(),
  unique (exam_id, url)
);
comment on table public.exam_materials is 'Official document links per exam. No files are stored; written only by the service-role sync.';
create index exam_materials_exam_idx on public.exam_materials (exam_id, kind);

alter table public.exam_materials enable row level security;

create policy exam_materials_select_published on public.exam_materials
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.exams e
      where e.id = exam_id
        and e.status = 'published'
        and e.verification_status in ('admin_verified', 'auto_verified')
    )
  );
create policy exam_materials_select_reviewer on public.exam_materials
  for select to authenticated
  using (public.is_admin(auth.uid(), 'reviewer'));
-- No INSERT/UPDATE/DELETE policy: only the service role writes.

alter table public.exams
  add column materials_synced_at timestamptz,
  add column materials_error text check (materials_error is null or char_length(materials_error) <= 500);
