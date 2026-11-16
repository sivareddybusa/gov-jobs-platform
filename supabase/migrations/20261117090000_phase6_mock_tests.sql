-- Phase 6: timed mock tests with server-side scoring.
-- A candidate starts an attempt (a random snapshot of an exam's published questions), saves
-- answers while the clock runs, and submits. EVERYTHING that matters is decided in the database:
--   * the deadline (expires_at) is set by the server at start; late saves are refused
--   * the questions are shown without answers; correct answers are revealed only after the
--     attempt is finished
--   * the score is computed from question_answers on submit; the client never sends a score
-- Marking is "practice marking" (not an official exam's scheme): marks_correct / marks_wrong are
-- stored on each attempt (defaults +1 / -0.25) so the scheme can change later.

create table public.mock_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exam_id uuid not null references public.exams (id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'expired')),
  question_count smallint not null check (question_count between 5 and 30),
  duration_seconds integer not null check (duration_seconds between 60 and 10800),
  marks_correct numeric(5, 2) not null default 1 check (marks_correct >= 0),
  marks_wrong numeric(5, 2) not null default 0.25 check (marks_wrong >= 0),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  -- Filled on submit.
  correct_count smallint,
  wrong_count smallint,
  unanswered_count smallint,
  score numeric(7, 2),
  constraint mock_attempts_done_has_result check (
    status = 'in_progress' or (submitted_at is not null and score is not null)
  )
);
comment on table public.mock_attempts is 'Mock test attempts. Written only by the mock-test functions; owners read their own.';
create index mock_attempts_user_idx on public.mock_attempts (user_id, started_at desc);
-- At most one running attempt per user per exam.
create unique index mock_attempts_one_running
  on public.mock_attempts (user_id, exam_id) where status = 'in_progress';

create table public.mock_attempt_questions (
  attempt_id uuid not null references public.mock_attempts (id) on delete cascade,
  position smallint not null check (position >= 0),
  question_id uuid not null references public.questions (id) on delete cascade,
  selected_index smallint check (selected_index between 0 and 3),
  answered_at timestamptz,
  primary key (attempt_id, position),
  unique (attempt_id, question_id)
);

alter table public.mock_attempts enable row level security;
alter table public.mock_attempt_questions enable row level security;
create policy mock_attempts_select_own on public.mock_attempts
  for select to authenticated using (user_id = auth.uid());
create policy mock_attempt_questions_select_own on public.mock_attempt_questions
  for select to authenticated
  using (exists (select 1 from public.mock_attempts a where a.id = attempt_id and a.user_id = auth.uid()));
-- No INSERT/UPDATE/DELETE policy: only the functions below write.

-- Scores an attempt and closes it. Internal: not callable by clients.
create function public.finalize_mock_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.mock_attempts%rowtype;
  v_correct int;
  v_wrong int;
  v_unanswered int;
begin
  select * into a from public.mock_attempts where id = p_attempt_id for update;
  if not found or a.status <> 'in_progress' then
    return;
  end if;
  select
    count(*) filter (where q.selected_index is not null and q.selected_index = k.correct_index),
    count(*) filter (where q.selected_index is not null and q.selected_index <> k.correct_index),
    count(*) filter (where q.selected_index is null)
  into v_correct, v_wrong, v_unanswered
  from public.mock_attempt_questions q
  join public.question_answers k on k.question_id = q.question_id
  where q.attempt_id = p_attempt_id;
  update public.mock_attempts set
    status = case when now() > a.expires_at then 'expired' else 'submitted' end,
    submitted_at = least(now(), a.expires_at),
    correct_count = v_correct,
    wrong_count = v_wrong,
    unanswered_count = v_unanswered,
    score = v_correct * a.marks_correct - v_wrong * a.marks_wrong
  where id = p_attempt_id;
end;
$$;
revoke all on function public.finalize_mock_attempt(uuid) from public, anon, authenticated;

