# Architecture

**Project:** Government Jobs Eligibility and Discovery Platform
**Status:** Authoritative — this document is the application architecture specification. It
describes how the stack in [TECH_STACK.md](./TECH_STACK.md) is organized into layers, module
boundaries, and data flow. If code conflicts with this document, that is a conflict to stop and
resolve, not something to silently work around (CLAUDE.md).
**Related documents:** [PRD.md](./PRD.md) (unchanged by this document), [DATABASE.md](./DATABASE.md)
(unchanged — this document does not alter schema), [ELIGIBILITY_ENGINE.md](./ELIGIBILITY_ENGINE.md)
(unchanged — this document does not alter eligibility rules), [SECURITY.md](./SECURITY.md)
(referenced, not duplicated, per this document's Security Architecture section)

---

## High-Level Architecture

```
Browser
  ↓
Next.js application  (Server Components, Server Actions, Route Handlers)
  ↓
Server / application layer  (services, domain logic, validation, authorization)
  ↓
Supabase (PostgreSQL, Auth, Row Level Security, Storage)
```

External integrations, called only from the server/application layer, never from the browser:

```
Server / application layer
  ├──→ Anthropic (AI document extraction — server-only, ELIGIBILITY_ENGINE.md/SECURITY.md §12)
  └──→ Government websites / documents (job ingestion pipeline — fetches official sources,
        SECURITY.md §10 SSRF protections apply)
```

There is no separate backend service — Next.js's own server runtime (Server Components, Server
Actions, Route Handlers) *is* the application/server layer. This is a **modular monolith**
(DATABASE.md §36, this document's own Scalability section) — internal module boundaries are
enforced by code organization and import discipline, not by network boundaries between services.

---

## Layer Responsibilities

| Layer | Responsibility | Must not |
|---|---|---|
| **app/ (UI, routing)** | Page composition, layout, routing, calling Server Actions/reading Server Component data, rendering. | Contain business logic, direct database queries, or authorization decisions. |
| **components/** | Presentational/reusable UI (shadcn/ui-based once installed). Props in, JSX out. | Fetch data itself, make authorization decisions, know about Supabase. |
| **features/** | Feature-scoped composition — wires together UI, a feature's Server Actions, and domain/service calls for one product area (e.g. profile, jobs, saved-jobs, admin) once that area is built. | Duplicate logic that belongs in `domain/` or `services/`; become a dumping ground for unrelated code. |
| **services/ (application layer)** | Orchestrates a use case: calls domain logic, calls data access, calls integrations, in the right order, inside a transaction/consistency boundary where needed. This is where a Server Action's actual implementation lives. | Contain pure business rules itself (that's `domain/`'s job) or raw SQL/query-builder calls (that's `db/`'s job) — a service coordinates, it doesn't compute or query directly. |
| **domain/** | Pure business/domain logic — most importantly the eligibility engine (ELIGIBILITY_ENGINE.md). Deterministic, framework-independent, unit-testable in isolation. | Import React, Next.js, the Supabase client, `fetch`, `cookies()`, or any browser/HTTP API — see **Domain Boundary** below. |
| **db/ (data access)** | Typed query/repository functions wrapping Supabase client calls for one table/aggregate at a time (e.g. `getProfile`, `listPublishedJobPosts`). The only place Supabase query-builder calls are written. | Contain business rules (that's `domain/`) or be called directly from a UI component (must go through `services/`). |
| **lib/** | Cross-cutting technical utilities with no product meaning of their own: environment validation (`lib/env.client.ts`/`lib/env.server.ts`), the Supabase client factories (`lib/supabase/*`), generic helpers. | Accumulate product/business logic — if a "util" starts encoding a business rule, it belongs in `domain/` instead. |
| **supabase/** | Supabase CLI project: migrations, config, seed data. Infrastructure-as-code for the database, not application code. | Contain application TypeScript. |
| **tests/** | Cross-cutting test setup (`tests/setup.ts`) and tests that don't colocate naturally with a single module. Most tests should colocate with the code they test as the codebase grows (e.g. `domain/eligibility/*.test.ts`); `tests/` is not meant to become the only place tests live. | — |
| **docs/** | Specification documents (this file included) — the source of truth code must conform to. | Contain application code. |

Each layer exists because it has a distinct responsibility a neighboring layer doesn't — this list is deliberately short. No layer is created merely to mirror a textbook n-tier diagram; `features/`, `services/`, `domain/`, and `db/` are not yet populated as of Phase 1 (see **Directory Structure**) because nothing has needed them yet, and they will be created alongside the first real code that does.

---

## Domain Boundary

**Eligibility logic belongs entirely in `domain/` and must be independent of:**
- React (no components, hooks, or JSX)
- Next.js (no Server Actions, Route Handlers, `next/*` imports)
- The Supabase client (no `@supabase/supabase-js`/`@supabase/ssr` imports)
- HTTP (no `fetch`, no request/response objects)
- Browser APIs (no `window`, `document`, `localStorage`, etc.)

The eligibility engine (ELIGIBILITY_ENGINE.md) takes plain data in — a user profile shape, a job post's rule data, a cutoff date — and returns plain data out (`eligible`/`not_eligible`/`needs_verification` plus per-dimension reasons, per ELIGIBILITY_ENGINE.md §2/§15). It does not fetch its own inputs and does not know where they came from. This is what makes ELIGIBILITY_ENGINE.md's requirement that the engine be **deterministic and testable** actually achievable: a pure function of plain data can be unit-tested with hand-constructed fixtures, with no database, no HTTP server, and no rendering involved (ELIGIBILITY_ENGINE.md §16 — write tests before changing complex eligibility logic, CLAUDE.md).

The `services/` layer is what bridges this boundary: an application service (e.g. `evaluateEligibilityForUser`) calls `db/` to load the authoritative profile and job rule data, calls the pure `domain/` eligibility function with that data, and returns the result — the domain function itself never touches `db/`, `services/`, or anything above them. Dependencies point one direction only: `app/`/`components/`/`features/` → `services/` → `domain/` and `db/`. `domain/` depends on nothing above it.

This boundary is also what SECURITY.md §13 depends on: because eligibility computation has no access to the browser or the request at all (only to the plain data a service handed it), there is no code path by which a client-supplied value could influence a computed eligibility result — the domain function simply has no way to see the raw request.

---

## Data Access

- **Browser-safe access** (`lib/supabase/client.ts`) uses only the public anon key and is subject to Row Level Security for everything it does — this is the client a Client Component would use for something like `saved_jobs`, and it can never see or modify data RLS wouldn't otherwise allow it to (DATABASE.md §26).
- **Privileged server access** (`lib/supabase/server.ts`) is the per-request, session-scoped client used from Server Components and Server Actions — still the anon key, still RLS-scoped, but running server-side with access to the user's session cookie (via `@supabase/ssr`). This is the default client for "do something as the current authenticated user."
- **Service-role access** (`lib/supabase/admin.ts`) bypasses RLS entirely and is **server-only** — enforced at build time by the `server-only` package import, not just by convention (SECURITY.md §8). It exists for the narrow set of operations that legitimately need to act outside a specific user's row scope (system-initiated `job_history`/`audit_logs` writes, the profile-bootstrap trigger's supporting function, scheduled ingestion jobs) and nowhere else. As of this document, nothing calls it yet.
- **Database queries do not leak into UI components.** A component (in `app/` or `components/`) never imports `lib/supabase/*` or issues a query-builder call directly — it receives data already fetched by a Server Component's own data-loading (which itself calls into `db/`/`services/`) or via props. This keeps every query in one auditable place (`db/`) rather than scattered across the component tree, which is also what makes SECURITY.md §28's "test RLS against the real database" tractable — there's a small, known set of query functions to test, not an unbounded set of ad hoc component-level queries.

---

## Authentication / Authorization Flow

```
Browser
  → authenticated session (Supabase Auth, cookie-based via @supabase/ssr, refreshed on every
    request by proxy.ts / lib/supabase/middleware.ts)
  → server authorization (a Server Action or Server Component re-derives "who is this" from
    the session server-side, then checks role/ownership before doing anything — SECURITY.md §5)
  → database / RLS (the query itself is additionally constrained by the RLS policy for that
    table, regardless of what the application layer already checked — SECURITY.md §6)
```

Every request re-authenticates and re-authorizes; nothing about a previous request's outcome is cached as a standing grant. **Client-side role checks are UX only, never a security boundary** — hiding an "Admin" link from a non-admin user's navigation is a convenience so they don't click into a page that will reject them; it is not what actually prevents the access. The corresponding server-side check (step 2 above) and the RLS policy (step 3) are what actually enforce it, and both must independently agree to allow an action — this is the same two-layer requirement SECURITY.md §5 already states, restated here as the concrete request path it applies to.

No authentication UI, route protection, or admin authorization code exists yet as of this document (Phase 1 bootstrap only built the session-refresh plumbing) — this section describes the flow the next implementation phase must follow, not something already built.

---

## Job Ingestion Architecture

Future pipeline (PRD.md §17–§18, ARCHITECTURE.md's original brief, DATABASE.md §22, SECURITY.md §11–§12) — not yet implemented:

```
Government source
  → fetch/download          (server-side, SSRF-protected per SECURITY.md §10; recorded in
                              job_imports, DATABASE.md §22)
  → document processing     (text extraction only — never executes document content,
                              SECURITY.md §11)
  → AI extraction            (Anthropic call, server-only — produces a candidate structured
                              extraction; untrusted output, SECURITY.md §12)
  → schema validation        (Zod — structurally invalid output rejected)
  → business validation      (implausible-but-schema-valid values rejected, e.g. min_age >
                              max_age)
  → review                   (admin/reviewer confirmation where required — PRD.md §17;
                              is_confident/parse_note or verification_status recorded,
                              DATABASE.md §7/§13–§18)
  → structured job/post/rules (written into job_notifications/job_posts and the job_* rule
                              tables — DATABASE.md §10, §12–§18 — only after the above)
  → publish                  (an explicit, role-gated status transition — DATABASE.md §11,
                              SECURITY.md §7 — never automatic)
```

**AI remains outside the final eligibility decision at every point in this pipeline** — it produces candidate structured *rules*, which the deterministic eligibility engine (`domain/`, above) later evaluates against a user's profile. There is no path from "AI extraction" directly to "eligibility result," and no path from "AI extraction" directly to "published," per ELIGIBILITY_ENGINE.md §1 and SECURITY.md §12.

---

## Eligibility Architecture

```
Profile (from db/, via profiles/profile_statuses/user_qualifications)
  +
JobPost (from db/, via job_posts/job_notifications)
  +
Rules (from db/, via job_age_rules/job_relaxations/job_status_requirements/
       job_state_scope(_states)/job_gender_rules/job_experience_rules/
       job_qualification_requirements)
  ↓
Eligibility Domain Service  (domain/ — pure, deterministic, framework-independent;
                              implements ELIGIBILITY_ENGINE.md's six-dimension AND
                              evaluation and precedence rules)
  ↓
EligibilityResult  (eligible | not_eligible | needs_verification, plus the full
                    per-dimension explanation — ELIGIBILITY_ENGINE.md §2, §15)
```

**Eligibility is calculated dynamically for MVP** — every evaluation independently loads the current profile and current job rules and recomputes from scratch; no result is persisted as a source of truth (DATABASE.md §19, ELIGIBILITY_ENGINE.md §16). If a persisted cache is introduced post-MVP purely for performance, it sits *outside* the domain service (a `services/`-layer concern, invalidated on the triggers DATABASE.md §19 already specifies) — the domain service itself never gains a notion of "cached" vs. "fresh," it always just computes.

None of this is implemented yet as of this document — `domain/` does not yet exist in the repository (see **Directory Structure**). This section is the specification the eligibility-engine implementation phase must follow.

---

## Directory Structure

```
app/            UI + routing (Next.js App Router) — exists (Phase 1: layout, home page)
components/     Reusable presentational UI (shadcn/ui once installed) — not yet created
features/       Feature-scoped composition (profile, jobs, saved-jobs, admin, ...) — not yet created
services/       Application/service layer — orchestrates use cases — not yet created
domain/         Pure business logic, most importantly the eligibility engine — not yet created
db/             Typed data-access/repository functions over Supabase — not yet created
lib/            Cross-cutting technical utilities (env, Supabase client factories) — exists
supabase/       Supabase CLI project: config, migrations, seed — exists (config only, no schema yet)
tests/          Cross-cutting test setup + tests that don't colocate elsewhere — exists
docs/           Specification documents — exists
```

**Directories are introduced when their first real implementation requires them, not pre-scaffolded empty.** `features/`, `services/`, `domain/`, and `db/` do not exist yet in this repository because no feature, service, domain rule, or query function has been built yet — creating them empty now would be exactly the "fake abstraction with no real responsibility" this document's own Layer Responsibilities section warns against. Each is created by the phase that first needs it: the eligibility-engine phase creates `domain/eligibility/` (and, alongside it, `db/` functions to load profiles/job rules); the first product feature (e.g. profile setup) creates `features/profile/`, its `services/` functions, and its `db/` functions together; the first shared UI need creates `components/`.

---

## Server / Client Boundary

| Runs in | Code | Enforcement |
|---|---|---|
| **Browser** | Client Components (`"use client"`), the browser Supabase client (`lib/supabase/client.ts`) | Marked explicitly with `"use client"`; imports `client-only` to make a server-side import of that specific module a build error where the distinction matters. |
| **Server** (Server Components, Server Actions, Route Handlers, middleware/proxy) | Server Components (default — no directive needed), Server Actions (`"use server"`), the server-scoped and admin Supabase clients (`lib/supabase/server.ts`, `lib/supabase/admin.ts`), `lib/env.server.ts`, all future `domain/`, `services/`, `db/` code | `lib/env.server.ts` and `lib/supabase/admin.ts` both import the `server-only` package, making an accidental client-side import a build-time failure, not a runtime leak (SECURITY.md §8). |
| **Background jobs** (future — scheduled ingestion, expiry transitions) | Runs via Vercel Cron / Supabase scheduled functions (TECH_STACK.md), calling the same `services/`/`domain/`/`db/` code the request path uses — not a separate code path with its own logic | Same server-only boundary as above; a background job is just another server-side caller of the application layer, never a special case with looser rules. |

**Explicitly server-only, by name, as of this document:** `lib/env.server.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`, `lib/supabase/middleware.ts`, `proxy.ts`. Everything that will live in `domain/`, `services/`, and `db/` is server-only by construction (none of it is ever imported into a Client Component) even though those directories don't yet exist to annotate.

---

## Error Handling

| Error category | Origin | Handling |
|---|---|---|
| **Domain errors** | `domain/` — e.g. an eligibility evaluation encountering a rule shape it doesn't model (ELIGIBILITY_ENGINE.md §14) | Represented as part of the domain function's normal return value where the domain itself already has a defined "I don't know" state (`needs_verification`) — not thrown as exceptions for expected, modeled situations. A thrown error from `domain/` means something genuinely unexpected happened, not a normal ambiguous-input case. |
| **Validation errors** | Zod parse failures at any input boundary (§Backend) | Caught at the boundary, translated into a field-level error response the caller (a form, a Server Action's caller) can act on — never a raw Zod error object or stack trace surfaced to the end user. |
| **Authorization errors** | RLS denial, or an explicit server-side role/ownership check failing (§Authentication/Authorization Flow) | Translated into a generic 401/403-equivalent response; the specific reason (which check failed, whose data was involved) is logged server-side (SECURITY.md §20), never included in the user-facing message. |
| **Infrastructure errors** | Supabase unavailable, AI provider unavailable, network failure to a government source | Caught at the `services/`/integration boundary, logged with full detail server-side, surfaced to the user as a generic "something went wrong, try again" state — never a stack trace, connection string, or provider error message (SECURITY.md §25). |

**No internal error detail is ever exposed to users** — database internals, stack traces, secrets, internal IDs, raw queries, or infrastructure details. This is restated here as an architectural boundary (every layer above must catch and translate before returning to `app/`) rather than duplicating SECURITY.md §25's full rationale.

---

## Security Architecture

Full security requirements, threat model, and controls are defined in [SECURITY.md](./SECURITY.md) and are not duplicated here. The major architectural boundaries that implement them:

- **RLS** — every application table has Row Level Security enabled (DATABASE.md §26, SECURITY.md §6); this is enforced at the database layer regardless of which application code path issued the query, which is why it's listed as an *architectural* boundary and not merely a database-configuration detail.
- **Server authorization** — the two-layer pattern in §Authentication/Authorization Flow (server-side check + RLS) is structural, not optional per-endpoint discretion.
- **Validation** — the Zod-at-every-boundary pattern in §Backend is where SECURITY.md §9's input-validation requirement is architecturally located.
- **Secret isolation** — the `server-only`-enforced boundary in §Server / Client Boundary is where SECURITY.md §8/§19's secret-handling requirements are architecturally located.
- **External-input isolation** — the ingestion pipeline's fetch/document-processing/AI stages (§Job Ingestion Architecture) are where SECURITY.md §10–§12's SSRF, document-safety, and AI-untrusted-input requirements are architecturally located; nothing from an external source reaches a `db/` write without passing through all of them first.

---

## Scalability

**Intended MVP architecture:** the modular monolith described above, deployed as a single Next.js application on Vercel against a single Supabase project — matching DATABASE.md §33's scalability plan (thousands of users, then hundreds of thousands, before any structural change is needed) and TECH_STACK.md's deployment decision.

**Likely future evolution, only if actually needed:**
- A materialized view or dedicated search system if Postgres full-text search stops being sufficient (DATABASE.md §33 already anticipates this).
- Read replicas for public job-browsing traffic if write contention becomes visible.
- Splitting the ingestion pipeline into its own scheduled/background execution context if it grows heavy enough to affect the main application's request latency — still calling the same `services/`/`domain/`/`db/` code, not a rewrite.

**Not introduced prematurely:** microservices, an event bus, Kubernetes, or additional message queues beyond what Vercel Cron/Supabase's scheduled functions already provide. None of these are justified by this product's actual scale, and DATABASE.md §33/§36 already made the equivalent decision at the schema level (no premature partitioning, no premature persisted-cache complexity) — this document applies the same judgment at the application-architecture level. The modular monolith's internal layer boundaries (§Layer Responsibilities) are what make a future split possible *if* ever needed, without requiring one now.

---

## Architecture Rules

1. **UI cannot make authorization decisions.** A component may hide a control for UX reasons; it never decides whether an action is actually allowed.
2. **Domain logic cannot depend on framework code.** `domain/` never imports React, Next.js, the Supabase client, or any browser/HTTP API (§Domain Boundary).
3. **Server-only secrets never enter client bundles.** Enforced by the `server-only` package import wherever a secret-touching module exists, not merely by convention.
4. **AI output is never authoritative without validation/review.** No code path connects an AI extraction result directly to a published job, a `job_*` rule table write, or an eligibility result (§Job Ingestion Architecture).
5. **Database access follows the defined data-access boundary.** Query-builder calls live in `db/` (or, until it exists, are not written ad hoc in components) — never issued directly from `app/`/`components/`/`features/`.
6. **Eligibility is deterministic.** The eligibility domain service is a pure function of the profile/job-rule data it's given; it never queries, never calls an AI provider, and returns the same result for the same input every time (ELIGIBILITY_ENGINE.md §1).
7. **RLS is always enabled for application tables.** No table is ever shipped with RLS disabled "temporarily" (DATABASE.md §26, SECURITY.md §6, §32).

---

## Consistency Check

Verified against PRD.md, DATABASE.md, ELIGIBILITY_ENGINE.md, and SECURITY.md. This document introduces no new product requirements, no schema changes, and no eligibility-rule changes — it only describes how the already-specified system is organized into code. No conflicts were found; every cross-reference above (table names, status values, RLS policy shape, pipeline stages) matches what those four documents already define.

One item noted, not as a conflict but as something this document cannot resolve on its own: **TECH_STACK.md's Runtime Requirements section states Node ≥22 is required by the installed `@supabase/supabase-js` version**, while the environment this repository was bootstrapped in runs Node 20.19.4. This is a real, currently-tolerated mismatch (everything built and ran successfully in Phase 1) rather than an invented one — it is documented in TECH_STACK.md rather than silently resolved by pinning an older, less current dependency version here.
