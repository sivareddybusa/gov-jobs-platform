-- Phase 2: database foundation.
-- Row Level Security — DATABASE.md §26, SECURITY.md §6. RLS is mandatory for
-- every application table; no table is left disabled "temporarily".
--
-- Role-tier interpretation notes (DATABASE.md §26 states some tiers
-- explicitly, e.g. "editor+" for rule tables and "reviewer+"/"admin+" for
-- job_imports/audit_logs; for the handful of cells it leaves as a bare
-- "Admin" without naming a tier, this migration applies the most
-- spec-consistent, least-privilege reading rather than inventing one:
--   - profiles/user_qualifications/profile_statuses admin SELECT (support
--     access): 'admin'+ — matches the tier already used for reference-data
--     and organization/source management, keeping routine user personal
--     data out of reach of editor/reviewer accounts that don't need it.
--   - job_notifications/job_posts/job_state_scope(_states)/job_age_rules/
--     job_relaxations/job_status_requirements/job_gender_rules/
--     job_experience_rules/job_qualification_requirements/job_documents
--     write access: 'editor'+, matching the tier DATABASE.md states
--     explicitly for the rule-tables row; SELECT-regardless-of-status:
--     'reviewer'+, since reviewing job_imports requires being able to read
--     not-yet-published job content. DATABASE.md §11 already states that
--     *which* transitions are legal (e.g. only admin-tier work can move a
--     job to 'published') is enforced at the application layer, not by
--     RLS/DB constraints — so RLS granting editor+ raw UPDATE access here,
--     including to the status column, is consistent with that division of
--     responsibility, not a bypass of it.
--   - job_statuses and category_aliases are reference data not spelled out
--     as their own row in DATABASE.md §26's table; treated identically to
--     their sibling reference tables (categories/states/etc.): public
--     SELECT, 'admin'+ write.
-- These interpretations are reported in the Phase 2 final report rather than
-- silently asserted as the unambiguous letter of the spec.

-- ============================================================================
-- profiles
-- ============================================================================
alter table public.profiles enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_admin(auth.uid(), 'admin'));

-- ============================================================================
-- user_qualifications
-- ============================================================================
alter table public.user_qualifications enable row level security;

create policy user_qualifications_all_own on public.user_qualifications
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy user_qualifications_select_admin on public.user_qualifications
  for select to authenticated
  using (public.is_admin(auth.uid(), 'admin'));

-- ============================================================================
-- profile_statuses
-- ============================================================================
alter table public.profile_statuses enable row level security;

create policy profile_statuses_all_own on public.profile_statuses
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy profile_statuses_select_admin on public.profile_statuses
  for select to authenticated
  using (public.is_admin(auth.uid(), 'admin'));

-- ============================================================================
-- saved_jobs — no admin access needed (DATABASE.md §26)
-- ============================================================================
alter table public.saved_jobs enable row level security;

create policy saved_jobs_all_own on public.saved_jobs
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ============================================================================
-- Reference data: categories, category_aliases, statuses, states,
-- education_levels, qualifications, job_statuses — public SELECT, admin+ CRUD
-- ============================================================================
alter table public.categories enable row level security;
alter table public.category_aliases enable row level security;
alter table public.statuses enable row level security;
alter table public.states enable row level security;
alter table public.education_levels enable row level security;
alter table public.qualifications enable row level security;
alter table public.job_statuses enable row level security;

create policy categories_select_public on public.categories
  for select to anon, authenticated using (true);
create policy categories_write_admin on public.categories
  for all to authenticated
  using (public.is_admin(auth.uid(), 'admin'))
  with check (public.is_admin(auth.uid(), 'admin'));

create policy category_aliases_select_public on public.category_aliases
  for select to anon, authenticated using (true);
create policy category_aliases_write_admin on public.category_aliases
  for all to authenticated
  using (public.is_admin(auth.uid(), 'admin'))
  with check (public.is_admin(auth.uid(), 'admin'));

create policy statuses_select_public on public.statuses
  for select to anon, authenticated using (true);