-- Starts (or resumes) a mock test. One minute per question.
create function public.start_mock_attempt(p_exam_id uuid, p_count integer default 20)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_available int;
  v_n int;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if p_count is null or p_count < 5 or p_count > 30 then
    raise exception 'A mock test has between 5 and 30 questions';
  end if;
  if not exists (
    select 1 from public.exams
    where id = p_exam_id and status = 'published'
      and verification_status in ('admin_verified', 'auto_verified')
  ) then
    raise exception 'Exam not available';
  end if;

  -- Close a stale one, or resume the running one.
  select id into v_id from public.mock_attempts
    where user_id = v_user and exam_id = p_exam_id and status = 'in_progress';
  if v_id is not null then
    if (select expires_at from public.mock_attempts where id = v_id) > now() then
      return v_id;
    end if;
    perform public.finalize_mock_attempt(v_id);
  end if;

  select count(*) into v_available from public.questions
    where exam_id = p_exam_id and status = 'published';
  v_n := least(p_count, v_available);
  if v_n < 5 then
    raise exception 'Not enough questions yet';
  end if;

  insert into public.mock_attempts (user_id, exam_id, question_count, duration_seconds, expires_at)
    values (v_user, p_exam_id, v_n, v_n * 60, now() + make_interval(secs => v_n * 60))
    returning id into v_id;
  insert into public.mock_attempt_questions (attempt_id, position, question_id)
    select v_id, (row_number() over ())::int - 1, s.id
    from (
      select id from public.questions
      where exam_id = p_exam_id and status = 'published'
      order by random() limit v_n
    ) s;
  return v_id;
end;
$$;
revoke all on function public.start_mock_attempt(uuid, integer) from public, anon;
grant execute on function public.start_mock_attempt(uuid, integer) to authenticated;

-- Saves (or clears, with null) one answer while the clock is running. Returns 'saved', or
-- 'expired' when the deadline has passed: the attempt is then closed and scored, and the answer is
-- NOT stored. (It returns instead of raising so that closing the attempt is not rolled back.)
create function public.save_mock_answer(p_attempt_id uuid, p_question_id uuid, p_selected integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.mock_attempts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_selected is not null and (p_selected < 0 or p_selected > 3) then
    raise exception 'Invalid option';
  end if;
  select * into a from public.mock_attempts where id = p_attempt_id and user_id = auth.uid();
  if not found then
    raise exception 'Attempt not found';
  end if;
  if a.status <> 'in_progress' then
    raise exception 'This test is already finished';
  end if;
  if now() > a.expires_at then
    perform public.finalize_mock_attempt(p_attempt_id);
    return 'expired';
  end if;
  update public.mock_attempt_questions
    set selected_index = p_selected, answered_at = case when p_selected is null then null else now() end
    where attempt_id = p_attempt_id and question_id = p_question_id;
  if not found then
    raise exception 'Question is not part of this attempt';
  end if;
  return 'saved';
end;
$$;
revoke all on function public.save_mock_answer(uuid, uuid, integer) from public, anon;
grant execute on function public.save_mock_answer(uuid, uuid, integer) to authenticated;

-- Submits (or, when the time ran out, closes as expired) and returns the final status. Idempotent.
create function public.submit_mock_attempt(p_attempt_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if not exists (select 1 from public.mock_attempts where id = p_attempt_id and user_id = auth.uid()) then
    raise exception 'Attempt not found';
  end if;
  perform public.finalize_mock_attempt(p_attempt_id);
  select status into v_status from public.mock_attempts where id = p_attempt_id;
  return v_status;
end;
$$;
revoke all on function public.submit_mock_attempt(uuid) from public, anon;
grant execute on function public.submit_mock_attempt(uuid) to authenticated;

-- The attempt's questions. While running: no answers. After it ends: with the correct answer and
-- explanation. Works even if an admin later hides a question (the attempt keeps its snapshot).
create function public.get_mock_questions(p_attempt_id uuid)
returns table (
  question_position integer, question_id uuid, prompt text, options jsonb, subject text,
  topic text, selected_index integer, correct_index integer, explanation text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.mock_attempts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select * into a from public.mock_attempts where id = p_attempt_id and user_id = auth.uid();
  if not found then
    raise exception 'Attempt not found';
  end if;
  if a.status = 'in_progress' and now() > a.expires_at then
    perform public.finalize_mock_attempt(p_attempt_id);
    select * into a from public.mock_attempts where id = p_attempt_id;
  end if;
  return query
    select aq.position::int, q.id, q.prompt, q.options, q.subject, q.topic, aq.selected_index::int,
           case when a.status = 'in_progress' then null else k.correct_index::int end,
           case when a.status = 'in_progress' then null else k.explanation end
    from public.mock_attempt_questions aq
    join public.questions q on q.id = aq.question_id
    join public.question_answers k on k.question_id = q.id
    where aq.attempt_id = p_attempt_id
    order by aq.position;
end;
$$;
revoke all on function public.get_mock_questions(uuid) from public, anon;
grant execute on function public.get_mock_questions(uuid) to authenticated;
