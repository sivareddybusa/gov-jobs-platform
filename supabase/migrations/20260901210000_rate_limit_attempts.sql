-- Phase 12: security hardening.
-- SECURITY.md §16 (Rate Limiting / Abuse Prevention) — a coarse,
-- endpoint-category-based limiter backed by Postgres (the one store
-- consistently shared across every server instance/serverless invocation,
-- unlike an in-process in-memory counter, which would not work correctly
-- once deployed to Vercel's serverless model). No new external service
-- (e.g. Redis) is introduced — TECH_STACK.md/ARCHITECTURE.md make no such
-- infrastructure decision, so this stays within the existing stack per
-- CLAUDE.md's "avoid unnecessary dependencies".
--
-- This table is written/read exclusively through the service-role client
-- (lib/rate-limit.ts) — same no-RLS-policy-for-any-role posture as
-- audit_logs/job_history (DATABASE.md §21/§25): nothing about rate-limit
-- state should be readable or writable by a normal authenticated or
-- anonymous request, since that state is itself part of the platform's
-- abuse defenses.
create table public.rate_limit_attempts (
  id uuid primary key default gen_random_uuid(),
  bucket_key text not null,
  attempted_at timestamptz not null default now()
);
comment on table public.rate_limit_attempts is 'Coarse rate-limit attempt log, keyed by an endpoint-category+identity bucket key (SECURITY.md §16). Service-role write/read only.';

-- Supports the "count attempts for this key within the last N seconds"
-- query pattern efficiently.
create index rate_limit_attempts_bucket_key_attempted_at_idx
  on public.rate_limit_attempts (bucket_key, attempted_at desc);

alter table public.rate_limit_attempts enable row level security;
-- Deliberately no policies: no role (anon, authenticated, or otherwise)
-- gets any access. Only the service-role client (which bypasses RLS by
-- design, SECURITY.md §8) can read or write this table.
