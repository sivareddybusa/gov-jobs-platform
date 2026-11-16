-- Phase 5: practice question bank.
-- Two origins, both written only by the service role (nobody types questions):
--   official_paper : read verbatim from an official sample/model paper (exam_materials link)
--   ai_generated   : written by the active LLM for a syllabus topic, published only after
--                    automatic checks AND an independent second-pass solve agree on the answer.
-- The correct answer lives in a separate table candidates cannot read. They learn it only by
-- answering, through answer_practice_question() (security definer), which records the attempt.

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  origin text not null check (origin in ('official_paper', 'ai_generated')),
  -- Copied from the syllabus at generation time (text, not an FK: a syllabus re-sync replaces its nodes).
  subject text check (subject is null or char_length(subject) between 1 and 300),
  topic text check (topic is null or char_length(topic) between 1 and 300),
  prompt text not null check (char_length(prompt) between 10 and 2000),
  -- Exactly four non-empty answer options.
  options jsonb not null check (
    jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4
  ),
  difficulty text check (difficulty is null or difficulty in ('easy', 'medium', 'hard')),
  -- official_paper: the official document the question was read from.
  source_url text check (source_url is null or (public.is_official_exam_url(source_url) and char_length(source_url) <= 2000)),
  -- source_verbatim = question, options and key literally present in the official source;
  -- ai_cross_checked = a second independent solve agreed with the stated answer.
  verification text check (verification in ('source_verbatim', 'ai_cross_checked')),
  status text not null default 'published' check (status in ('published', 'hidden')),
  content_hash text not null,
  created_at timestamptz not null default now(),
  constraint questions_official_needs_source check (origin <> 'official_paper' or source_url is not null),
  constraint questions_origin_verification check (
    (origin = 'official_paper' and verification = 'source_verbatim')
    or (origin = 'ai_generated' and verification = 'ai_cross_checked')
  ),
  constraint questions_unique_content unique (exam_id, content_hash)
);
comment on table public.questions is 'Practice questions. Contains NO answers; see question_answers. Written only by the service role.';
create index questions_exam_idx on public.questions (exam_id, status, subject);
create index questions_topic_idx on public.questions (exam_id, lower(topic));

create table public.question_answers (
  question_id uuid primary key references public.questions (id) on delete cascade,
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text check (explanation is null or char_length(explanation) <= 4000)
);
comment on table public.question_answers is 'Correct answers. No candidate policy: only answer_practice_question() reveals one, after an attempt is recorded.';

create table public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  selected_index smallint not null check (selected_index between 0 and 3),
  is_correct boolean not null,
  created_at timestamptz not null default now()
);
create index practice_attempts_user_idx on public.practice_attempts (user_id, created_at desc);
create index practice_attempts_question_idx on public.practice_attempts (question_id);

-- Per-exam generation state and per-material extraction state, shown on the admin monitor.
alter table public.exams
  add column questions_synced_at timestamptz,
  add column questions_error text check (questions_error is null or char_length(questions_error) <= 500);
alter table public.exam_materials
  add column questions_extracted_at timestamptz;

alter table public.questions enable row level security;
alter table public.question_answers enable row level security;
alter table public.practice_attempts enable row level security;

-- Candidates read published questions of published, verified exams.
create policy questions_select_published on public.questions
  for select to authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.exams e
      where e.id = exam_id
        and e.status = 'published'
        and e.verification_status in ('admin_verified', 'auto_verified')
    )
  );
-- Reviewers can read everything (to monitor / take down).
create policy questions_select_reviewer on public.questions
  for select to authenticated
  using (public.is_admin(auth.uid(), 'reviewer'));
-- question_answers: reviewers only (admins can audit a question); candidates get none.
create policy question_answers_select_reviewer on public.question_answers
  for select to authenticated
  using (public.is_admin(auth.uid(), 'reviewer'));
-- A user reads only their own attempts; nobody inserts directly (the RPC does).
create policy practice_attempts_select_own on public.practice_attempts
  for select to authenticated
  using (user_id = auth.uid());
-- No INSERT/UPDATE/DELETE policy on any of the three: the service role writes questions,
-- and answer_practice_question() writes attempts.

-- Records one attempt and reveals the correct answer. The answer is returned only after the
-- attempt exists, and only for a published question of a published, verified exam.
create function public.answer_practice_question(p_question_id uuid, p_selected integer)
returns table (correct_index integer, is_correct boolean, explanation text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_correct smallint;
  v_expl text;
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  if p_selected is null or p_selected < 0 or p_selected > 3 then
    raise exception 'Invalid option';
  end if;
  select a.correct_index, a.explanation into v_correct, v_expl
  from public.questions q
  join public.question_answers a on a.question_id = q.id
  join public.exams e on e.id = q.exam_id
  where q.id = p_question_id
    and q.status = 'published'
    and e.status = 'published'
    and e.verification_status in ('admin_verified', 'auto_verified');
  if v_correct is null then
    raise exception 'Question not available';
  end if;
  insert into public.practice_attempts (user_id, question_id, selected_index, is_correct)
    values (v_user, p_question_id, p_selected, p_selected = v_correct);
  return query select v_correct::integer, (p_selected = v_correct), v_expl;
end;
$$;
revoke all on function public.answer_practice_question(uuid, integer) from public, anon;
grant execute on function public.answer_practice_question(uuid, integer) to authenticated;

-- Atomic insert of a question and its answer (service role only). Returns null when the same
-- content already exists for the exam (idempotent re-runs).
create function public.add_question(
  p_exam_id uuid, p_origin text, p_prompt text, p_options jsonb, p_verification text,
  p_content_hash text, p_correct integer,
  p_subject text default null, p_topic text default null, p_difficulty text default null,
  p_source_url text default null, p_explanation text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.questions (exam_id, origin, subject, topic, prompt, options, difficulty,
                                source_url, verification, content_hash)
    values (p_exam_id, p_origin, p_subject, p_topic, p_prompt, p_options, p_difficulty,
            p_source_url, p_verification, p_content_hash)
    on conflict (exam_id, content_hash) do nothing
    returning id into v_id;
  if v_id is null then
    return null;
  end if;
  insert into public.question_answers (question_id, correct_index, explanation)
    values (v_id, p_correct, p_explanation);
  return v_id;
end;
$$;
revoke all on function public.add_question(uuid, text, text, jsonb, text, text, integer, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.add_question(uuid, text, text, jsonb, text, text, integer, text, text, text, text, text) to service_role;
