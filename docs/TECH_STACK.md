# Technology Stack

**Project:** Government Jobs Eligibility and Discovery Platform
**Status:** Authoritative — this document is the technology decision record. It reflects what is
actually configured in the repository (`package.json`, `tsconfig.json`, `next.config.ts`,
`eslint.config.mjs`, `vitest.config.ts`, `supabase/config.toml`), not a proposal. A technology
substitution (a different framework, database, auth system, ORM, UI library, or deployment
platform) requires updating this document first — code must not silently drift from it, per
[CLAUDE.md](../CLAUDE.md).
**Related documents:** [PRD.md](./PRD.md), [ARCHITECTURE.md](./ARCHITECTURE.md) (how this stack is
structured into layers), [DATABASE.md](./DATABASE.md), [ELIGIBILITY_ENGINE.md](./ELIGIBILITY_ENGINE.md),
[SECURITY.md](./SECURITY.md)

---

## Application

| Concern | Decision |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript, strict mode, no exceptions without a documented reason (§Quality) |
| Runtime | Node.js — see **Runtime Requirements** below |
| Package manager | npm (`package-lock.json` committed). Not specified by the original product brief; chosen as the simplest option with no additional tooling, per this document's dependency principles. |

## Frontend

| Concern | Decision |
|---|---|
| Rendering approach | Server Components by default (Next.js App Router); Client Components only where interactivity genuinely requires them (forms, saved-job toggles, etc. — none exist yet as of Phase 1). Static pages are prerendered where they have no per-request/per-user data. |
| UI approach | Plain React + Tailwind utility classes for now. **shadcn/ui is the intended component library** (copy-in Radix-based components) but is not yet installed — no UI component exists yet to justify pulling in its Radix/CVA dependency tree. It is installed incrementally, one component at a time via its CLI, when the first feature that needs it is built. |
| Styling | Tailwind CSS v4 (`@tailwindcss/postcss`, CSS-first configuration via `@import "tailwindcss"` in `app/globals.css` — no `tailwind.config.js` needed for v4's default setup). |
| Forms | **React Hook Form** is the intended forms library (matches the product's registration/profile/admin forms) but is not yet installed — no form exists yet in the codebase. Added when the first form ships. |
| Client state strategy | None adopted, and none is expected to be needed for the MVP feature set described in PRD.md. Server state is fetched via Server Components/server actions per request; any genuinely client-local UI state (an open/closed dropdown, a form's in-progress values) uses plain React state (`useState`/`useReducer`) — no global client state library (Redux/Zustand/Jotai) is justified until a concrete cross-component client-state need appears, per the dependency principles below. |

## Backend

| Concern | Decision |
|---|---|
| Next.js/server architecture | Next.js App Router server-side: Server Components for reads, Server Actions for mutations, Route Handlers (`app/api/**/route.ts`) only where a non-form-submission HTTP endpoint is genuinely needed (e.g. a webhook, if one is ever added). No separate backend service/process — the "backend" is Next.js's own server runtime plus Supabase, per ARCHITECTURE.md's modular-monolith decision. |
| API / server actions approach | Server Actions are the default mutation path (colocated with the feature that owns them, called directly from Server/Client Components — no hand-rolled REST layer for internal app mutations). Every Server Action re-validates input and re-checks authorization itself (SECURITY.md §15) — it never trusts that a caller already did so. |
| Validation | **Zod**, used at every external-input boundary (form submissions, Server Action arguments, Route Handler bodies, environment variables — see `lib/env.client.ts`/`lib/env.server.ts`). TypeScript types are never treated as runtime validation (CLAUDE.md, SECURITY.md §9). |

## Database

| Concern | Decision |
|---|---|
| Database | PostgreSQL, hosted and managed via **Supabase**. Schema is fully specified in [DATABASE.md](./DATABASE.md) — not yet implemented as migrations (deferred to the database-implementation phase). |
| Database access approach | Supabase's client libraries (`@supabase/supabase-js` via `@supabase/ssr`'s browser/server wrappers) using PostgREST under the hood — not a separate ORM (Prisma/Drizzle/TypeORM). Row Level Security (DATABASE.md §26) is the actual authorization boundary for data access, not application-layer query filtering alone (SECURITY.md §6, §14). Query-builder methods (`.eq()`, `.select()`, `.in()`, etc.) are used instead of hand-written SQL/RPC wherever they can express the need, per SECURITY.md §14's parameterized-query requirement. |
| Migrations | Supabase CLI migrations (`supabase/migrations/*.sql`), applied via `supabase db reset`/`supabase migration up` locally and through CI for staging/production — never manual schema edits in any environment (CLAUDE.md, DATABASE.md §34). No migrations exist yet; `supabase/config.toml` is scaffolded and ready for the first migration. |

## Authentication

| Concern | Decision |
|---|---|
| Provider | **Supabase Auth** — email/password, email verification, password reset (PRD.md §6). No password, hash, or session token is ever stored in an application table (DATABASE.md §3). |
| Session handling | `@supabase/ssr` cookie-based sessions. `lib/supabase/client.ts` (browser, anon key), `lib/supabase/server.ts` (per-request server client, still anon-key/RLS-scoped), and `proxy.ts` + `lib/supabase/middleware.ts` (session-cookie refresh on every request) are already in place from Phase 1. No route-protection/redirect logic exists yet — that is a product feature for a later phase, not infrastructure. |
| Admin authorization | Role-based, resolved server-side against `admin_role_assignments` (DATABASE.md §24) — never a client-supplied claim (SECURITY.md §5, §7). Not yet implemented; the data model and rules are specified, the enforcement code is a later phase. |

## AI

| Concern | Decision |
|---|---|
| Provider | **Google Gemini** (Phase 7 decision, superseding the earlier Anthropic placeholder below), for the document-extraction pipeline (PRD.md §17, SECURITY.md §12). Switched from the originally-planned Anthropic/Claude when a working Anthropic key wasn't available during implementation and the user explicitly chose to switch providers rather than block on it — a deliberate, confirmed decision, not a silent substitution. Model: `gemini-2.5-flash` (Google's current fast/cost-efficient model, appropriate for a structured single-purpose extraction call, not a long-form reasoning task). |
| Integration approach | Server-only. The `GEMINI_API_KEY` environment variable is validated only in `lib/env.server.ts` (`server-only`-guarded, never client-reachable). Uses the official `@google/genai` SDK with `responseSchema`-constrained JSON output (Gemini's native structured-output mechanism, the equivalent role `zodOutputFormat` played in the original Anthropic-based design) — `lib/ingestion/ai-extract.ts`. |
| Output handling | AI output is never authoritative on its own — it is untrusted input that must pass schema validation → business validation → confidence/verification → human review before it can affect any published data or `job_*` rule table (ELIGIBILITY_ENGINE.md §1, SECURITY.md §12). AI never computes a final eligibility result. |

## Storage

| Concern | Decision |
|---|---|
| File storage | **Supabase Storage**, for government advertisement documents/PDFs (DATABASE.md §23) once document ingestion is built. Not yet configured — no bucket, no policy — since no document-handling feature exists yet in this phase. When configured, bucket access will mirror the publication-status gating already defined for job data (SECURITY.md §11), not a separate ad hoc policy. |

## Testing

| Concern | Decision |
|---|---|
| Unit tests | **Vitest** (`vitest.config.ts`, jsdom environment). Runs via `npm test` / `npm run test:watch`. |
| Component tests | **React Testing Library** (`@testing-library/react`, `@testing-library/jest-dom`), layered on Vitest + jsdom — already proven working by the Phase 1 smoke test (`tests/smoke.test.tsx`), which renders a real component and asserts on its output. |
| Integration tests | Vitest, extended to exercise Server Actions and (where feasible) real Supabase-backed RLS behavior (SECURITY.md §28 explicitly requires RLS to be tested against a real database, not mocked) — no integration tests exist yet; this is the intended tool, not a separate framework. |
| End-to-end tests | **Playwright** is the intended E2E tool (named in the original product brief) but is not yet installed — no user-facing flow exists yet to test end-to-end. Installed when the first real flow (registration/login) ships, since installing it now (browser binary downloads, ~500MB) for zero E2E tests would be an unnecessary dependency per this document's dependency principles. |

## Quality

| Concern | Decision |
|---|---|
| TypeScript strictness | `strict: true` plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noPropertyAccessFromIndexSignature`, `exactOptionalPropertyTypes`, `forceConsistentCasingInFileNames` (`tsconfig.json`). `any` and unsafe casts are not used without an inline comment explaining why (CLAUDE.md). |
| Linting | ESLint 9, flat config (`eslint.config.mjs`), using `eslint-config-next`'s native flat exports (`core-web-vitals` + `typescript`) directly — no legacy `.eslintrc`/`FlatCompat` shim. |
| Formatting | Prettier (`.prettierrc.json`), `npm run format` / `format:check`. Markdown files are excluded from Prettier's scope (`.prettierignore`) so the hand-authored `docs/*.md` tables/structure aren't reflowed. |
| Build | `next build` (Turbopack), `npm run typecheck` (`tsc --noEmit`) as a separate, explicit gate — Next's build-time type check is not relied on as the only check. |

## Deployment

| Concern | Decision |
|---|---|
| Platform | **Vercel** (Next.js application) + **Supabase** (managed Postgres/Auth/Storage) — as named in the original product brief; no alternative hosting has been evaluated or is justified for this project's scale (ARCHITECTURE.md §Scalability). |
| Environment strategy | Three environments: local (developer machine + `supabase start` local stack, or a linked dev Supabase project), staging (a dedicated Supabase project, migrations applied via CI before deploy), production (migrations applied via a controlled CI/CD step, never the Supabase dashboard directly) — per DATABASE.md §34. Environment variables are managed through Vercel's and Supabase's own encrypted configuration, never committed (`.env.example` documents the required keys with no real values; SECURITY.md §19). |

---

## Runtime Requirements

**Node.js ≥ 22 (Node 22 LTS preferred).**

This is a hard requirement, not a preference: `@supabase/supabase-js` (the installed version, `^2.109.0` resolving to `2.112.4` at the time of writing) declares `engines.node: ">=22.0.0"`. `package.json`'s own `engines.node` field is set to `>=22` to match. Local development on an older Node version (this repository was bootstrapped on Node 20.19.4, which still installed and ran correctly against the current feature set) should not be relied on going forward — it worked only because no code path in this bootstrap phase yet exercises the parts of `@supabase/supabase-js` that require Node 22's runtime APIs, and that is expected to stop being true as soon as real Supabase calls are added. Upgrade to Node 22 LTS before starting the next implementation phase.

---

## Dependency Principles

- **Avoid unnecessary dependencies.** Every dependency in `package.json` is there because a concrete, already-built piece of the codebase needs it — not because a future feature might. (As of this bootstrap-era paragraph, `react-hook-form`, `shadcn/ui`, `playwright`, and an AI SDK were *decided* but deliberately not yet installed; all have since been added, each by the phase that actually needed it — `shadcn/ui` remains not installed, as this project's UI has stayed plain Tailwind throughout.)
- **Use existing stack choices.** When a new piece of functionality is needed, reach for what's already in this document first (Zod for a new validation need, the existing Supabase client modules for a new query, Vitest for a new test) rather than reaching for a different library that does something similar.
- **Don't introduce alternatives without justification.** Swapping any decision in this document (a different ORM, a different auth provider, a different CSS approach) requires updating this document with the same why/alternatives/trade-offs rigor DATABASE.md and SECURITY.md already use for their own decisions — never a silent substitution in code.
- **Security review for sensitive dependencies.** Any dependency touching authentication, cryptography, input validation/sanitization, or secret handling gets the extra review pass SECURITY.md §26/§27 already requires before it's added — this is not a separate process, it's that process applied to the specific category of dependency where a mistake has outsized impact.
- **Do not add a dependency simply because an AI coding agent recommends it** — restated here from SECURITY.md §26 because this document is exactly where that recommendation would need to be recorded and justified before landing in `package.json`.