create policy statuses_write_admin on public.statuses
  for all to authenticated
  using (public.is_admin(auth.uid(), 'admin'))
  with check (public.is_admin(auth.uid(), 'admin'));

create policy states_select_public on public.states
  for select to anon, authenticated using (true);
create policy states_write_admin on public.states
  for all to authenticated
  using (public.is_admin(auth.uid(), 'admin'))
  with check (public.is_admin(auth.uid(), 'admin'));

create policy education_levels_select_public on public.education_levels
  for select to anon, authenticated using (true);
create policy education_levels_write_admin on public.education_levels
  for all to authenticated
  using (public.is_admin(auth.uid(), 'admin'))
  with check (public.is_admin(auth.uid(), 'admin'));

create policy qualifications_select_public on public.qualifications
  for select to anon, authenticated using (true);
create policy qualifications_write_admin on public.qualifications
  for all to authenticated
  using (public.is_admin(auth.uid(), 'admin'))
  with check (public.is_admin(auth.uid(), 'admin'));

create policy job_statuses_select_public on public.job_statuses
  for select to anon, authenticated using (true);
create policy job_statuses_write_admin on public.job_statuses
  for all to authenticated
  using (public.is_admin(auth.uid(), 'admin'))
  with check (public.is_admin(auth.uid(), 'admin'));

-- ============================================================================
-- organizations, departments, job_sources — public SELECT, admin+ CRUD
-- ============================================================================
alter table public.organizations enable row level security;
alter table public.departments enable row level security;
alter table public.job_sources enable row level security;

create policy organizations_select_public on public.organizations
  for select to anon, authenticated using (true);
create policy organizations_write_admin on public.organizations
  for all to authenticated
  using (public.is_admin(auth.uid(), 'admin'))
  with check (public.is_admin(auth.uid(), 'admin'));

create policy departments_select_public on public.departments
  for select to anon, authenticated using (true);
create policy departments_write_admin on public.departments
  for all to authenticated
  using (public.is_admin(auth.uid(), 'admin'))
  with check (public.is_admin(auth.uid(), 'admin'));

create policy job_sources_select_public on public.job_sources
  for select to anon, authenticated using (true);
create policy job_sources_write_admin on public.job_sources
  for all to authenticated
  using (public.is_admin(auth.uid(), 'admin'))
  with check (public.is_admin(auth.uid(), 'admin'));

-- ============================================================================
-- job_notifications / job_posts — public SELECT only where published;
-- reviewer+ SELECT regardless of status; editor+ CRUD.
-- ============================================================================
alter table public.job_notifications enable row level security;
alter table public.job_posts enable row level security;

create policy job_notifications_select_published on public.job_notifications
  for select to anon, authenticated
  using (status = 'published');

create policy job_notifications_select_reviewer on public.job_notifications
  for select to authenticated
  using (public.is_admin(auth.uid(), 'reviewer'));

create policy job_notifications_write_editor on public.job_notifications
  for all to authenticated
  using (public.is_admin(auth.uid(), 'editor'))
  with check (public.is_admin(auth.uid(), 'editor'));

create policy job_posts_select_published on public.job_posts
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.job_notifications jn
      where jn.id = job_posts.job_notification_id
        and jn.status = 'published'
    )
  );

create policy job_posts_select_reviewer on public.job_posts
  for select to authenticated
  using (public.is_admin(auth.uid(), 'reviewer'));

create policy job_posts_write_editor on public.job_posts
  for all to authenticated
  using (public.is_admin(auth.uid(), 'editor'))
  with check (public.is_admin(auth.uid(), 'editor'));

-- ============================================================================
-- Per-post eligibility rule tables and job_documents — public SELECT only
-- via a published job_posts row; reviewer+ SELECT regardless; editor+ CRUD.
-- ============================================================================
alter table public.job_age_rules enable row level security;
alter table public.job_relaxations enable row level security;
alter table public.job_status_requirements enable row level security;
alter table public.job_state_scope enable row level security;
alter table public.job_state_scope_states enable row level security;
alter table public.job_gender_rules enable row level security;
alter table public.job_experience_rules enable row level security;
alter table public.job_qualification_requirements enable row level security;
alter table public.job_documents enable row level security;

