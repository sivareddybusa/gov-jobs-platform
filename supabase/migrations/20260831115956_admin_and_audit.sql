-- Phase 2: database foundation.
-- §24 (admin_role_assignments), §25 (audit_logs).

-- §24 admin_role_assignments — role-based admin authorization, never a
-- client-trusted is_admin boolean on profiles.
--
-- Note: DATABASE.md §24 specifies granted_by as a plain nullable FK to
-- auth.users(id) with no ON DELETE clause documented, unlike changed_by/
-- reviewed_by/actor_id (§21/§22/§25), which were explicitly revised to
-- ON DELETE SET NULL. Implemented literally as specified (default NO ACTION
-- behavior) rather than silently applying the same SET NULL pattern here;
-- see the Phase 2 final report for this flagged as worth resolving in
-- DATABASE.md.
create table public.admin_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role_code text not null references public.admin_roles (code),
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now(),
  unique (user_id, role_code)
);
comment on table public.admin_role_assignments is 'Which users hold which admin role (DATABASE.md §24).';

-- §25 audit_logs — actor_id is ON DELETE SET NULL: the event must outlive
-- the account (DATABASE.md §25, closing the gap SECURITY.md §23 identified).
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  entity_table text not null,
  entity_id uuid not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);
comment on table public.audit_logs is 'System-wide security/compliance event trail; actor_id is ON DELETE SET NULL (DATABASE.md §25).';
