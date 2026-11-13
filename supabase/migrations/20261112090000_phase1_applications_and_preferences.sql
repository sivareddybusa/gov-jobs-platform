-- Phase 1 (candidate platform expansion): Application Tracker + user preferences.
--
-- * supported_languages: reference table so adding a future Indian language is
--   a data change, not a schema change (English + Hindi seeded).
-- * user_preferences: per-user language and notification channel switches.
--   Email delivery is designed-for but not yet active (in-app first).
-- * job_applications: a candidate's own tracker entries, one per job post.
-- * job_application_status_history: append-only; written ONLY by a trigger so
--   no client (even the owner) can forge or rewrite it.

-- ----------------------------------------------------------------------------
-- supported_languages
-- ----------------------------------------------------------------------------
create table public.supported_languages (
  code text primary key check (code ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'),
  name text not null,
  native_name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.supported_languages is 'Languages the product UI/content can be offered in (BCP-47 style codes).';

insert into public.supported_languages (code, name, native_name, sort_order) values
  ('en', 'English', 'English', 1),
  ('hi', 'Hindi', 'हिन्दी', 2);

alter table public.supported_languages enable row level security;
create policy supported_languages_select_public on public.supported_languages
  for select to anon, authenticated using (true);
create policy supported_languages_write_admin on public.supported_languages
  for all to authenticated
  using (public.is_admin(auth.uid(), 'admin'))
  with check (public.is_admin(auth.uid(), 'admin'));

-- ----------------------------------------------------------------------------
-- user_preferences
-- ----------------------------------------------------------------------------
create table public.user_preferences (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  language_code text not null default 'en' references public.supported_languages (code),
  in_app_notifications boolean not null default true,
  -- Reserved for the future email channel; no sender reads this yet.
  email_notifications boolean not null default false,
  updated_at timestamptz not null default now()
);
comment on table public.user_preferences is 'Per-user settings (language, notification channels).';

alter table public.user_preferences enable row level security;
create policy user_preferences_all_own on public.user_preferences
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ----------------------------------------------------------------------------
-- job_applications
-- ----------------------------------------------------------------------------
create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  job_post_id uuid not null references public.job_posts (id) on delete cascade,
  status text not null default 'interested' check (
    status in (
      'interested', 'preparing', 'applied', 'admit_card_released',
      'exam_scheduled', 'result_awaited', 'selected', 'not_selected', 'withdrawn'
    )
  ),
  applied_on date,
  application_number text check (application_number is null or char_length(application_number) <= 100),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, job_post_id)
);
comment on table public.job_applications is 'A candidate''s application-tracker entry for one job post (private to the owner).';
create index job_applications_profile_idx on public.job_applications (profile_id, updated_at desc);

alter table public.job_applications enable row level security;
create policy job_applications_all_own on public.job_applications
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ----------------------------------------------------------------------------
-- job_application_status_history (trigger-written, append-only)
-- ----------------------------------------------------------------------------
create table public.job_application_status_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_at timestamptz not null default now()
);
comment on table public.job_application_status_history is 'Append-only status timeline; written only by trigger.';
create index job_application_status_history_app_idx
  on public.job_application_status_history (application_id, changed_at);

alter table public.job_application_status_history enable row level security;
-- SELECT for the owner only; deliberately NO insert/update/delete policy.
create policy job_application_status_history_select_own on public.job_application_status_history
  for select to authenticated
  using (
    exists (
      select 1 from public.job_applications a
      where a.id = application_id and a.profile_id = auth.uid()
    )
  );

create function public.record_job_application_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.job_application_status_history (application_id, from_status, to_status)
    values (new.id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.job_application_status_history (application_id, from_status, to_status)
    values (new.id, old.status, new.status);
  end if;
  return null;
end;
$$;
revoke all on function public.record_job_application_status() from public;

create trigger job_applications_status_history
  after insert or update of status on public.job_applications
  for each row execute function public.record_job_application_status();
