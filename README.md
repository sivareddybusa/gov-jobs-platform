# Government Jobs Eligibility Platform

Project foundation. See `docs/` for the product, architecture, database, eligibility-engine,
and security specifications, and `CLAUDE.md` for the AI-agent development rules that apply
to this repository.

## Stack

Next.js (App Router) + TypeScript (strict) + Tailwind CSS, Supabase (Postgres, Auth, Row
Level Security), Zod for validation, Vitest + React Testing Library for tests. See
`docs/TECH_STACK.md`.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in your own Supabase project values
npm run dev
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run the production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm run format` / `format:check` | Prettier write / check |
| `npm test` / `test:watch` | Vitest |

## Supabase

This repo includes a Supabase CLI project (`supabase/config.toml`), scaffolded but not yet
holding any schema or migrations — the database schema lands in a later phase, following
`docs/DATABASE.md`. Local development against a real Supabase project requires the
[Supabase CLI](https://supabase.com/docs/guides/local-development) and Docker.
