# Government Jobs Eligibility Platform — Current Build Summary

_Snapshot as of 2026-11-12. Detailed per-phase reports live in `docs/PROJECT_STATUS.md`._

## 1. What it is

A web platform that lists Indian government jobs and tells each signed-in user, deterministically and with reasons, whether they are **eligible / not eligible / needs verification** for each post, based on their profile. It is not a government website; every job links to its official notification.

## 2. Tech stack

| Area | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict |
| Styling | Tailwind CSS v4, Inter font (`next/font`), brand indigo palette; no component library |
| Backend | Supabase (Postgres, Auth, Row Level Security), local CLI stack via Docker |
| Validation | Zod v4 |
| AI | Google Gemini (`gemini-2.5-flash`, `@google/genai`) — switched from Anthropic after the Anthropic key failed auth |
| Tests | Vitest (unit + real-DB integration), Playwright (E2E) |
| CI | GitHub Actions: typecheck, lint, format, audit, tests, build |

## 3. Architecture

Modular monolith: `app/` (routes, Server Actions) → `services/` (use cases) → `domain/` (pure logic) + `db/` (queries) → Supabase.

- `domain/eligibility/` — pure, framework-free engine. Six dimensions ANDed: age, special status, state/domicile, gender, experience, qualification. Returns status plus human-readable reasons.
- `services/eligibility/` — builds engine inputs from the DB (batched, 7 queries regardless of post count) and evaluates.
- `services/admin/*` — organizations, sources, job notifications/posts, eligibility rules, roles, AI imports. All writes are audited.
- `lib/ingestion/` — SSRF-safe fetch, PDF/HTML text extraction, Gemini extraction.
- `lib/supabase/` — server/browser/admin clients, middleware (session refresh + nonce CSP).
- RLS is an independent second layer beneath every server-side role check (`is_admin(uid, minRole)`; roles: reviewer < editor < admin < super_admin).

## 4. Features built

**Auth** — register, login, logout, email verification, forgot/reset password, rate-limited login/register/reset.

**User app**
- Onboarding (DOB, category, state, education) and profile editing with qualifications and special statuses (PwBD, ex-serviceman, etc.).
- Dashboard: recommended, latest, closing soon, saved jobs, with eligibility badges.
- Browse/search jobs: keyword, state, organization, eligibility filters; responsive card grid.
- Job detail: per-post eligibility with per-dimension reasons, official advertisement and application links, source info, save/unsave.

**Admin (`/admin`)**
- Organizations and departments, job sources (with official-domain allow-listing).
- Job notifications and posts, a full rules editor per post (age + relaxations, status requirements, state scope, gender, experience, qualification groups), change history.
- Status workflow: discovered → approved → published → expired/archived; official URLs are checked against the source's domain at approve/publish.
- Role management (super_admin).
- **AI imports**: give a source and document URL → fetch → extract text → Gemini extraction → schema and plausibility validation → human review → approve (creates notification, primary post, optional age rule) or reject. Remaining rules are completed in the rules editor.

**UI** — redesigned "clean modern SaaS" system: Card, Badge, PageHeader, Button variants, Field components; dark admin header; responsive layouts.

## 5. Security measures

- Server-only secrets (`server-only` boundary); service-role client used only server-side.
- RLS on all tables; `job_imports`, `audit_logs`, `job_history`, `rate_limit_attempts` have no app-role insert path.
- Nonce-based CSP (all routes dynamic), plus X-Frame-Options, Referrer-Policy, Permissions-Policy, X-Content-Type-Options, production HSTS.
- Rate limiting (DB-backed): login 5/15 min per account and 50 per IP.
- SSRF protection for ingestion: https only, DNS resolution with private/reserved IP blocking (incl. cloud metadata), per-hop redirect re-validation, size and time caps.
- AI treated as untrusted: fixed output schema with no control fields, prompt-injection-resistant prompt, Zod + plausibility checks, mandatory human review, never auto-published.

## 6. Data currently in the local database

Test fixtures from the E2E suite (3 notifications) plus one real notification:

- **IBPS CRP RRBs-XV 2026** — organization IBPS (autonomous body), source `ibps.in` official PDF. Applications 2026-09-01 to 2026-09-21, age as on 2026-09-01.
  - Office Assistant (Multipurpose): 8,183 vacancies, age 18–28
  - Officer Scale-I: 4,256, age 18–30
  - Officer Scale-II: 1,047, age 21–32
  - Officer Scale-III: 220, age 21–40
  - Relaxations: SC/ST +5, OBC +3, PwBD +10; qualification: any bachelor's degree
  - Vacancy figures come from secondary reports; the PDF's vacancy annexure was not machine-readable. State scope and gender rules are not modelled for it.

