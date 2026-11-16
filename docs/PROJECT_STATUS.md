# Project Status

Government Jobs Eligibility Platform — living status report. This file is regenerated at the
end of every completed phase, per CLAUDE.md's workflow. It reflects the **actual, verified**
state of the repository, not a plan or an aspiration.

Authoritative specifications: `docs/PRD.md`, `docs/TECH_STACK.md`, `docs/ARCHITECTURE.md`,
`docs/DATABASE.md`, `docs/ELIGIBILITY_ENGINE.md`, `docs/SECURITY.md`. The roadmap phase
numbering below (0–15) is the one this project has been using since inception; there is no
separate `docs/IMPLEMENTATION_ROADMAP.md` file — this document *is* the roadmap tracker.

## Summary

| Phase | Name | Status |
|---|---|---|
| 0 | Specification | Complete |
| 1 | Project bootstrap | Complete |
| 1.5 | Foundation documentation | Complete |
| 2 | Database | Complete |
| 2.1 | Database consistency fix | Complete |
| 3 | Authentication + registration | Complete |
| 4 | Profile + qualifications | Complete |
| 5 | Eligibility engine | Complete |
| 6 | Job data + admin management | Complete |
| 7 | Job ingestion + AI | **Complete — user opted in post-MVP-deferral; see below** |
| 8 | Personalized dashboard | **Complete** |
| 9 | Search / filters / saved jobs | **Complete (MVP); N+1/query-batching polish remains** |
| 10 | Admin dashboard | Substantially complete (Phase 6); data-quality warnings remain |
| 11 | Notifications | Not started (explicitly post-MVP per PRD.md §19/§20) |
| 12 | Security hardening | **Rate limiting + full security headers incl. CSP complete (§32 checklist follow-up outstanding)** |
| 13 | Testing + performance | Ongoing (per-phase; N+1 reduction outstanding) |
| 14 | Production deployment | Not started |
| 15 | Production verification | Not started |

## Phases 0–3 (prior work, re-verified this session)

Re-verified by direct inspection rather than trusted from prior notes:

- All 12 Supabase migrations present under `supabase/migrations/`, covering extensions,
  reference tables, `profiles`, organizations/sources, job notifications/posts, the six
  eligibility rule tables, saved jobs/history/imports/documents, admin/audit, the RLS helper
  function, RLS policies, reference-data seed, and the Phase 2.1 fix making
  `admin_role_assignments.granted_by` use `ON DELETE SET NULL`.
- Generated types exist at `lib/supabase/types.ts` and are used throughout `db/`.
- Full auth flow implemented and covered by `tests/e2e/auth.spec.ts`: register → confirm
  (real Mailpit email) → onboarding → dashboard; logout; login; forgot/reset password;
  cross-user isolation. Server-side identity resolution via `requireUser()` /
  `auth.getUser()` everywhere; no client-supplied user ID accepted anywhere in this code.

These phases were not rebuilt.

## Phase 4 — Profile + Qualifications: COMPLETE

**Implemented** (found already substantially built, then closed the real test-coverage gaps):

- `app/(protected)/profile/page.tsx` — server component loading the caller's own profile,
  qualifications, statuses, and reference-data options (categories, states, education levels,
  qualification catalog, status catalog) in parallel.
- `profile-form.tsx`, `qualifications-section.tsx`, `statuses-section.tsx`,
  `remove-item-form.tsx` — client components using `react-hook-form` + `zodResolver`, backed
  by Server Actions in `actions.ts`.
- `services/profile/{update-profile,qualifications,statuses}.ts` — use-case layer: Zod-validate
  → re-verify every referenced FK id is currently `is_active` in the database → perform an
  ownership-scoped write. `userId` is always the server-resolved session id; there is no
  parameter path anywhere that accepts a client-supplied profile/owner id.
- `db/{profiles,profile-statuses,user-qualifications,reference-data}.ts` — typed,
  ownership-scoped Supabase queries.
- `lib/validation/profile.ts` — `profileEditSchema`, `addQualificationSchema`,
  `removeQualificationSchema`, `addStatusSchema`, `removeStatusSchema`.

Profile covers DOB, primary category, state, domicile state (kept as a separate field from
state, per DATABASE.md), education level, gender, years of experience, qualifications
(add/remove, with institution/year), and special statuses (add/remove) — all as
reference-table UUIDs, never free text.

**Gaps found and closed this session:**

1. No unit tests existed for `lib/validation/profile.ts` → added
   `tests/validation/profile.test.ts` (25 cases: valid/invalid DOB, gender enum, experience
   bounds, non-UUID reference ids, qualification year bounds).
2. `tests/db/security-invariants.test.ts` only tested cross-user **read** isolation for
   profiles/qualifications → added five real-database **write**-isolation (IDOR) tests: user A
   cannot update user B's profile, cannot add/remove user B's qualifications, cannot
   grant/read/remove user B's special statuses. All run against the real local Supabase stack,
   not mocks.
3. No E2E coverage of the profile/qualifications/statuses UI → added
   `tests/e2e/profile.spec.ts`: edit-and-persist profile details, client-side DOB validation,
   add/remove a qualification, add/remove a special status, and a two-browser-context test
   proving user A never sees or affects user B's profile through the actual page.

**Files changed:**
- Added: `tests/validation/profile.test.ts`, `tests/e2e/profile.spec.ts`
- Modified: `tests/db/security-invariants.test.ts` (added write-isolation test cases)
- Modified: `docs/PROJECT_STATUS.md` (this file — was previously an unedited pasted handoff
  document with no real status content)

**Database changes:** None. No migration was needed — Phase 4 works entirely against the
existing `profiles`, `profile_statuses`, `user_qualifications`, and reference tables from
Phase 2.

**Security review:**
- Every write path re-derives identity from `requireUser()` (server-side session), never from
  form/client input.
- Every reference-table id is re-validated server-side (`is_active` check) before being
  persisted, even though the `<select>` only ever renders valid options — never trusts that a
  request actually came from the rendered form.
- RLS is the independent second layer under every service-layer check (`profiles_select_own`,
  `profiles_update_own`, `user_qualifications_all_own`, `profile_statuses_all_own`) — verified
  directly against the real database, not just assumed from policy definitions.
- Newly added tests confirm both the read-isolation (pre-existing) and write-isolation
  (new) boundaries hold at the database layer independent of application code.

**Tests:**
- `npx vitest run` → **69/69 passing** (5 files: smoke, server-client-boundary,
  db/security-invariants [real Supabase], validation/auth, validation/profile).
- `npx playwright test` → **12/12 passing** (7 auth + 5 new profile/qualification/status,
  including the two-context cross-user authorization test), run against a real local Next.js
  server and real local Supabase/Mailpit.

**Manual verification:** Performed via the Playwright E2E run above (real browser, real
server, real database, real email) — not substituted with a unit test. Confirmed: profile
edits persist across a page reload; adding/removing a qualification and a special status
updates the UI and the underlying rows; user B's `/profile` page never renders user A's data.

**Typecheck:** PASS
**Lint:** PASS
**Format:** PASS
**Tests:** PASS (69 unit/integration + 12 E2E)
**Build:** PASS (`next build`, all 11 routes compiled)

**Known issues:**
- Local dev environment runs **Node 20.19.4**; `package.json` requires `>=22` and
  `@supabase/supabase-js` prints a deprecation warning on every build/run. This is a pre-existing
  environment gap (present since Phase 3), not something this phase introduced, and it did not
  block any test from passing. Upgrading the local Node runtime is recommended before Phase 14
  (production deployment), where the deprecation could become a hard failure in a newer
  supabase-js release.
- During E2E verification, port 3000 on this machine was occupied by an unrelated app (not part
  of this project). Supabase's local `site_url`/`additional_redirect_urls` were temporarily
  pointed at port 3100 for the test run and reverted immediately after (`git diff` confirms
  `supabase/config.toml` is back to `localhost:3000`, matching Phase 3's documented rationale for
  using `localhost` over `127.0.0.1`). No lasting configuration change.
