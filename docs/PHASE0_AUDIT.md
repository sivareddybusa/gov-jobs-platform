# Phase 0 — Project Audit (Exam Preparation Platform expansion)

_Date: 2026-11-12. Read-only audit; the only change made to the repo while auditing is the temporary `supabase/config.toml` edit described in §1._

## 1. Baseline status

| Check | Result |
|---|---|
| `tsc --noEmit` | Pass |
| ESLint | Pass |
| Prettier | Pass |
| `next build` | Pass (all routes dynamic) |
| Vitest | **234 / 236**. The 2 failures are the real-Gemini tests: the API returns **403 PERMISSION_DENIED, "free tier not available for this project, set up billing"**. Not a code bug, but it blocks every live AI feature until billing or a different key is in place. |
| Playwright E2E | **18 / 18** after two environment fixes (below) |
| Git | Branch `main` has **no commits**; everything is untracked. |

Environment issues found while getting the E2E baseline (not code regressions):
1. Port 3000 is held by an unrelated `open-webui` container. Supabase's `site_url` pointed at 3000, so confirmation-email links went to the wrong app. I set `site_url` to `http://localhost:3001` and added `http://localhost:3001/**` to `additional_redirect_urls` in [supabase/config.toml](../supabase/config.toml), then restarted Supabase. **This edit is still in place** (the original is backed up in the session scratchpad); revert it if port 3000 is free for you.
2. Registration is rate limited at 30/hour per IP, and two full E2E runs exhausted it. I cleared the local `rate_limit_attempts` rows. E2E needs `E2E_BASE_URL=http://localhost:3001`.

## 2. Current architecture assessment

Modular monolith, `app/` → `services/` → `domain/` + `db/` → Supabase. The layering is followed consistently, which makes the expansion straightforward.

- **Routes:** `(auth)` 5 pages, `(protected)` dashboard / jobs / jobs/[slug] / onboarding / profile, `(admin)` organizations, sources, jobs (+posts, rules), imports, roles.
- **Layouts:** `(protected)/layout.tsx` is a sticky top bar, not a sidebar. `(admin)/admin/layout.tsx` is a dark top bar with a horizontal nav. Both call `requireUser` / `requireAdminRole` (defence in depth behind `proxy.ts`).
- **Domain:** `domain/eligibility/*` is pure TypeScript with 61 tests. The new assessment/scoring logic should follow the same pattern in `domain/assessment/`.
- **Data access:** `db/*` for user-scoped queries, `db/admin/*` for admin, `lib/supabase/admin.ts` (service role) only where RLS deliberately has no app-role write path.
- **Cross-cutting:** `lib/audit.ts` (audit_logs + job_history), `lib/rate-limit.ts` (DB-backed buckets), Zod schemas in `lib/validation/*`, `ServiceResult` / `ActionState` conventions, nonce CSP in middleware with the root layout forced dynamic.
- **AI:** one module, [lib/ingestion/ai-extract.ts](../lib/ingestion/ai-extract.ts), using `@google/genai` with a hand-written shape-only response schema (Gemini rejects heavily constrained schemas) and full Zod validation afterwards. No general AI service yet.
- **UI kit:** Button, Field (Input/Select), FormMessage, SubmitButton, Card, Badge, PageHeader, JobCard, EligibilityBadge. No Table, Tabs, Dialog, Skeleton, Progress, Sidebar, EmptyState or Chart components.
- **Storage:** Supabase Storage is enabled in config but unused (no buckets, no policies).
- **Tests:** Vitest unit + real-DB integration (RLS invariants, batch eligibility, rate limit), Playwright for auth, profile, dashboard, admin.

## 3. Existing pieces to reuse

| Need | Reuse |
|---|---|
| Role model and publish gating | `admin_roles`, `admin_role_assignments`, `is_admin(uid, min_role)`, `requireAdminRole`, the Phase 6 draft → approved → published pattern |
| Audit / history | `audit_logs`, `recordAuditEvent`, `job_history` pattern |
| Rate limits (AI, search) | `checkRateLimit(bucketKey, max, windowSec)` |
| Organizations and sources | `organizations`, `job_sources` (exams link to these) |
| Reference data | `states`, `education_levels`, `qualifications`, `categories` |
| Job-to-exam bridge | `job_notifications` already carry org + posts; exams can link to organizations |
| AI client and Zod-after-parse pattern | `ai-extract.ts` approach |
| Admin form patterns | `app/(admin)/admin/jobs/*` (actions, forms, status actions) |
| SSRF-safe fetch | `lib/ingestion/safe-fetch.ts` for validating externally discovered exam URLs |
| Existing candidate pages | `/dashboard`, `/jobs`, `/jobs/[slug]`, saved jobs, `/profile` map to the sidebar items |