create policy job_age_rules_select_published on public.job_age_rules
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.job_posts jp
      join public.job_notifications jn on jn.id = jp.job_notification_id
      where jp.id = job_age_rules.job_post_id and jn.status = 'published'
    )
  );
create policy job_age_rules_select_reviewer on public.job_age_rules
  for select to authenticated using (public.is_admin(auth.uid(), 'reviewer'));
create policy job_age_rules_write_editor on public.job_age_rules
  for all to authenticated
  using (public.is_admin(auth.uid(), 'editor'))
  with check (public.is_admin(auth.uid(), 'editor'));

create policy job_relaxations_select_published on public.job_relaxations
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.job_posts jp
      join public.job_notifications jn on jn.id = jp.job_notification_id
      where jp.id = job_relaxations.job_post_id and jn.status = 'published'
    )
  );
create policy job_relaxations_select_reviewer on public.job_relaxations
  for select to authenticated using (public.is_admin(auth.uid(), 'reviewer'));
create policy job_relaxations_write_editor on public.job_relaxations
  for all to authenticated
  using (public.is_admin(auth.uid(), 'editor'))
  with check (public.is_admin(auth.uid(), 'editor'));

create policy job_status_requirements_select_published on public.job_status_requirements
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.job_posts jp
      join public.job_notifications jn on jn.id = jp.job_notification_id
      where jp.id = job_status_requirements.job_post_id and jn.status = 'published'
    )
  );
create policy job_status_requirements_select_reviewer on public.job_status_requirements
  for select to authenticated using (public.is_admin(auth.uid(), 'reviewer'));
create policy job_status_requirements_write_editor on public.job_status_requirements
  for all to authenticated
  using (public.is_admin(auth.uid(), 'editor'))
  with check (public.is_admin(auth.uid(), 'editor'));

create policy job_state_scope_select_published on public.job_state_scope
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.job_posts jp
      join public.job_notifications jn on jn.id = jp.job_notification_id
      where jp.id = job_state_scope.job_post_id and jn.status = 'published'
    )
  );
create policy job_state_scope_select_reviewer on public.job_state_scope
  for select to authenticated using (public.is_admin(auth.uid(), 'reviewer'));
create policy job_state_scope_write_editor on public.job_state_scope
  for all to authenticated
  using (public.is_admin(auth.uid(), 'editor'))
  with check (public.is_admin(auth.uid(), 'editor'));

create policy job_state_scope_states_select_published on public.job_state_scope_states
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.job_state_scope jss
      join public.job_posts jp on jp.id = jss.job_post_id
      join public.job_notifications jn on jn.id = jp.job_notification_id
      where jss.id = job_state_scope_states.job_state_scope_id and jn.status = 'published'
    )
  );
create policy job_state_scope_states_select_reviewer on public.job_state_scope_states
  for select to authenticated using (public.is_admin(auth.uid(), 'reviewer'));
create policy job_state_scope_states_write_editor on public.job_state_scope_states
  for all to authenticated
  using (public.is_admin(auth.uid(), 'editor'))
  with check (public.is_admin(auth.uid(), 'editor'));

create policy job_gender_rules_select_published on public.job_gender_rules
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.job_posts jp
      join public.job_notifications jn on jn.id = jp.job_notification_id
      where jp.id = job_gender_rules.job_post_id and jn.status = 'published'
    )
  );
create policy job_gender_rules_select_reviewer on public.job_gender_rules
  for select to authenticated using (public.is_admin(auth.uid(), 'reviewer'));
create policy job_gender_rules_write_editor on public.job_gender_rules
  for all to authenticated
  using (public.is_admin(auth.uid(), 'editor'))
  with check (public.is_admin(auth.uid(), 'editor'));

create policy job_experience_rules_select_published on public.job_experience_rules
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.job_posts jp
      join public.job_notifications jn on jn.id = jp.job_notification_id
      where jp.id = job_experience_rules.job_post_id and jn.status = 'published'
    )
  );
