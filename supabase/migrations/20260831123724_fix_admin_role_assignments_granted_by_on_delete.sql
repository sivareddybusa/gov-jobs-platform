-- Phase 2.1: resolve a genuine schema/documentation inconsistency.
--
-- admin_role_assignments.granted_by was left at the default NO ACTION
-- ON DELETE behavior, unlike the other three actor-reference columns
-- (job_history.changed_by, job_imports.reviewed_by, audit_logs.actor_id),
-- which already use ON DELETE SET NULL so historical/audit records survive
-- account deletion (DATABASE.md §21/§22/§25, SECURITY.md §23). This was a
-- flagged gap, not a deliberate design choice — see DATABASE.md §24, updated
-- alongside this migration.
--
-- The column was already nullable (DATABASE.md §24: "granted_by uuid,
-- nullable, FK -> auth.users(id)"), so only the ON DELETE action changes
-- here; no data migration is needed.

alter table public.admin_role_assignments
  drop constraint admin_role_assignments_granted_by_fkey;

alter table public.admin_role_assignments
  add constraint admin_role_assignments_granted_by_fkey
  foreign key (granted_by) references auth.users (id) on delete set null;