## 4. Gaps against the new requirements

- No sidebar shell, no `/settings`, no Application Tracker, no notifications, no analytics, no preparation anything.
- Sidebar items that need new data: **Application Tracker** (needs a `job_applications` table that is not in your entity list), **Latest Notifications** (can be a view over published `job_notifications`), **Eligible Jobs** (a filtered view of the existing eligibility evaluation).
- No generic Table, Tabs, Dialog, Skeleton, Progress, Chart components.
- Gemini access currently fails (billing). No Google Search credentials exist.

## 5. Database changes required

Existing conventions to keep: `uuid` PKs, `timestamptz` created/updated, RLS enabled on every table, `is_admin(...)`-based admin policies, own-row policies via `auth.uid()`, no app-role insert on audit tables.

New tables, grouped (names adapted to the existing style):

- **Catalog:** `exams` (org FK, category, status, verification_status, source), `exam_sources`, `exam_subjects`, `syllabus_topics` (self-referencing tree for chapter → topic → subtopic, or a `level` column).
- **User targets and progress:** `user_exam_targets` (unique user+exam, `is_primary`, `status` active/paused/removed so history is kept), `topic_progress`, `user_bookmarks`.
- **Content:** `study_resources` (storage path or external URL, content status draft → pending_review → approved → published → archived, created_by/reviewed_by), `content_reviews`.
- **Assessment:** `question_banks`, `questions`, `question_options`, `mock_tests`, `mock_test_questions`, `test_attempts`, `test_answers`.
- **Planning:** `study_plans`, `study_plan_tasks`.
- **AI:** `ai_generations` (provenance: model, prompt kind, source resource ids, status, reviewer).
- **Notifications:** `user_notifications`, plus a preferences table.
- **Extra (not in your list, recommended):** `job_applications` (Application Tracker), `exam_external_candidates` or a `pending_verification` verification status on `exams` for Google-discovered exams, `content_reports` (users reporting incorrect AI content), `paper_sources` fields on resources for previous-year-paper authenticity.

Security-critical design points:
- **Correct answers never reach the browser before submission.** `questions` / `question_options` would store the answer in a column the candidate role cannot select (column-level privilege or a separate `question_answers` table with no candidate policy). Candidates read questions through a view/RPC that omits the answer; scoring happens in a server-side function using the service role or a `security definer` RPC.
- **Test attempts:** server stores `started_at` and `expires_at`; submission is rejected after expiry plus a small grace window; `unique (attempt_id, question_id)` on answers and a status check make resubmission idempotent.
- **Storage:** private buckets only, signed URLs minted server-side after an authorization check; upload restrictions (type, size) enforced server-side.
- **Candidates see only `published` + `approved` content;** user-owned tables get `*_all_own`-style policies; AI-generated rows carry `is_ai_generated` and never default to published.

All changes go through new timestamped migrations; `lib/supabase/types.ts` regenerated with `npm run db:types`; `docs/DATABASE_SCHEMA.md` documents relationships.

## 6. New routes and components (proposed)

Following the suggested layout, without moving existing modules:

- **Candidate** (inside `(protected)` with a new sidebar layout): `/dashboard` (add the two prominent entry cards), `/jobs` (Search), `/jobs/eligible`, `/jobs/latest`, `/jobs/saved`, `/applications`, `/preparation`, `/preparation/exams` (discovery) and `/preparation/exams/[slug]`, `/preparation/[examSlug]` (per-exam dashboard), `/study-plan`, `/study-materials`, `/practice`, `/mock-tests` and `/mock-tests/[id]/attempt`, `/previous-papers`, `/performance`, `/profile`, `/settings`.
- **Admin:** `/admin/exams`, `/admin/exams/[id]/syllabus`, `/admin/study-materials`, `/admin/question-bank`, `/admin/mock-tests`, `/admin/previous-papers`, `/admin/ai-review`, `/admin/preparation-analytics`, `/admin/content-reports`.
- **Services:** `exams`, `preparation`, `syllabus`, `study-plans`, `resources`, `questions`, `mock-tests`, `analytics`, `ai-preparation`, `notifications`. **Domain:** `exams`, `preparation`, `questions`, `assessment` (scoring, negative marking, timer rules; pure and heavily tested). **lib:** `ai/` (shared Gemini client, prompts, Zod output schemas), `search/` (Google Programmable Search client), `storage/` (signed URL helper).
- **Components to add:** Sidebar (responsive, drawer on mobile), Table, Tabs, Dialog, Skeleton, ProgressBar, EmptyState, charts (a small dependency-free SVG set, to honour "avoid unnecessary dependencies"; recharts only if needed later).