## 7. Verification status (last full run)

Typecheck, lint, Prettier, production build: pass. Vitest: 236/236 (including 32 SSRF tests, 5 text-extraction tests, 2 real-Gemini tests, and `job_imports` RLS boundary tests). Playwright E2E: 18/18 at the last full run (before the UI redesign and Phase 7).

## 8. Running locally

```bash
npx supabase start          # Postgres/Auth/API on 127.0.0.1:54321, mail inbox on :54324
npm run dev -- -p 3001      # app on http://localhost:3001
```

Port 3000 is used by another container on this machine, but Supabase's `site_url` is `http://localhost:3000`, so confirmation-email links must have `3000` changed to `3001`. Requires `.env.local` with Supabase keys and `GEMINI_API_KEY` for ingestion.

## 8b. Expansion Phase 1 (added after this snapshot)

Candidate sidebar shell, 13 new routes, preparation first-run flow, Settings (language + notification preferences), and the Application Tracker (`job_applications` + trigger-written status history). Details in `docs/PROJECT_STATUS.md`. The exam catalog and everything downstream is Phase 2+.

## 8c. Expansion Phase 2

Verified exam catalog (admin create/verify/publish, DB-enforced), candidate exam discovery, primary/secondary preparation targets with preserved history, and an optional external-search provider for admins. Details in `docs/PROJECT_STATUS.md` and `docs/GOOGLE_SEARCH_INTEGRATION.md`.

## 9. Known gaps / not built

- Phase 14/15: production deployment and verification (needs real Vercel + production Supabase credentials).
- Notifications/alerts (post-MVP per PRD).
- Admin data-quality warnings (missing application URL, stale source, conflicting dates).
- AI-approve flow creates only notification + primary post + age rule; relaxations, qualifications, state, gender and experience rules are finished by hand in the rules editor.
- No live end-to-end ingestion run against a real notice URL has been done through the UI.
- Playwright E2E not re-run since the UI redesign.
- Dashboard/search scan the 50 most recent notifications (bounded by design for MVP scale).
- Git: initial commit made at the start of Expansion Phase 1.


## Phase 2 revision — automatic catalog (owner decision)

Admin authoring of exams was removed. Exams are now fetched from Google + official pages, extracted with Gemini, validated, and **auto-published only from official domains** (`gov.in`, `nic.in`, `ac.in`, `ibps.in`), enforced by DB constraint `exams_auto_verified_requires_official_host`. Admin Exams is a read-only monitor (sync status/errors, unpublish/restore/block, "Sync from Google now"). Migration `20261113100000_exam_catalog_auto_sync.sql`; pipeline `services/exams/*`; details and trust rules in `docs/GOOGLE_SEARCH_INTEGRATION.md`. Live Google/Gemini runs are untested (no credentials/billing).


## Switchable LLM provider page

`/admin/ai-providers` (super_admin only): save encrypted API keys for Gemini, OpenAI, Anthropic and Cloudflare Workers AI and choose the one "In use". Job import and exam sync now go through `lib/llm`. Migration `20261113110000_llm_credentials.sql`; see `docs/AI_PROVIDERS.md`. Needs `APP_ENCRYPTION_KEY` in the server env. Live provider calls untested.


## Phase 3 — Syllabus (auto-fetched)

Exam → subject → chapter → topic tree stored in `syllabus_nodes` (migration `20261114090000_phase3_syllabus.sql`), fetched from official pages by `services/syllabus/sync.ts` with a name-must-appear-on-page guard, replaced atomically by `replace_exam_syllabus()`, shown on the candidate exam page with its official source, and monitored on Admin → Exams ("Fetch syllabi now"). See `docs/SYLLABUS.md` for the pipeline, trust rules and honest limits (many official notices publish only the exam pattern).


## Phase 4 — Official study materials (links)

`exam_materials` (migration `20261115090000_phase4_exam_materials.sql`): official document links per exam, collected without AI by `services/materials/sync.ts` (own-site + official host + edition match + rule-based classification), shown on the exam page and the Study Materials page, monitored on Admin → Exams ("Collect materials now"). No files are hosted; Storage is reserved for future user files. See `docs/MATERIALS.md`.


## Phase 5 — Practice question bank

`questions` / `question_answers` / `practice_attempts` (migration `20261116090000_phase5_questions.sql`), `services/questions/sync.ts` (official-paper import + cross-checked AI generation), candidate Practice pages with instant feedback, Admin → Questions monitor. Answers are never sent before an attempt is recorded. See `docs/QUESTIONS.md`.