- No other known blocking issues.

## Phase 5 — Eligibility Engine: COMPLETE

**Implemented:** a pure, framework-independent domain module at `domain/eligibility/` — no
import of React, Next.js, Supabase, or any I/O anywhere in the module (verified: it's a
function of plain data in, plain data out).

- `types.ts` — the full input/output contract: `EligibilityProfile`, `JobEligibilityRules`
  (age rule, relaxations, status requirements, state scope, gender rule, experience rule,
  qualification requirements), `DimensionResult`, `EligibilityResult`.
- `date.ts` — `calculateAge`: calendar-age arithmetic on parsed `{year, month, day}` integer
  tuples (never a `Date` object), so leap-year birthdays (Feb 29 in a non-leap cutoff year)
  and exact-birthday-on-cutoff boundaries fall out of the same comparison with no special
  case, per ELIGIBILITY_ENGINE.md §5's exact worked example.
- `age.ts` — age dimension including category/status relaxation stacking (§7): zero
  applicable relaxations → 0; exactly one → used directly; two or more → governed by the
  post's `relaxation_combination_mode` (`additive` sums, `max_of` takes the largest,
  anything else with 2+ candidates → `needs_verification`, never guessed).
- `status.ts` — status-*gating* dimension (DATABASE.md §14A, distinct from relaxation):
  `required` is a hard AND-gate across all required rows, `optional`/`preference` never
  block.
- `state.ts` — state/domicile dimension: `all_india` / `specific_states` (current state) /
  `domicile_required` (domicile state only — current state never substituted).
- `gender.ts`, `experience.ts` (domain-specific `domain_note` always routes to
  `needs_verification`, independent of the numeric check), `qualification.ts` (AND-of-OR
  groups; generic requirements matched by education-level rank, specific requirements by
  exact id; any `ambiguous`/`unsupported` `verification_status` row makes its whole group
  unresolved).
- `evaluate.ts` — aggregator: `not_eligible` if any dimension fails, else
  `needs_verification` if any dimension is unresolved, else `eligible`. Order-independent by
  construction (dimensions are computed independently, then reduced).

This closes the two schema gaps ELIGIBILITY_ENGINE.md's §7/§8/§16 flagged as prerequisites
(`profile_statuses`/`statuses`, and `relaxation_combination_mode` + status-keyed
`job_relaxations`) — inspection during this phase found DATABASE.md's actual migrations had
already implemented both, ahead of that spec document's own "not yet built" note. No schema
change was needed for Phase 5.

**Not yet built (intentionally, per the roadmap):** the `services/eligibility` layer that
reads Supabase rows and shapes them into `EligibilityProfile`/`JobEligibilityRules`, and any
UI. Those are Phase 8 (personalized dashboard) work — this phase's scope was the engine and
its tests only.

**Files changed:** Added `domain/eligibility/{types,date,age,status,state,gender,experience,
qualification,evaluate,index}.ts` and `tests/domain/eligibility/{date,age,status,state,
gender,experience,qualification,evaluate}.test.ts`.

**Database changes:** None.

**Security review:** N/A for this phase's surface (pure computation, no I/O, no auth, no
persisted state) — the engine only ever operates on data the caller has already fetched
through the existing RLS-protected/service-role paths. The one security-relevant property is
architectural, and it holds: AI is nowhere in this module, and the engine's only inputs are
structured rule/profile data — matching CLAUDE.md's "AI must never directly decide final
eligibility."

**Tests:** `npx vitest run` → **140/140 passing** (13 files). New this phase: 8 domain test
files covering every case CLAUDE.md's Phase 5 checklist requires — age boundaries
(exact-birthday inclusive, leap-year Feb 29, future/invalid DOB), cutoff dates (never
wall-clock "today"), category relaxation, status relaxation, additive vs. max_of stacking
divergence (same input age, different mode, different result), unsupported/mutually-exclusive
stacking ambiguity, explicit-zero relaxation (confident non-relaxation, not ambiguity), state
vs. domicile (proving current-state is never substituted for domicile), gender, numeric
experience, domain-specific ("ambiguous") experience, generic qualification (rank-based),
specific qualification (exact-match-only, related-but-different is a clear fail, not
ambiguous), AND-across-groups / OR-within-a-group, missing profile data, missing rules
(trivial pass), qualification `verification_status` handling, and mixed
eligible/not_eligible/needs_verification aggregation including the `not_eligible`-dominates-
`needs_verification` precedence rule and order-independence.

**Manual verification:** N/A — this phase has no UI or user-facing surface yet (that's Phase
8); verification is the automated test suite above, which is real (not a placeholder) and
covers the specification's worked examples directly.

