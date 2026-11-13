-- Exam catalog is now fed automatically from Google Search + official pages
-- (docs/GOOGLE_SEARCH_INTEGRATION.md). Admins no longer author exams; the
-- sync job (service role) creates/refreshes them, and may auto-publish ONLY
-- when the source is an official domain. That rule is enforced here, in the
-- database, not just in application code.

alter table public.exams drop constraint exams_published_requires_verification;
alter table public.exams drop constraint exams_verification_status_check;
alter table public.exams drop constraint exams_discovered_via_check;

alter table public.exams
  add constraint exams_verification_status_check check (
    verification_status in ('pending_verification', 'admin_verified', 'auto_verified', 'rejected')
  ),
  add constraint exams_discovered_via_check check (
    discovered_via in ('admin', 'external_search', 'google_sync')
  );

alter table public.exams
  add column last_synced_at timestamptz,
  add column sync_status text check (sync_status is null or sync_status in ('ok', 'failed')),
  add column sync_error text check (sync_error is null or char_length(sync_error) <= 500);

-- Official hosts: government / NIC / academic-institution domains and IBPS.
-- Anchored so "evilgov.in", "gov.in@evil.com" and "x.com/gov.in" do not match.
create function public.is_official_exam_url(url text)
returns boolean
language sql
immutable
as $$
  select url is not null
    and lower(url) ~ '^https://([a-z0-9-]+\.)*(gov\.in|nic\.in|ac\.in|ibps\.in)(:[0-9]+)?(/|$)'
$$;

alter table public.exams
  add constraint exams_published_requires_verification check (
    status <> 'published'
    or (
      verification_status in ('admin_verified', 'auto_verified')
      and official_website_url is not null
    )
  ),
  -- Automatic verification is only ever granted for an official domain, on
  -- both the exam's website and the page it was read from.
  add constraint exams_auto_verified_requires_official_host check (
    verification_status <> 'auto_verified'
    or (
      public.is_official_exam_url(official_website_url)
      and public.is_official_exam_url(source_url)
    )
  );

-- Candidates see published exams that were verified either way.
drop policy exams_select_published on public.exams;
create policy exams_select_published on public.exams
  for select to anon, authenticated
  using (status = 'published' and verification_status in ('admin_verified', 'auto_verified'));

-- Admins no longer create or edit exams: only the service-role sync writes
-- content. An admin may still take bad content down (status changes), so
-- keep UPDATE for admins only; there is no INSERT/DELETE policy for users.
drop policy exams_write_editor on public.exams;
create policy exams_update_admin on public.exams
  for update to authenticated
  using (public.is_admin(auth.uid(), 'admin'))
  with check (public.is_admin(auth.uid(), 'admin'));

drop policy user_exam_targets_insert_own on public.user_exam_targets;
create policy user_exam_targets_insert_own on public.user_exam_targets
  for insert to authenticated
  with check (
    profile_id = auth.uid()
    and exists (
      select 1 from public.exams e
      where e.id = exam_id
        and e.status = 'published'
        and e.verification_status in ('admin_verified', 'auto_verified')
    )
  );