Note: `CLAUDE.md` says this Next.js has breaking changes — the relevant guide in `node_modules/next/dist/docs/` must be read before writing new routes, forms or storage handlers.

## 7. Integration requirements

| Integration | Status | Needed |
|---|---|---|
| Gemini | Key present but **403 (billing / free tier unavailable)** | Enable billing, or supply a working key/project. Until then, AI code can be built and unit-tested with a mocked client only; no live success can be claimed. |
| Google Search | **Not configured** | A supported API is the Custom Search JSON API (Programmable Search Engine): needs `GOOGLE_SEARCH_API_KEY` and `GOOGLE_SEARCH_ENGINE_ID` (server-only). Google has been restricting this API to existing customers, so access should be confirmed before building on it. A fallback (internal catalog only) is mandatory per the spec. |
| Supabase Storage | Enabled, unused | Buckets and policies via migration. |
| Notification delivery | Only Supabase Auth SMTP (Mailpit locally) | Phase 11 can ship in-app notifications; email/push delivery needs a provider decision. |

## 8. Risks

1. **Scope:** this is several products; each phase must stay shippable and tested before the next starts.
2. **Gemini billing blocks Phase 8 verification** (and the two existing live AI tests will keep failing meanwhile).
3. **Data authenticity:** exams, syllabus, papers and question banks have no source of truth in the repo. Nothing can be seeded with invented content (CLAUDE.md rule); empty states and admin tooling must be built first, and real content must come from admins or verified public sources.
4. **Copyright** for previous-year papers and study PDFs: uploads need an explicit source/permission field and admin attestation.
5. **Answer-leak and timer-tampering** in the mock-test engine if scoring is not strictly server-side.
6. **Google Search policy/quota** and the risk of treating search results as verified.
7. **Dynamic rendering everywhere** (CSP nonce decision) means no static caching; heavy list pages need pagination and query discipline.
8. **Eligibility N+1 bound** (dashboard scans 50 notifications) will matter more with "Eligible Jobs" as a first-class page; it needs a proper paginated approach.
9. **Rate limits in tests:** E2E suites that register many users trip the 30/hour limit; the suite needs a local-only reset helper or env override.
10. **No git history:** nothing is committed, so there is no safe rollback point. Recommend an initial commit before Phase 1.

## 9. Phased plan (adjusted)

0. Audit (this document).
1. **Navigation shell:** responsive sidebar for candidates, new routes as real pages (no dead buttons), first-run dashboard cards, settings page, shared UI additions (Skeleton, EmptyState, Tabs, ProgressBar). Application Tracker table + CRUD is included here or moved to its own small phase.
2. **Exam catalog and discovery:** `exams` family of tables, admin exam CRUD, candidate discovery + filters + select/targets, search-provider abstraction with fallback.
3. Syllabus. 4. Verified content + Storage. 5. Question bank + practice. 6. Mock tests + server scoring. 7. Previous papers. 8. AI learning. 9. Study planner. 10. Analytics. 11. Notifications. 12. Test hardening and mobile checks. 13. Deployment docs.

Each phase ends with migrations, RLS tests, unit tests, E2E where a user workflow exists, doc updates (`BUILD_SUMMARY.md`, `PROJECT_STATUS.md`, `DATABASE_SCHEMA.md`, etc.) and an honest completed/remaining report.

## 10. Decisions needed before the phases that depend on them

1. **Gemini:** will you enable billing on the Google project (or give a new key)? Needed to verify Phase 8 and the existing AI tests.
2. **Google Search:** do you have (or can you create) a Programmable Search Engine ID + API key? If not, Phase 2 ships with the abstraction, the internal catalog and the documented fallback only.
3. **Languages:** English only for now, or English + Hindi (affects `language` columns, filters, and AI prompts)?
4. **Notification delivery:** in-app only for now, or also email (requires choosing a provider)?
5. **Application Tracker** is not in your entity list; I plan to add `job_applications` (status: planning, applied, admit card, exam, result, etc.). OK?
6. **Initial git commit** before Phase 1, so every phase can be reviewed as a diff. OK to commit?
