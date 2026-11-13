-- LLM provider credentials, managed by super_admins on /admin/ai-providers.
-- Keys are stored ENCRYPTED (AES-256-GCM, master key only in the server env).
-- RLS is enabled with NO policies: no browser/user session can read or write
-- this table at all; only trusted server code using the service role can, and
-- only behind requireAdminRole("super_admin").

create table public.llm_credentials (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('gemini', 'openai', 'anthropic', 'cloudflare')),
  label text not null check (char_length(label) between 1 and 60),
  encrypted_key text not null,
  key_last4 text not null check (char_length(key_last4) = 4),
  account_id text check (account_id is null or account_id ~ '^[a-fA-F0-9]{32}$'),
  model text not null check (char_length(model) between 1 and 100),
  is_active boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.llm_credentials is 'Encrypted LLM API keys; service-role access only. At most one row is active.';

-- At most one key is "in use" at any time.
create unique index llm_credentials_one_active on public.llm_credentials ((true)) where is_active;

alter table public.llm_credentials enable row level security;
revoke all on public.llm_credentials from anon, authenticated;

-- Atomic switch of the active key.
create function public.set_active_llm_credential(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.llm_credentials where id = p_id) then
    raise exception 'LLM credential not found';
  end if;
  update public.llm_credentials set is_active = false, updated_at = now()
    where is_active and id <> p_id;
  update public.llm_credentials set is_active = true, updated_at = now() where id = p_id;
end;
$$;
revoke all on function public.set_active_llm_credential(uuid) from public, anon, authenticated;
grant execute on function public.set_active_llm_credential(uuid) to service_role;