create policy job_experience_rules_select_reviewer on public.job_experience_rules
  for select to authenticated using (public.is_admin(auth.uid(), 'reviewer'));
create policy job_experience_rules_write_editor on public.job_experience_rules
  for all to authenticated
  using (public.is_admin(auth.uid(), 'editor'))
  with check (public.is_admin(auth.uid(), 'editor'));

create policy job_qualification_requirements_select_published on public.job_qualification_requirements
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.job_posts jp
      join public.job_notifications jn on jn.id = jp.job_notification_id
      where jp.id = job_qualification_requirements.job_post_id and jn.status = 'published'
    )
  );
create policy job_qualification_requirements_select_reviewer on public.job_qualification_requirements
  for select to authenticated using (public.is_admin(auth.uid(), 'reviewer'));
create policy job_qualification_requirements_write_editor on public.job_qualification_requirements
  for all to authenticated
  using (public.is_admin(auth.uid(), 'editor'))
  with check (public.is_admin(auth.uid(), 'editor'));

create policy job_documents_select_published on public.job_documents
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.job_notifications jn
      where jn.id = job_documents.job_notification_id and jn.status = 'published'
    )
  );
create policy job_documents_select_reviewer on public.job_documents
  for select to authenticated using (public.is_admin(auth.uid(), 'reviewer'));
create policy job_documents_write_editor on public.job_documents
  for all to authenticated
  using (public.is_admin(auth.uid(), 'editor'))
  with check (public.is_admin(auth.uid(), 'editor'));

-- ============================================================================
-- job_history — SELECT for reviewer+ (all admin roles); no INSERT/UPDATE/
-- DELETE policy for any application role at all. Rows are written only via
-- the service-role client, which bypasses RLS entirely (SECURITY.md §6, §21).
-- ============================================================================
alter table public.job_history enable row level security;

create policy job_history_select_reviewer on public.job_history
  for select to authenticated using (public.is_admin(auth.uid(), 'reviewer'));

-- ============================================================================
-- job_imports — SELECT/UPDATE for reviewer+; no INSERT/DELETE policy for any
-- application role (ingestion writes go through the service-role client).
-- ============================================================================
alter table public.job_imports enable row level security;

create policy job_imports_select_reviewer on public.job_imports
  for select to authenticated using (public.is_admin(auth.uid(), 'reviewer'));

create policy job_imports_update_reviewer on public.job_imports
  for update to authenticated
  using (public.is_admin(auth.uid(), 'reviewer'))
  with check (public.is_admin(auth.uid(), 'reviewer'));

-- ============================================================================
-- admin_roles / admin_role_assignments — SELECT admin+; write super_admin
-- only. No user, including the row's own user_id, can read their own
-- assignment directly — role checks happen server-side (DATABASE.md §26).
-- ============================================================================
alter table public.admin_roles enable row level security;
alter table public.admin_role_assignments enable row level security;

create policy admin_roles_select_admin on public.admin_roles
  for select to authenticated using (public.is_admin(auth.uid(), 'admin'));
create policy admin_roles_write_super_admin on public.admin_roles
  for all to authenticated
  using (public.is_admin(auth.uid(), 'super_admin'))
  with check (public.is_admin(auth.uid(), 'super_admin'));

create policy admin_role_assignments_select_admin on public.admin_role_assignments
  for select to authenticated using (public.is_admin(auth.uid(), 'admin'));
create policy admin_role_assignments_write_super_admin on public.admin_role_assignments
  for all to authenticated
  using (public.is_admin(auth.uid(), 'super_admin'))
  with check (public.is_admin(auth.uid(), 'super_admin'));

-- ============================================================================
-- audit_logs — SELECT admin+; no INSERT/UPDATE/DELETE policy for any
-- application role (written only via the service-role client).
-- ============================================================================
alter table public.audit_logs enable row level security;

create policy audit_logs_select_admin on public.audit_logs
  for select to authenticated using (public.is_admin(auth.uid(), 'admin'));
