-- Phase 2: database foundation.
-- §3 (auth.users <-> profiles relationship), §4 (profiles), §5A (profile_statuses),
-- §7 (user_qualifications).

-- §4 Profiles — strict 1:1 with auth.users. Eligibility-relevant fields are all
-- nullable: PRD.md §10.2 requires missing data to produce "needs verification",
-- never a blocked signup or a fabricated default (DATABASE.md §4).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  date_of_birth date,
  category_id uuid references public.categories (id),
  state_id uuid references public.states (id),
  domicile_state_id uuid references public.states (id),
  gender text check (gender in ('male', 'female', 'other', 'prefer_not_to_say')),
  education_level_id uuid references public.education_levels (id),
  experience_years numeric(4, 1) check (experience_years is null or experience_years >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'User eligibility-relevant profile data, 1:1 with auth.users (DATABASE.md §4).';

-- §3 User creation: a bare profile row is created automatically on signup via
-- a security definer function + trigger, so the client never inserts into
-- profiles directly and profile bootstrapping is atomic with auth signup.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- §5A profile_statuses — zero or more independent special statuses per
-- profile, composable with (not a substitute for) category_id.
create table public.profile_statuses (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status_id uuid not null references public.statuses (id),
  created_at timestamptz not null default now(),
  unique (profile_id, status_id)
);
comment on table public.profile_statuses is 'A user''s held special status(es), independent of profiles.category_id (DATABASE.md §5A).';

-- §7 user_qualifications — a user may hold more than one qualification.
create table public.user_qualifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  qualification_id uuid not null references public.qualifications (id),
  institution text,
  year_completed smallint,
  created_at timestamptz not null default now(),
  unique (profile_id, qualification_id)
);
comment on table public.user_qualifications is 'A user''s held qualification(s) (DATABASE.md §7).';
