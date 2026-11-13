-- Phase 2: exam catalog and candidate preparation targets.
--
-- * exams: the verified catalog candidates browse. Anything not yet verified
--   by an admin (including exams found through external search) lives here as
--   `draft` + `pending_verification` and is invisible to candidates.
-- * user_exam_targets: which exams a candidate is preparing for (one primary,
--   any number of secondary). Rows are never deleted by the app: removing a
--   target sets status = 'removed' so preparation history is preserved.

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and slug <> 'exams'),
  name text not null check (char_length(name) between 1 and 300),
  short_name text check (short_name is null or char_length(short_name) <= 60),
  organization_id uuid references public.organizations (id),
  category text not null check (
    category in (
      'banking', 'ssc', 'railways', 'upsc', 'defence', 'teaching',
      'police', 'state_psc', 'insurance', 'engineering', 'other'
    )
  ),
  description text check (description is null or char_length(description) <= 4000),
  official_website_url text check (official_website_url is null or official_website_url ~ '^https://'),
  -- Where this catalog entry's facts come from (an official page or notice).
  source_url text check (source_url is null or source_url ~ '^https://'),
  -- Per-language overrides for future languages: {"hi": {"name": "...", "description": "..."}}
  translations jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  verification_status text not null default 'pending_verification' check (
    verification_status in ('pending_verification', 'admin_verified', 'rejected')
  ),
  discovered_via text not null default 'admin' check (discovered_via in ('admin', 'external_search')),
  created_by uuid references auth.users (id) on delete set null,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A published exam must be admin-verified and point at an official site.
  constraint exams_published_requires_verification check (
    status <> 'published'
    or (verification_status = 'admin_verified' and official_website_url is not null)
  )
);
comment on table public.exams is 'Exam catalog. Candidates only ever see status = published (which requires admin verification).';
create index exams_category_idx on public.exams (category) where status = 'published';
create index exams_organization_idx on public.exams (organization_id);

alter table public.exams enable row level security;

create policy exams_select_published on public.exams
  for select to anon, authenticated
  using (status = 'published' and verification_status = 'admin_verified');

create policy exams_select_reviewer on public.exams
  for select to authenticated
  using (public.is_admin(auth.uid(), 'reviewer'));

create policy exams_write_editor on public.exams
  for all to authenticated
  using (public.is_admin(auth.uid(), 'editor'))
  with check (public.is_admin(auth.uid(), 'editor'));

-- Only an admin (not an editor) may verify/reject an exam or publish it.
-- auth.uid() is null for the service role / migrations, which are trusted.
create function public.enforce_exam_review_rights()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if (new.verification_status <> 'pending_verification' or new.status <> 'draft')
       and not public.is_admin(auth.uid(), 'admin') then
      raise exception 'Only an admin can create a verified or published exam';
    end if;
  elsif new.verification_status is distinct from old.verification_status
        or new.status is distinct from old.status then
    if not public.is_admin(auth.uid(), 'admin') then
      raise exception 'Only an admin can change an exam''s verification or publication status';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_exam_review_rights() from public;

create trigger exams_enforce_review_rights
  before insert or update on public.exams
  for each row execute function public.enforce_exam_review_rights();

-- ----------------------------------------------------------------------------
-- user_exam_targets
-- ----------------------------------------------------------------------------
create table public.user_exam_targets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  exam_id uuid not null references public.exams (id),
  is_primary boolean not null default false,
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  target_year integer check (target_year is null or target_year between 2000 and 2100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (profile_id, exam_id),
  -- Only an active target can be the primary one.
  constraint user_exam_targets_primary_is_active check (not is_primary or status = 'active')
);
comment on table public.user_exam_targets is 'Exams a candidate is preparing for; removal is a status change so history is kept.';
create unique index user_exam_targets_one_primary
  on public.user_exam_targets (profile_id) where is_primary;
create index user_exam_targets_exam_idx on public.user_exam_targets (exam_id);

alter table public.user_exam_targets enable row level security;

create policy user_exam_targets_select_own on public.user_exam_targets
  for select to authenticated
  using (profile_id = auth.uid());

-- A candidate may only start preparing for a published, verified exam.
create policy user_exam_targets_insert_own on public.user_exam_targets
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.exams e
      where e.id = exam_id and e.status = 'published' and e.verification_status = 'admin_verified'
    )
  );

create policy user_exam_targets_update_own on public.user_exam_targets
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
-- No DELETE policy: history is preserved; "remove" is status = 'removed'.
