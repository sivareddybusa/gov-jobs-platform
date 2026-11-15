-- Phase 3: exam syllabus (subject -> chapter -> topic), fetched automatically
-- from official pages (services/syllabus/sync.ts). Nobody types syllabus data:
-- rows are written only by the service role through replace_exam_syllabus().

create table public.syllabus_nodes (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  parent_id uuid references public.syllabus_nodes (id) on delete cascade,
  -- 1 = subject, 2 = chapter, 3 = topic
  depth smallint not null check (depth between 1 and 3),
  name text not null check (char_length(name) between 1 and 300),
  position integer not null check (position >= 0),
  -- The official page the node was read from (must be an official host).
  source_url text not null check (public.is_official_exam_url(source_url)),
  created_at timestamptz not null default now(),
  constraint syllabus_nodes_root_is_subject check ((parent_id is null) = (depth = 1))
);
comment on table public.syllabus_nodes is 'Auto-fetched exam syllabus tree. Candidates read it only for published, verified exams.';
create index syllabus_nodes_exam_idx on public.syllabus_nodes (exam_id, depth, position);
create index syllabus_nodes_parent_idx on public.syllabus_nodes (parent_id);
create unique index syllabus_nodes_unique_name
  on public.syllabus_nodes (exam_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

-- A child must belong to the same exam as its parent and sit exactly one level down.
create function public.check_syllabus_node_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p record;
begin
  if new.parent_id is not null then
    select exam_id, depth into p from public.syllabus_nodes where id = new.parent_id;
    if p.exam_id is distinct from new.exam_id or p.depth + 1 <> new.depth then
      raise exception 'Syllabus node must sit one level below a parent of the same exam';
    end if;
  end if;
  return new;
end;
$$;
create trigger syllabus_nodes_check_parent
  before insert or update on public.syllabus_nodes
  for each row execute function public.check_syllabus_node_parent();

alter table public.syllabus_nodes enable row level security;

create policy syllabus_nodes_select_published on public.syllabus_nodes
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.exams e
      where e.id = exam_id
        and e.status = 'published'
        and e.verification_status in ('admin_verified', 'auto_verified')
    )
  );
create policy syllabus_nodes_select_reviewer on public.syllabus_nodes
  for select to authenticated
  using (public.is_admin(auth.uid(), 'reviewer'));
-- No INSERT/UPDATE/DELETE policy: only the service role (sync) writes.

-- Per-exam sync state, shown on the admin monitor.
alter table public.exams
  add column syllabus_synced_at timestamptz,
  add column syllabus_status text check (syllabus_status is null or syllabus_status in ('ok', 'not_found', 'failed')),
  add column syllabus_source_url text check (syllabus_source_url is null or public.is_official_exam_url(syllabus_source_url)),
  add column syllabus_error text check (syllabus_error is null or char_length(syllabus_error) <= 500);

-- Atomically replaces an exam's whole syllabus. p_tree is
-- [{"name":..,"children":[{"name":..,"children":[{"name":..}]}]}] (max 3 levels).
create function public.replace_exam_syllabus(p_exam_id uuid, p_source_url text, p_tree jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s jsonb; c jsonb; t jsonb;
  s_id uuid; c_id uuid;
  s_pos int := 0; c_pos int; t_pos int;
  total int := 0;
begin
  if not exists (select 1 from public.exams where id = p_exam_id) then
    raise exception 'Exam not found';
  end if;
  if jsonb_typeof(p_tree) <> 'array' then
    raise exception 'Syllabus tree must be an array';
  end if;

  delete from public.syllabus_nodes where exam_id = p_exam_id;

  for s in select * from jsonb_array_elements(p_tree) loop
    insert into public.syllabus_nodes (exam_id, parent_id, depth, name, position, source_url)
      values (p_exam_id, null, 1, s->>'name', s_pos, p_source_url) returning id into s_id;
    total := total + 1; s_pos := s_pos + 1; c_pos := 0;
    for c in select * from jsonb_array_elements(coalesce(s->'children', '[]'::jsonb)) loop
      insert into public.syllabus_nodes (exam_id, parent_id, depth, name, position, source_url)
        values (p_exam_id, s_id, 2, c->>'name', c_pos, p_source_url) returning id into c_id;
      total := total + 1; c_pos := c_pos + 1; t_pos := 0;
      for t in select * from jsonb_array_elements(coalesce(c->'children', '[]'::jsonb)) loop
        insert into public.syllabus_nodes (exam_id, parent_id, depth, name, position, source_url)
          values (p_exam_id, c_id, 3, t->>'name', t_pos, p_source_url);
        total := total + 1; t_pos := t_pos + 1;
      end loop;
    end loop;
  end loop;

  update public.exams
    set syllabus_synced_at = now(), syllabus_status = 'ok', syllabus_source_url = p_source_url,
        syllabus_error = null
    where id = p_exam_id;
  return total;
end;
$$;
revoke all on function public.replace_exam_syllabus(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.replace_exam_syllabus(uuid, text, jsonb) to service_role;
