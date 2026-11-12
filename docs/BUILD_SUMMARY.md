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

## 9. Known gaps / not built

- Phase 14/15: production deployment and verification (needs real Vercel + production Supabase credentials).
- Notifications/alerts (post-MVP per PRD).
- Admin data-quality warnings (missing application URL, stale source, conflicting dates).
- AI-approve flow creates only notification + primary post + age rule; relaxations, qualifications, state, gender and experience rules are finished by hand in the rules editor.
- No live end-to-end ingestion run against a real notice URL has been done through the UI.
- Playwright E2E not re-run since the UI redesign.
- Dashboard/search scan the 50 most recent notifications (bounded by design for MVP scale).
- Nothing has been committed to git yet.