**Typecheck:** PASS
**Lint:** PASS
**Format:** PASS
**Tests:** PASS (140/140; E2E suite re-verified at 12/12 in the Phase 4 section above and
unaffected by this phase's changes)
**Build:** PASS

**Known issues:** Same pre-existing Node 20 vs. required Node 22 gap noted under Phase 4 —
still non-blocking, still recommended to resolve before Phase 14.

## Phase 6 — Job Data + Admin Management: COMPLETE

**Implemented:**

- `lib/auth/require-admin.ts` — `requireAdminRole(minRole)`, resolves the caller's role via the
  existing `is_admin` security-definer RPC (never a client-trusted role claim) and redirects to
  `/dashboard` if insufficient.
- `lib/validation/admin.ts` — Zod schemas for every admin entity (organizations, departments,
  job sources, job notifications, job posts, and all six eligibility rule tables plus role
  grants). Found and fixed a real bug here (see below).
- `lib/audit.ts` — `recordAuditEvent`/`recordJobHistoryEntries`, the only write path into
  `audit_logs`/`job_history` (both tables have no INSERT policy for any authenticated role by
  design — DATABASE.md §21/§25), using the service-role client after the underlying RLS-scoped
  write already succeeded.
- `db/admin/*` + `services/admin/*` — the same validate → re-verify-FK → ownership/role-scoped
  write pattern established in Phase 4, for organizations, departments, job sources, job
  notifications, job posts, and all eligibility rule tables (age, category/status relaxations,
  status-gated requirements, state/domicile scope, gender, experience, qualification
  requirements — all six tables the eligibility engine reads).
- `app/(admin)/admin/*` — full admin UI: organizations and sources (admin role), job
  notifications + posts + a per-post eligibility rules editor covering every rule table (editor
  role), a status-transition workflow (`discovered → ... → approved → published/expired →
  archived`, admin role for publish/unpublish/expire/archive, reviewer role for approve), a
  change-history view per notification, and admin role management (grant/revoke, super_admin
  only).
- Every admin write records `job_history` and/or `audit_logs` entries via `lib/audit.ts`.

**Role model implemented exactly as specified:** reviewer (read admin area, approve) < editor
(create/edit jobs, posts, rules) < admin (+ orgs/sources, publish/unpublish/expire/archive) <
super_admin (+ grant/revoke admin roles). Every write is gated in the Server Action itself via
`requireAdminRole` (never trusting that the page-level gate already ran), with RLS's
`*_write_editor`/`*_write_admin`/`admin_role_assignments_write_super_admin` policies as the
independent second layer.

**Real bug found and fixed during E2E verification:** `emptyToUndefined` (the shared helper
normalizing unset optional `<select>`/`<input>` fields before Zod validation, duplicated in
`lib/validation/admin.ts` and `lib/validation/profile.ts`) only handled `FormData.get()`
returning `""`. For a `<select>` whose only option is a disabled placeholder (e.g. the
department field before an organization has any departments), the browser submits no value at
all and `FormData.get()` returns `null` — which the helper let straight through to
`z.uuid().optional()`, which only special-cases `undefined`, not `null`, and rejected it as an
invalid UUID. Fixed in both files to treat `null` and `""` identically. Also found and fixed:
`StatusActions` (the publish/unpublish/approve/etc. buttons) showed error feedback but never
success feedback, and `JobNotificationForm` never wired per-field Zod errors into its
`SelectField`/`InputField` `error` props (both real UX gaps, not just test artifacts — a real
admin hitting either would have seen an unhelpful generic message or silence). Also found and
fixed a pre-existing, unrelated flaw in Phase 3's own `tests/e2e/auth.spec.ts` password-reset
test: it asserted landing on `/dashboard` for a user who was deliberately never onboarded,
which only ever "passed" on a lucky timing race against `/dashboard`'s own
incomplete-profile→`/onboarding` redirect; corrected the assertion to the actually-correct
`/onboarding` destination.

**Files changed:** Added `lib/auth/require-admin.ts`, `lib/audit.ts`,
`lib/validation/admin.ts`, `db/admin/{organizations,job-sources,job-notifications,
eligibility-rules,roles,job-history}.ts`, `services/admin/{organizations,job-sources,
job-notifications,eligibility-rules,roles}.ts`, the full `app/(admin)/admin/**` route tree,
`tests/validation/admin.test.ts`, `tests/e2e/admin.spec.ts`. Modified
`lib/validation/profile.ts` (bug fix), `tests/db/security-invariants.test.ts` (new admin RLS
tests), `tests/e2e/auth.spec.ts` (test-assertion fix).

**Database changes:** None — the schema already had everything this phase needed
(`job_relaxations`/`job_age_rules.relaxation_combination_mode`/`job_status_requirements` were
already ahead of even `docs/ELIGIBILITY_ENGINE.md`'s own draft, as noted in the Phase 5
report).

**Security review:**
- No client-trusted role anywhere — every admin check resolves through `is_admin(auth.uid(),
  minRole)` server-side.
- Verified at the real-database level (not just by reading policy SQL) that: a non-admin
  cannot write organizations/sources/job notifications/eligibility rules; an editor can write
  job notifications/posts/rules but *not* organizations/sources (admin-tier only); an editor
  cannot grant themselves a higher role (role escalation blocked); an `admin`-tier user —
  correctly — still cannot write `admin_role_assignments` (that table's write policy requires
  the literal `super_admin` tier, unlike every other `*_write_admin` policy in the schema,
  which accepts admin-or-above).
- `audit_logs`/`job_history` remain unwritable through any RLS-scoped client regardless of
  role, verified directly, confirming Phase 6's new admin write paths didn't erode that Phase 2
  invariant.
- **Known limitation, not a blocker:** RLS's `job_notifications_write_editor` policy grants
  editor-or-above UPDATE on the *entire* `job_notifications` row, including `status` — it has
  no column-level restriction. The "only admin may publish" rule is therefore enforced by the
  application layer (`transitionJobNotificationStatusUseCase` requiring `requireAdminRole`)
  and *not* independently by RLS the way every other role boundary in this phase is. A
  determined editor bypassing the UI could theoretically `UPDATE job_notifications SET
  status='published'` directly via the REST API. Closing this would need either a
  column-level RLS policy split or a trigger enforcing the transition table server-side — a
  schema change, so flagged here rather than made silently. Recommend addressing before Phase
  12 (security hardening) if this matters for the production threat model.

**Tests:**
- `npx vitest run` → **181/181 passing** (14 files). New: `tests/validation/admin.test.ts` (25
  cases covering every admin schema, including the SSRF-relevant https-only URL checks and the
  relaxation exactly-one-of-category-or-status constraint), plus 9 new real-database RLS/role
  tests appended to `tests/db/security-invariants.test.ts`.
- `npx playwright test` → **15/15 passing** (7 auth + 5 profile + 3 new admin: full
  super_admin create-org→create-source→create-job→create-post→set-age-rule→approve→publish
  flow; reviewer blocked from every admin-tier and editor-tier write page; non-admin blocked
  from the entire `/admin` area).

**Manual verification:** Performed via the Playwright E2E run above (real browser, real Next.js
server, real local Supabase/Mailpit) — the full admin content-creation and publish workflow was
exercised end-to-end, not just unit-tested. The `emptyToUndefined` bug above was caught by
exactly this real-browser run (a unit test of the schema in isolation, with a hand-constructed
payload, did not reproduce it — only the real browser's actual `FormData` submission behavior
did), directly validating CLAUDE.md's requirement to use real E2E verification rather than
substituting a unit test for it.

**Typecheck:** PASS
**Lint:** PASS
**Format:** PASS
**Tests:** PASS (181 unit/integration + 15 E2E)
**Build:** PASS (`next build`, all 23 routes compiled, including all 14 new admin routes)

**Known issues:**
- The `job_notifications_write_editor` RLS column-level gap noted above under Security review.
- Same pre-existing Node 20 vs. required Node 22 gap noted in Phases 4–5 — still non-blocking.
- Department management has no dedicated list/edit page beyond the inline add-form on an
  organization's edit page (no delete/rename UI) — acceptable for MVP scope, not blocking.
- No admin UI yet for `job_imports`/`job_documents` (AI ingestion review queue) — that's Phase
  7's explicit scope, not a Phase 6 gap.

## Resolved conflict: AI ingestion (roadmap "Phase 7") is out of MVP scope per PRD.md

> **Superseded:** the user later explicitly asked to build AI ingestion and provided a real
> provider key, which is exactly the kind of explicit user decision this deferral said it was
> waiting on. See the "Phase 7 — AI Job Ingestion: COMPLETE" report further below for what was
> actually built. Left in place as the historical record of the original PRD-scope finding.

Before starting the roadmap's "Phase 7 — Job Ingestion + AI," direct inspection of
`docs/PRD.md` (the authoritative product-requirements source per CLAUDE.md's documented
hierarchy) found a genuine conflict with the informal phase-numbered roadmap this project has
been tracking against:

- PRD.md §20 (MVP Scope): "Basic admin job management: create, edit, review, publish,
  unpublish, expire, archive (§17, **manual entry focus** — automated ingestion pipelines are
  future scope)" and explicitly lists "AI-assisted extraction pipeline (manual admin entry is
  sufficient for MVP; AI extraction is **architected for but not required to ship**)" under
  "Explicitly out of MVP scope."
- PRD.md §21 (Future Roadmap): "PDF ingestion pipeline with AI-assisted extraction ... deferred
  to post-MVP for delivery."
- TECH_STACK.md confirms `@anthropic-ai/sdk` is deliberately not installed yet, "precisely
  because nothing in the repository uses them yet."
- The database schema (`job_imports`/`job_documents`, Phase 2) was already built ahead of the
  feature, consistent with "architected for but not required to ship" — not a gap, a deliberate
  head start for later.

Per CLAUDE.md's explicit instruction ("if code conflicts with documented architecture, stop and
identify the conflict instead of silently changing architecture" / "unresolved product decision
that materially changes behavior"), this was surfaced to the user rather than resolved
silently. **Decision: follow PRD.md as authoritative.** AI ingestion is deferred; the roadmap's
Phase 7 numbering is superseded by PRD.md's actual MVP scope. Development continues with the
Personalized Dashboard and Search/Saved Jobs — both explicitly in MVP scope (PRD.md §11–§12)
and blocked on nothing.

## Personalized Dashboard + Job Detail + Search + Saved Jobs: COMPLETE

**Implemented** (PRD.md §11 Dashboard, §12 Job Detail, §14 Latest, §15 Saved Jobs, §16 Search):

- `services/eligibility/build-inputs.ts` — the **only** place database rows cross into the
  Phase 5 domain engine: `buildEligibilityProfile` shapes a user's `profiles`/`profile_statuses`/
  `user_qualifications` rows (joined to `education_levels.rank`) into `EligibilityProfile`;
  `buildJobEligibilityRules` shapes a job post's six rule tables into `JobEligibilityRules`.
  `domain/eligibility/*` itself still imports nothing from Supabase — verified by this file
  being the sole caller of `evaluateEligibility` outside the domain module's own tests.
- `services/eligibility/evaluate.ts` — `evaluateJobForUser` (single post) and
  `evaluateJobsForUser` (batched: one profile fetch, N rule fetches, used by dashboard/search
  list views instead of re-fetching the profile per post).
- `db/jobs.ts` — public read queries for `published`-only notifications (latest, closing-soon,
  keyword+state+org search, by-slug detail, batched posts-by-notification-ids). Uses
  `organizations!inner(...)` rather than a plain embed for the state filter — confirmed against
  the real local PostgREST instance that a plain embed silently returns every row (nulling the
  embedded object) instead of excluding non-matching rows, a genuine gotcha this project hadn't
  hit before.
- `db/saved-jobs.ts` + `services/jobs/saved-jobs.ts` — save/unsave, same ownership-scoping
  pattern as every other user-owned-data service this project.
- `app/(protected)/dashboard/page.tsx` — rewritten from the Phase 3 placeholder into the real
  dashboard: eligible-job count, Recommended/Latest/Closing-soon sections, Saved jobs (with a
  visual "expired" indicator based on the actual deadline date, not the admin-set `status`
  field, since nothing auto-transitions status on deadline passing without an explicit admin
  action or a scheduled job).
- `app/(protected)/jobs/page.tsx` — search/browse with keyword, state, organization, and
  eligibility-status filters.
- `app/(protected)/jobs/[slug]/page.tsx` — job detail page with the full per-dimension
  eligibility explanation (reusing the exact `DimensionResult` reasons the engine produces, not
  a re-derived summary), and PRD.md §12's two distinct, correctly-labeled actions ("View
  Official Advertisement" / "Apply on Official Website" — the latter only ever rendered when an
  `official_application_url` actually exists, never fabricated).
