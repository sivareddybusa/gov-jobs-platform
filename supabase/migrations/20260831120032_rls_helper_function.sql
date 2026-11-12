-- Phase 2: database foundation.
-- Role-check helper for RLS policies (DATABASE.md §26: "checked through a
-- security definer helper function (e.g. is_admin(auth.uid(), 'editor'))
-- referenced in policies, rather than duplicating the role-check logic
-- across every policy definition").
--
-- security definer lets this function read admin_role_assignments even
-- though ordinary users have no SELECT policy on that table (SECURITY.md §5,
-- §7) — this is the standard, documented pattern for centralizing a role
-- check without granting broad table access. min_role expresses a minimum
-- tier in the fixed hierarchy reviewer < editor < admin < super_admin
-- (DATABASE.md §24).
create function public.is_admin(check_user_id uuid, min_role text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_role_assignments ara
    where ara.user_id = check_user_id
      and (
        (min_role = 'reviewer' and ara.role_code in ('reviewer', 'editor', 'admin', 'super_admin'))
        or (min_role = 'editor' and ara.role_code in ('editor', 'admin', 'super_admin'))
        or (min_role = 'admin' and ara.role_code in ('admin', 'super_admin'))
        or (min_role = 'super_admin' and ara.role_code = 'super_admin')
      )
  );
$$;

comment on function public.is_admin(uuid, text) is
  'Server-side role-check helper for RLS policies. Never trust a client-supplied role claim (CLAUDE.md, SECURITY.md §5).';

revoke all on function public.is_admin(uuid, text) from public;
grant execute on function public.is_admin(uuid, text) to authenticated;
