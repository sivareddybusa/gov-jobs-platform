-- Phase 2: database foundation.
-- Enables the extension gen_random_uuid() depends on (DATABASE.md §2: UUID
-- primary keys via gen_random_uuid() for every application table).
-- Supabase projects normally already have this enabled; declared explicitly
-- so this migration set is reproducible on a genuinely fresh database.
create extension if not exists pgcrypto with schema extensions;