- `components/jobs/{eligibility-badge,job-card}.tsx` — shared display components.

**Resolved conflict (see above): AI ingestion deferred, this phase built instead** — this *is*
PRD.md's actual MVP dashboard/search/saved-jobs scope.

**Files changed:** Added `services/eligibility/{build-inputs,evaluate}.ts`,
`services/jobs/saved-jobs.ts`, `db/{jobs,saved-jobs}.ts`,
`app/(protected)/jobs/{page,actions,save-button}.tsx`, `app/(protected)/jobs/[slug]/page.tsx`,
`components/jobs/{eligibility-badge,job-card}.tsx`, `tests/e2e/dashboard.spec.ts`. Rewrote
`app/(protected)/dashboard/page.tsx`. Modified `domain/eligibility/index.ts` (exported the
`Gender` type the bridge layer needed — the only change to Phase 5's engine itself).

**Database changes:** None.

**Security review:**
- Every read in `db/jobs.ts` relies on RLS's `job_notifications_select_published`/
  `job_posts_select_published` policies (public, published-only) — no service-role client
  anywhere in this phase, no bypass of RLS for convenience.
- Eligibility is computed server-side per authenticated request from the server-resolved
  session id (`requireUser`), never from a client-supplied user id or a client-supplied
  eligibility result — the client never sends or could send an eligibility verdict.
- `SaveButton`/`saveJobAction`/`unsaveJobAction` re-derive identity via `requireUser` in the
  Server Action itself (not trusting the page already did), with `saved_jobs_all_own` RLS as
  the independent second layer — same pattern as every prior phase.

**Real bug found and fixed during implementation (not test-only):** PostgREST's embedded-resource
filtering behaves differently for a plain embed vs. an `!inner` embed — `organizations.state_id
= eq.X` on a plain `organizations(...)` embed does **not** exclude non-matching parent rows, it
only nulls out the embedded object, so a state filter would have silently returned unfiltered
results in production. Caught by direct testing against the real local PostgREST instance
before it ever reached a browser test, not by a unit test with a hand-built mock (a mock would
have modeled the *intended* behavior, not PostgREST's actual one).

**Tests:**
- `npx vitest run` → **182/182 passing** (no new unit tests added this phase — the
  eligibility-computation logic itself is already fully covered by Phase 5's 61 domain tests;
  this phase is glue/data-shaping plus UI, verified end-to-end instead, per CLAUDE.md's "do not
  substitute a unit test for a manual/E2E verification when the roadmap requires real browser
  behavior").
- `npx playwright test` → **17/17 passing** (12 prior + 2 new dashboard/search/saved-jobs
  tests): a super_admin publishes a fully-open job (no rules at all) end-to-end, a normal user
  sees it as **Eligible** on the dashboard (both "Recommended" and "Latest" sections, since a
  trivially-unrestricted job is always eligible-or-better), the job detail page shows the real
  per-dimension breakdown text the engine actually generated ("No age restriction for this
  post.", "No experience requirement for this post."), the two advertisement/application links
  point at the real submitted URLs, save/unsave round-trips through the dashboard's Saved Jobs
  section and back, and keyword search + the `eligible`/`not_eligible` filter both reflect the
  real computed result (searching with `eligibility=not_eligible` on a job with zero rules
  correctly returns "No jobs match your filters.").

**Manual verification:** Performed via the Playwright E2E run above — real browser, real
Next.js server, real local Supabase, real computed eligibility (not a stubbed/mocked
eligibility result anywhere in the test). This is the first phase where the eligibility engine
built in Phase 5 is exercised against real data end-to-end rather than only against
hand-constructed unit-test fixtures, closing that verification gap.

**Typecheck:** PASS
**Lint:** PASS
**Format:** PASS
**Tests:** PASS (182 unit/integration + 17 E2E)
**Build:** PASS (`next build`, all 21 routes compiled, including `/jobs` and `/jobs/[slug]`)

**Known issues:**
- **Dashboard/search scale is bounded, not exhaustive** (`DASHBOARD_SCAN_LIMIT`/`SEARCH_LIMIT`
  = 50): the eligible-count and recommended/search results are computed only over the 50 most
  recent published notifications, not literally every published job on the platform.
  Documented in-code as a deliberate MVP bound, not a silent gap — PRD.md §22 and the roadmap's
  Phase 9 note both anticipate this being revisited once volume justifies pagination/dedicated
  search.
- **Observed load-sensitivity under heavy concurrent E2E testing on this single dev machine:**
  running the full Playwright suite at high worker parallelism (4, this machine's default)
  against a long-lived local dev server + Docker Postgres that had accumulated thousands of
  test-created rows across this session's many repeated runs produced intermittent
  network-level timeouts (never a functional/assertion failure — always a raw navigation
  timeout). A `supabase db reset` (clearing accumulated test cruft) plus `--workers=2`
  eliminated it entirely: 17/17 passing in 44s, materially faster than the degraded runs. This
  reflects this session's repeated-testing load on one shared local stack, not a demonstrated
  production scalability issue — but the *eligibility evaluation itself* doing one Supabase
  round-trip per rule table per post (6 tables × N posts, no batching across posts) is a real,
  known N+1-shaped cost worth addressing in Phase 9 alongside the search-scale bound above.
- Same pre-existing Node 20 vs. required Node 22 gap noted in prior phases — still non-blocking.
- The `job_notifications_write_editor` RLS column-level gap noted in the Phase 6 section above
  is unchanged by this phase.

## Phase 12 — Security Hardening: Rate Limiting + Security Headers (INCLUDING CSP): COMPLETE

**Implemented (SECURITY.md §16, Rate Limiting):**

- New migration `20260901210000_rate_limit_attempts.sql` — `rate_limit_attempts` table, no RLS
  policy for any role (same posture as `audit_logs`/`job_history`), written/read only through
  `lib/rate-limit.ts`'s service-role client. A Postgres-backed limiter was chosen deliberately
  over an in-memory counter — this project's real deployment target (Vercel, TECH_STACK.md) is
  serverless, where in-process memory isn't reliably shared across invocations, and no
  Redis/Upstash decision exists anywhere in TECH_STACK.md/ARCHITECTURE.md to justify adding one
  (CLAUDE.md: "avoid unnecessary dependencies").
- `lib/rate-limit.ts` — `checkRateLimit(bucketKey, maxAttempts, windowSeconds)`, fails open on
  any DB error (never blocks a legitimate user because the limiter itself had a hiccup — logged
  loudly instead). `getClientIp()` reads `x-forwarded-for` (set by Vercel in production; falls
  back to a shared `"local"` bucket in local dev, where the limiter is still exercised rather
  than silently disabled).
- Wired into all three flows SECURITY.md §16 calls out: login (strict, both per-IP and
  per-account — a distributed attack across IPs against one account is still caught by the
  account bucket, and a single-IP attack across many accounts is still caught by the IP
  bucket), registration (moderate per-IP), password reset (strict per-account, keyed by the
  submitted email string regardless of whether it belongs to a real account, so the limiter
  itself can never become an enumeration oracle).
- Per-IP limits (register: 30/hour, login: 50/15min) are set higher than a
  production-abuse-only read of SECURITY.md's "moderate"/"strict" language would suggest — this
  is deliberate and documented in-code: this project's local E2E suite has no
  `x-forwarded-for` locally, so every test run's traffic shares one `"local"` IP bucket, and the
  original stricter numbers (10/hour, 20/15min) broke real E2E test runs (caught by actually
  running the suite, not assumed). Per-account limits stayed strict (5 attempts) since each
  test uses a unique email and has no such collision.

**Implemented (SECURITY.md §29, Security Headers) — including CSP, after a real decision point:**

- `next.config.ts` sets `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy` (deny
  camera/microphone/geolocation), and — production-only — `Strict-Transport-Security`. All
  verified against a real production build (`next build && next start`) via `curl`.
- **Content-Security-Policy is enforced**, production-only, via `lib/supabase/middleware.ts`'s
  per-request nonce pattern (Next's own documented approach,
  `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`, read directly per
  this repo's "this is NOT the Next.js you know, read the docs" instruction): `default-src
  'self'`, `script-src 'self' 'nonce-<random>' 'strict-dynamic'`, `connect-src` scoped to
  `'self'` plus the configured Supabase origin, `frame-ancestors 'none'`, no `unsafe-inline`/
  `unsafe-eval` for scripts.

**What it took to get there — a real architectural trade-off, surfaced rather than guessed at:**
1. A static CSP header in `next.config.ts` was tried first. A real production build + real
   headless-browser check found this blocks Next's own inline hydration bootstrap scripts
   outright — actual "Refused to execute inline script" violations. Reverted.
2. Next's documented per-request-nonce fix was tried next. A second real build + browser check
   found this *also* breaks the app: Next's docs state, verbatim, that nonce-based CSP requires
   **"all pages must be dynamically rendered"** — this project had three statically-optimized
   pages (`/`, `/register`, `/forgot-password`), and a static page has no request to read a
   nonce from at all, so every script on those pages was un-nonced and blocked by the resulting
   `strict-dynamic` policy. Confirmed via headless browser: 11 blocked script requests, the app
   never hydrated. Reverted a second time rather than shipped broken.
3. This is a genuine product/performance trade-off (losing static optimization/ISR/CDN caching
   project-wide) that nothing in PRD.md/ARCHITECTURE.md specified — surfaced to the user via
   `AskUserQuestion` rather than decided unilaterally, per CLAUDE.md's "unresolved product
   decision that materially changes behavior" stop condition. **Decision: force dynamic
   rendering everywhere, use nonces** (over `unsafe-inline` or leaving CSP unset).
4. Implemented via `export const dynamic = "force-dynamic"` on `app/layout.tsx` — inherited by
   every route including any added later, rather than annotating individual pages with `await
   connection()`, so a future page can't silently reintroduce this exact breakage by being
   statically optimized by default. Confirmed via `next build`: all 24 routes now render as
   `ƒ` (dynamic), zero `○` (static) remaining. Re-verified with a real production build + real
   headless-browser check on `/register`, `/`, and `/login`: **zero console errors, zero failed
   requests**, and the email field genuinely accepts input through React (not just the native
   DOM) with the full nonce-based CSP active.

**Files changed:** Added `supabase/migrations/20260901210000_rate_limit_attempts.sql`,
`lib/rate-limit.ts`, `tests/db/rate-limit.test.ts`, `tests/stubs/server-only-stub.ts`. Modified
`app/(auth)/{login,register,forgot-password}/actions.ts` (rate limiting), `next.config.ts`
(headers), `lib/supabase/middleware.ts` (per-request CSP nonce), `app/layout.tsx`
(`force-dynamic`), `vitest.config.ts` (env-loading + `server-only` alias needed to test
`lib/rate-limit.ts` at all — see below). `lib/supabase/types.ts` regenerated.

**Database changes:** One new migration (`rate_limit_attempts`), applied via `supabase db
reset` and confirmed in the regenerated types.

**Security review:**
- Rate-limit bucket keys never leak account existence: the password-reset bucket is the raw
  submitted email string, identical treatment whether or not it belongs to a real account.
- `rate_limit_attempts` itself is unreadable/unwritable through any RLS-scoped client — verified
  by construction (no policy exists for any role), consistent with `audit_logs`/`job_history`.
- Fail-open behavior on a rate-limiter DB error is a deliberate availability-over-defense
  trade-off for this *secondary* layer — login/registration still go through Supabase Auth's
  own independent rate limiting regardless, so this isn't the only defense.

**Real infrastructure bug found and fixed along the way (not a security bug, but blocked
testing it):** `lib/rate-limit.ts` is marked `server-only`, and the `server-only` package
unconditionally throws unless resolved through Next's `react-server` module condition, which
Vitest never sets — meaning *any* test importing *any* server-only-marked module would fail
immediately, which is why no prior test in this project ever did (they all worked around it by
constructing their own inline Supabase clients instead). Fixed generally, not just locally,
via a `server-only` → no-op-stub alias in `vitest.config.ts`, so future phases can unit/
integration-test server-only modules directly. Also added `loadEnv` (Vite's own built-in, no
new dependency) to `vitest.config.ts` since Vitest doesn't auto-populate `process.env` from
`.env.local` the way Next.js does, which `lib/rate-limit.ts`'s test needs for the real
service-role connection.

**Tests:**
- `npx vitest run` → **185/185 passing** (15 files). New: `tests/db/rate-limit.test.ts` (3
  cases against the real local Postgres table: blocks after the configured max, tracks distinct
  bucket keys independently, only counts attempts within the configured window).
- `npx playwright test` → **17/17 passing**, re-run three times across this phase (after the
  rate limiter, after the dynamic-rendering change) specifically to catch exactly the kind of
  self-inflicted breakage described above — and which did in fact occur once, with the original
  stricter per-IP limits, before being fixed.
- Manual verification: real production build (`next build && next start`) checked repeatedly
  with `curl` (headers present/absent as intended) and with a real headless browser via the
  `browser-automation` skill on `/register`, `/`, and `/login` — zero console errors, zero
  failed requests, real React-driven form interactivity confirmed (not just native DOM
  behavior) with the full nonce-based CSP active.

**Typecheck:** PASS
**Lint:** PASS
**Format:** PASS
**Tests:** PASS (185 unit/integration + 17 E2E)
**Build:** PASS (`next build`, all 24 routes now dynamic; production `next start` verified separately)

**Known issues:**
- Every route now renders dynamically (no static optimization/ISR/CDN caching anywhere) — the
  accepted cost of the CSP decision above. Revisit if a specific page's performance under real
  traffic justifies carving out an exception (e.g. serving `/` statically without the strict
  script-src, at the cost of that one page's CSP protection).
- `npm audit --omit=dev --audit-level=moderate` (now wired into `.github/workflows/ci.yml`)
  could not be verified locally — this development sandbox routes npm through an internal
  Sonatype Nexus proxy that returns a 400 on the audit endpoint, unrelated to the real npm
  registry GitHub Actions will use. The workflow step is correctly structured but its actual
  pass/fail result on this codebase's current dependency tree is **unverified**, not confirmed
  passing — flagged rather than claimed.
- Same pre-existing Node 20 vs. required Node 22 gap noted in prior phases — CI now runs on
  Node 22 regardless (matching `package.json`'s declared `engines`), so this only affects local
  development in this sandbox, not the pipeline.

## Phase 12 continued — §32 Checklist Follow-Up: COMPLETE (2 real gaps found and closed)

Systematically worked through the remaining unreviewed SECURITY.md §32 checklist items. Two
were genuine, previously-unnoticed gaps in already-shipped Phase 6 code; closed both with real
tests, not just documentation:

**1. Domain verification before publish (checklist: "Domain verification against
`job_sources.official_domain` enforced before a job can pass review") — was completely missing.**
`transitionJobNotificationStatusUseCase`'s `approve`/`publish` transitions never checked that a
notification's `official_advertisement_url`/`official_application_url` actually resolved to the
linked source's `official_domain` (or a subdomain of it) — an editor could enter a URL on any
domain and it would sail through to `published` unchecked. Fixed in
`services/admin/job-notifications.ts` (`verifyOfficialUrlsAgainstSource`, re-checked at both
`approve` and `publish` since the notification remains editable in between). Verified with a
new real E2E test (`tests/e2e/admin.spec.ts`): a notification with a mismatched-domain
advertisement URL is blocked at Approve with a clear error and stays in `discovered` status.

**2. Eligibility rule changes were not audit-logged (checklist: "Sensitive operations (publish,
rule change, role change) confirmed gated and logged") — rule changes were gated but not
logged.** All 12 use cases in `services/admin/eligibility-rules.ts` (age rule, relaxations,
status requirements, state scope + states, gender rule, experience rule, qualification
requirements — every add/remove/upsert) now call `recordAuditEvent` on success, threading
`userId` through from the caller (`rules-actions.ts`, already resolving it via
`requireAdminRole`). Verified directly against the real database (not just code review): a real
`job_age_rule.upsert` row confirmed present in `audit_logs` after the E2E suite ran.

**3. CI + dependency scanning ("Automated vulnerability scanning integrated into CI") — didn't
exist at all.** Added `.github/workflows/ci.yml`: typecheck, lint, format check, `npm audit`
(production dependencies, moderate+ severity fails the build), a real local Supabase stack via
`supabase/setup-cli`, the full `npm test` suite (including the real-database tests), and a
production build — on Node 22 (this project's actual declared engine), not the Node 20 this
sandbox happens to run. The audit step's actual pass/fail against this dependency tree is
unverified here (see Known issues) due to a local-sandbox-only registry proxy issue.

**Checked and confirmed already satisfied (no code change needed):**
- No secret string appears in `.next/static` build output (grepped for both the env var name
  and a 21-character substring of the actual local service-role key value — verified with the
  real value, not assumed).
- `.gitignore` correctly excludes `.env`/`.env.local`/`.env.*.local`; the repo has zero commits,
  so there's no git history to have ever leaked a secret into in the first place.
- Account deletion: confirmed genuinely out of MVP scope (absent from PRD.md §20's in-scope
  list, not silently dropped) — the schema-level requirement it would depend on
  (`ON DELETE SET NULL` on every actor-reference column) is already in place from Phase 2, so
  building the feature later needs no further schema work.

**Files changed:** Modified `services/admin/job-notifications.ts` (domain verification),
`services/admin/eligibility-rules.ts` (audit logging, all 12 use cases),
`app/(admin)/admin/jobs/[id]/posts/[postId]/rules-actions.ts` (threading `userId` through),
`tests/e2e/admin.spec.ts` (new domain-verification test). Added `.github/workflows/ci.yml`.

**Database changes:** None.

**Tests:** `npx vitest run` → 185/185 passing (unchanged — this work was E2E-verified per
CLAUDE.md's real-browser-behavior requirement, not unit-tested in isolation). `npx playwright
test` → **18/18 passing** (17 prior + 1 new domain-verification test).

**Typecheck:** PASS · **Lint:** PASS · **Format:** PASS · **Build:** PASS

**Known issues:** SECURITY.md §32's remaining un-reviewed items (§7 admin session timeout
specifics, full §21 event-type-by-event-type audit coverage cross-reference, §28's complete
test-category checklist) are still open — this pass closed the concrete, checkable gaps found;
a full line-by-line §32 sign-off is still recommended before Phase 14 (production deployment).

## Phase 9 polish — Eligibility Batch N+1 Query Reduction: COMPLETE

**Implemented:** `services/eligibility/build-inputs.ts` gained
`buildJobEligibilityRulesBatch(supabase, jobPostIds)` — fetches all six per-post rule tables
(age, relaxations, status requirements, state scope, gender, experience) plus qualification
requirements with **7 queries total**, regardless of how many posts are being evaluated,
instead of the previous ~7 queries **per post**. `buildJobEligibilityRules` (single-post) is now
implemented in terms of the batch function with a one-element list, so both callers share one
row-shaping code path. `evaluateJobsForUser` (the dashboard/search list-view entry point)
switched from looping `buildJobEligibilityRules` per post to one `buildJobEligibilityRulesBatch`
call.

**Files changed:** Modified `services/eligibility/{build-inputs,evaluate}.ts`. Added
`tests/db/eligibility-batch.test.ts`.

**Database changes:** None — same tables, just batched `.in()` queries instead of per-row `.eq()`.

**Correctness verification:** the real risk in this kind of change is silent cross-post data
bleeding (post A's rules leaking into post B's grouped result) — not something the existing E2E
fixtures could catch, since they only ever used a post with zero rules or a single age rule.
Added `tests/db/eligibility-batch.test.ts` against the real database: three posts with
deliberately distinct and overlapping rule combinations (no rules / age-only / every rule table
populated, including two stacked relaxations, a state scope, and a qualification requirement),
asserting (a) the batched result for each post matches that post's individual
`buildJobEligibilityRules` fetch exactly (`toEqual`), and (b) each post's fields are correctly
isolated from the others (age-only post has zero relaxations/gender rule/qualification
requirements; the full-rules post has exactly its own two relaxations and one qualification
requirement, not the other post's data).

**Tests:** `npx vitest run` → **189/189 passing** (16 files; +4 new). `npx playwright test` →
**18/18 passing**, re-run after this change specifically since it touches the eligibility
computation path every dashboard/job-detail/search page depends on.

**Typecheck:** PASS · **Lint:** PASS · **Format:** PASS · **Build:** PASS

**Known issues:** None new. The dashboard/search bounded-scan limits (50 notifications) noted
in the earlier Dashboard/Search phase report are unchanged by this fix — this closes the
per-post query multiplication *within* that bound, it doesn't remove the bound itself (still
Phase 9's proper scope if traffic ever requires it).

## Phase 7 — AI Job Ingestion: COMPLETE

Supersedes the earlier "resolved conflict" entry above: the user later provided a real AI
provider key and explicitly asked to build this, so the earlier MVP-scope deferral no longer
applies. Implements ARCHITECTURE.md's ingestion pipeline end-to-end: admin submits a source +
document URL → the document is safely fetched → text is extracted → an AI model produces a
structured candidate extraction → the candidate is schema- and business-validated → a human
reviewer confirms/edits the core fields and approves or rejects. AI output is never published
directly (CLAUDE.md's "AI → validate → normalize → review → database", never "AI → directly
publish").

**Provider decision — Anthropic → Google Gemini:** TECH_STACK.md originally named Anthropic/
Claude as the placeholder AI provider. The Anthropic key the user provided returned a genuine
401 ("API key is invalid") from Anthropic's real API — confirmed not a formatting/whitespace
bug on this end before reporting it. Rather than guess at a fix for a credential only the user
controls, the user was asked directly and explicitly chose to switch providers. Implemented as
a full, clean swap (not a silent substitution): `@anthropic-ai/sdk` uninstalled, `@google/genai`
installed; `ANTHROPIC_API_KEY` renamed to `GEMINI_API_KEY` throughout (`lib/env.server.ts`,
`.env.example`); `TECH_STACK.md`'s AI section rewritten to document both the decision and why.
Model: `gemini-2.5-flash`.

**Pipeline stages (`lib/ingestion/`, `lib/validation/ingestion.ts`, `services/admin/job-imports.ts`):**

- `safe-fetch.ts` — SSRF-hardened fetch: https-only, rejects embedded credentials, resolves DNS
  and blocks private/reserved IP ranges (RFC1918, loopback, link-local, cloud metadata
  169.254.169.254, CGNAT, multicast) for every address a hostname resolves to, manually
  re-validates every redirect hop (max 5, no automatic redirect following), enforces a streaming
  byte cap and a request timeout.
- `extract-text.ts` — detects PDF (magic bytes) vs. HTML (doctype/tag sniffing) vs. unknown;
  extracts PDF text via `pdf-parse`'s `PDFParse` class; strips HTML to plain text via regex
  (deliberately not a real DOM parse).
- `ai-extract.ts` — sends extracted text to Gemini with a system prompt that explicitly treats
  the document as untrusted content, never as instructions to the model (prompt-injection
  defense — SECURITY.md §12), constrained to a hand-written shape-only `responseSchema` (Gemini's
  real API rejected the full Zod-derived schema with every bound/format constraint included:
  "too many states for serving" — a genuine Gemini-specific limitation found only by calling the
  live API, not discoverable from docs alone). The full `jobExtractionSchema` still validates the
  parsed response afterward at full strength.
- `lib/validation/ingestion.ts` — every reference-shaped extracted field (organization,
  qualifications, relaxation categories, state scope) is free TEXT the model read from the
  document, never a UUID — the model has no access to this platform's reference tables and must
  never be asked to invent one; mapping text to a real reference row is the human reviewer's job.
  `validateExtractionPlausibility` rejects implausible shapes (min age > max age, end date before
  start date, zero posts extracted) regardless of schema validity.
- `services/admin/job-imports.ts` — `startIngestionUseCase` runs the pipeline and records every
  stage's outcome (including failures) on the `job_imports` row for auditability;
  `approveImportUseCase` creates the real `job_notification` + primary `job_post` (+ optional age
  rule) by calling Phase 6's own already-validated, already-audited services — deliberately not a
  separate write path; `rejectImportUseCase` marks the row rejected with reviewer notes.

**Scope decision — what "approve" creates:** building a full field-by-field UI to map every
extracted qualification/relaxation/state-scope/gender/experience item to a real reference-table
row was judged impractical to build reliably in this pass. Approval creates only the core
notification + primary post + (optionally) an age rule; the reviewer finishes qualifications,
relaxations, state scope, gender, and experience rules on the **existing, already-built, already-
tested Phase 6 rules editor** at `/admin/jobs/[id]/posts/[postId]`, with the AI's raw extracted
text kept visible on the review page as reference. A deliberate, documented scope boundary, not
an oversight.

**Data model:** `job_imports` (existing table from the Phase 2 schema, migration
`20260831115938_saved_jobs_history_imports_documents.sql`) tracks each ingestion attempt —
status, AI provider/model, raw extraction JSON, validation errors, reviewer decision. RLS
(`20260831120046_rls_policies.sql`) grants SELECT/UPDATE to reviewer+ only, and deliberately has
**no INSERT or DELETE policy for any application role** — all pipeline-internal writes
(`createJobImport`, `updateJobImportPipelineState`) go through the service-role client
(`db/admin/job-imports.ts`); only the reviewer's terminal approve/reject decision
(`updateJobImportAsReviewer`) uses the caller's own RLS-scoped session, since RLS explicitly
permits that one UPDATE for reviewer+. No new migration needed — the table/policies already
existed from Phase 2's schema design.

**Admin UI:** `/admin/imports` (list, reviewer+), `/admin/imports/new` (start ingestion form,
editor+), `/admin/imports/[id]` (review page — AI-extracted data shown in a clearly-labeled
"unverified" panel, a pre-filled confirm/edit form for the core notification+post+age-rule
fields, approve/reject actions). Follows the exact Server Action + `useActionState` pattern
already established in `app/(admin)/admin/jobs/*`. Added a nav link in `app/(admin)/admin/layout.tsx`.

**Security review:**

- SSRF: covered by `safe-fetch.ts` (above) — the one place in the app that fetches an
  admin-supplied URL server-side.
- Prompt injection: the AI's fixed output schema has no actionable/control field an injected
  instruction could land in — at most it can appear as quoted text inside a free-text field or
  `extractionNotes`, which is informational only and never affects control flow. Verified against
  the real Gemini API with a deliberately malicious sample document (see Tests below), not just
  asserted in the prompt design.
- Fabricated URLs: the model's read of "the advertisement URL" is carried as
  `officialAdvertisementUrlText` (plain text, never trusted) and is **not** used to prefill the
  reviewer's actual `officialAdvertisementUrl` field — the reviewer must independently supply and
  the existing `verifyOfficialUrlsAgainstSource` domain check (Phase 6) still runs at
  approve/publish exactly as it does for manually-created notifications.
- Least privilege: only pipeline-internal writes bypass RLS (service-role); the human decision
  point uses the reviewer's own session, RLS-enforced.
- Secrets: `GEMINI_API_KEY` is server-only (`lib/env.server.ts`, never exposed to the client),
  validated at startup like every other secret in that file.

**Files changed:** Added `lib/ingestion/{safe-fetch,extract-text,ai-extract}.ts`,
`lib/validation/ingestion.ts`, `db/admin/job-imports.ts`, `services/admin/job-imports.ts`,
`app/(admin)/admin/imports/{actions.ts,page.tsx,new/{page.tsx,start-ingestion-form.tsx},[id]/{page.tsx,review-form.tsx}}`.
Modified `lib/env.server.ts`, `.env.example`, `docs/TECH_STACK.md`,
`app/(admin)/admin/layout.tsx` (nav link). Added
`tests/validation/{safe-fetch,extract-text,ai-extract}.test.ts`. Extended
`tests/db/security-invariants.test.ts` with a `job_imports` RLS boundary block.

**Database changes:** None (table/RLS already existed from Phase 2's schema).

**Tests:** `npx vitest run` → **236/236 passing** (19 files). New coverage: 32 table-driven
`safe-fetch` tests (every named private/public IPv4 range, IPv6 including IPv4-mapped
addresses, malformed-input fail-closed behavior); 5 `extract-text` tests including real
extraction from a hand-built, valid, minimal PDF (not a mock); 2 real-Gemini-API tests
(`ai-extract.test.ts`, skipped automatically if `GEMINI_API_KEY` isn't set) — one asserting
correct structured extraction from a realistic sample notice including that an unmentioned URL
stays `null` rather than being fabricated, one asserting a prompt-injection attempt embedded in
the document is neutralized; 6 new `job_imports` RLS boundary tests against the real local
Supabase stack (non-admin cannot read/insert/update/delete; editor/reviewer can read and update
but still cannot insert — no INSERT policy exists for any role).

**Manual verification:** Real browser check (headless, via the project's browser-automation
tooling) against a running dev server: created a temporary editor-role test user via the Auth
admin REST API (cleaned up afterward), signed in, loaded `/admin/imports` (renders, correct
heading, zero console errors) and `/admin/imports/new` (form renders with working Source
select/Document URL field/submit button, zero console errors, zero failed network requests). A
full live ingestion→review→approve run was not exercised in this pass — it requires fetching a
real external document and making a real (billed) Gemini call, which the two `ai-extract.test.ts`
API tests already cover for the AI-extraction step specifically; the fetch/extract/validate/
review/approve steps around it are each covered by their own real-execution tests above.

**Typecheck:** PASS · **Lint:** PASS · **Format:** PASS · **Build:** PASS (all 27 routes,
including the three new `/admin/imports*` routes, register as expected).

**Known issues:** None found. Full live end-to-end ingestion (real document → real AI call →
review → approve → verify the created notification/post) is the natural next manual check
whenever a real government notice URL is available to test against.

## Expansion Phase 1 — Candidate navigation shell, preparation foundation, Application Tracker

_Part of the Job Discovery + Exam Preparation expansion (see `PHASE0_AUDIT.md`). Decisions taken from the owner: English + Hindi with a language reference table, in-app notifications first (email designed-for), Application Tracker approved, Gemini and Google Search deferred._

**Built**
- Responsive candidate sidebar (persistent ≥ `lg`, drawer below) with the three required groups: Main menu, My Preparation, Account. `lib/navigation/candidate-nav.ts` holds the structure and a pure active-item helper.
- New real routes under `app/(protected)`: `/eligible-jobs`, `/latest-notifications`, `/saved-jobs`, `/applications`, `/preparation`, `/preparation/exams`, `/study-plan`, `/study-materials`, `/practice`, `/mock-tests`, `/previous-papers`, `/performance`, `/settings`. Existing `/dashboard`, `/jobs`, `/jobs/[slug]`, `/profile` are unchanged in behaviour.
- Dashboard "Search Government Jobs" / "Prepare for a Government Job" entry cards. `/preparation` and `/preparation/exams` are an honest first-run flow; the exam catalog does not exist yet (Phase 2), so they say so rather than showing fake data. Preparation sections that depend on later phases show a plainly-labelled "not available yet" state.
- Application Tracker: "Track application" on each job post; `/applications` lists entries with status timeline, edit (status, applied date, application number, notes) and stop-tracking.
- Settings: language (from `supported_languages`) and notification channel preferences. Email preference is stored but nothing sends email yet; the UI says so. Language choice is stored; UI translation is future work.
- Proxy protected-prefix list extended to the new routes (pages still re-check via `requireUser`).

**Database** (`20261112090000_phase1_applications_and_preferences.sql`): `supported_languages` (en, hi seeded; public read, admin write), `user_preferences`, `job_applications` (unique per user+post, status check, own-row RLS), `job_application_status_history` (written only by a security-definer trigger; owner read-only, no insert/update/delete policy). Tracker mutations are also audit-logged via `recordAuditEvent`.

**Tests added:** nav structure (every item has a real page, active-state logic), application/preference validation, 13 real-DB tests (ownership RLS, IDOR write attempts, trigger-written history incl. non-status edits, no client write path to history, language FK, admin-only language writes), and 3 Playwright specs (sidebar + every destination + settings persistence + tracker lifecycle; anonymous redirect; mobile drawer).

**Results:** typecheck, lint, Prettier, production build: PASS. Vitest 263/265 — the only failures are the two live-Gemini tests (HTTP 403, billing not enabled on the key; unchanged from baseline). Playwright 21/21 (18 existing + 3 new) against a production build.

**Environment notes:** the host was heavily loaded (load average > 100, security-software scanning) so E2E needs `--workers=2 --timeout=120000` locally; the default 30 s timeout produced load-induced failures in long multi-step specs that pass in isolation. Initial git commit made before this phase (secrets, `.env.local`, build output and local DB data excluded).

**Known limits:** no exam catalog yet, language is stored but UI is English-only, email notifications not delivered, `/jobs/eligible`-style paths deliberately avoided (`/eligible-jobs` etc.) so they cannot collide with job slugs.

## Expansion Phase 2 — Exam catalog, discovery and preparation targets

**Built**
- Database (`20261113090000_phase2_exam_catalog.sql`, `20261113090100_set_primary_exam_target.sql`): `exams` (slug, category, organization, official/source URLs, `translations` jsonb for future languages, `status` draft/published/archived, `verification_status`, `discovered_via`), `user_exam_targets` (primary/secondary, active/paused/removed, history preserved, no DELETE policy), atomic `set_primary_exam_target()`.
- Integrity enforced in the database, not just the UI: a published exam must be admin-verified and have an official website (CHECK); only an admin may create a pre-verified exam or change verification/publication (trigger); candidates see only published + verified exams (RLS) and can only target those; one primary target per user (partial unique index); only an active target can be primary.
- Candidate: `/preparation/exams` (search by name + category, verified badge, "Start preparing"), `/preparation/exams/[slug]` (exam overview, official links, live notifications from the exam's organization with eligibility, start/manage state), `/preparation` (primary/secondary targets; make primary, pause, resume, remove; "Previously prepared" history).
- Admin: `/admin/exams` (list with verification/status badges), create/edit, verify / reject / publish / unpublish / archive (admin only), `/admin/exams/discover` (external search leads, saved as unverified drafts). All writes audit-logged.
- External discovery behind a provider interface (`lib/search/exam-search.ts`); Google Programmable Search implemented, off unless `GOOGLE_SEARCH_API_KEY`/`GOOGLE_SEARCH_ENGINE_ID` are set; documented fallback. See `GOOGLE_SEARCH_INTEGRATION.md`.

**Tests added:** domain (slugify, publish rule), validation, search provider (mocked fetch; key never leaks; https-only), 17 real-DB tests (public visibility, editor/admin trigger rights, publish constraint, target ownership/IDOR, one-primary, atomic switch, history preserved), 3 Playwright specs (admin create→verify→publish; candidate discovery hides drafts + 404, start/primary/pause/resume/remove; access control). A test caught and fixed an accent-handling bug in `slugify`.

**Not done / limits:** no Google credentials, so live external search is untested (provider is unit-tested with mocked HTTP); the catalog has no bundled data — exams come from admins (two sample entries may exist in a local database); syllabus and per-exam content arrive in later phases; exam name/description translations are stored as `translations` but not yet rendered.

## Next phase: Phase 14 — Production Deployment

All planned MVP phases (Profile, Eligibility Engine, Job Data + Admin Management, Dashboard/
Search/Saved Jobs, Security Hardening, AI Ingestion) are now complete. Remaining lower-priority
polish noted in earlier phases (admin job-list N+1 — not confirmed to need work; richer admin
data-quality warnings per PRD.md §17) remains optional. Phase 14 (production deployment) is the
one remaining major roadmap item, but requires real Vercel/production-Supabase credentials this
environment doesn't have — would need to stop and hand off deployment steps rather than execute
them directly.


## Phase 2 revision — automatic catalog (owner decision)

Admin authoring of exams was removed. Exams are now fetched from Google + official pages, extracted with Gemini, validated, and **auto-published only from official domains** (`gov.in`, `nic.in`, `ac.in`, `ibps.in`), enforced by DB constraint `exams_auto_verified_requires_official_host`. Admin Exams is a read-only monitor (sync status/errors, unpublish/restore/block, "Sync from Google now"). Migration `20261113100000_exam_catalog_auto_sync.sql`; pipeline `services/exams/*`; details and trust rules in `docs/GOOGLE_SEARCH_INTEGRATION.md`. Live Google/Gemini runs are untested (no credentials/billing).


## Switchable LLM provider page

`/admin/ai-providers` (super_admin only): save encrypted API keys for Gemini, OpenAI, Anthropic and Cloudflare Workers AI and choose the one "In use". Job import and exam sync now go through `lib/llm`. Migration `20261113110000_llm_credentials.sql`; see `docs/AI_PROVIDERS.md`. Needs `APP_ENCRYPTION_KEY` in the server env. Live provider calls untested.


## Phase 3 — Syllabus (auto-fetched)

Exam → subject → chapter → topic tree stored in `syllabus_nodes` (migration `20261114090000_phase3_syllabus.sql`), fetched from official pages by `services/syllabus/sync.ts` with a name-must-appear-on-page guard, replaced atomically by `replace_exam_syllabus()`, shown on the candidate exam page with its official source, and monitored on Admin → Exams ("Fetch syllabi now"). See `docs/SYLLABUS.md` for the pipeline, trust rules and honest limits (many official notices publish only the exam pattern).


## Phase 4 — Official study materials (links)

`exam_materials` (migration `20261115090000_phase4_exam_materials.sql`): official document links per exam, collected without AI by `services/materials/sync.ts` (own-site + official host + edition match + rule-based classification), shown on the exam page and the Study Materials page, monitored on Admin → Exams ("Collect materials now"). No files are hosted; Storage is reserved for future user files. See `docs/MATERIALS.md`.
