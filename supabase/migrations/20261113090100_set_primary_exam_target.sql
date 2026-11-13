-- Atomically switch a candidate's primary exam target. SECURITY INVOKER, so
-- user_exam_targets RLS applies: a caller can only ever touch their own rows.
create function public.set_primary_exam_target(target_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_exam_targets
    where id = target_id and profile_id = auth.uid() and status = 'active'
  ) then
    raise exception 'Target not found or not active';
  end if;

  update public.user_exam_targets
     set is_primary = false, updated_at = now()
   where profile_id = auth.uid() and is_primary and id <> target_id;

  update public.user_exam_targets
     set is_primary = true, updated_at = now()
   where id = target_id and profile_id = auth.uid();
end;
$$;
revoke all on function public.set_primary_exam_target(uuid) from public;
grant execute on function public.set_primary_exam_target(uuid) to authenticated;
