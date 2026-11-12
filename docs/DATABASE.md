# Database Specification

**Project:** Government Jobs Eligibility and Discovery Platform
**Status:** Draft v1.0 — database source of truth
**Related documents:** [PRD.md](./PRD.md) (product requirements), [ARCHITECTURE.md](./ARCHITECTURE.md) (system architecture), [TECH_STACK.md](./TECH_STACK.md) (technology decisions), [ELIGIBILITY_ENGINE.md](./ELIGIBILITY_ENGINE.md) (eligibility business logic this schema exists to serve)

This document defines the PostgreSQL/Supabase schema design for the platform: tables, relationships, constraints, RLS strategy, indexing, and migration approach. It does **not** contain migration SQL or implementation code — see [CLAUDE.md](../CLAUDE.md): schema changes happen through migrations, and this document is what those migrations must conform to. If anything here conflicts with PRD.md, ARCHITECTURE.md, or TECH_STACK.md, the conflict is documented in §36 rather than silently resolved.

**Revision note (this version):** this revision closes the schema gaps that [ELIGIBILITY_ENGINE.md](./ELIGIBILITY_ENGINE.md) §16 identified as required before the eligibility engine could be implemented — composable profile statuses (§5A), status-aware and combination-mode-aware relaxation (§13, §14), status-gated eligibility (§14A), and an auditable qualification verification state (§7). Where this revision changes a table introduced earlier in this document (e.g. renaming `job_category_relaxations` to `job_relaxations`), the earlier section is updated in place rather than left inconsistent.

---

## 1. Database Goals

The database must support, end to end: user profiles linked to Supabase Auth; reference data for categories, states, and education; organizations/departments/job sources; jobs with per-post eligibility rules (age, category, state/domicile, gender, experience, qualification); saved jobs; job status lifecycle and history; AI extraction/import tracking; admin roles and audit logs — while staying extensible, because recruitment rules vary significantly between organizations and even between posts in the same notification.

## 2. Core Design Principles

- Relational-first: normalize structured, queryable data (age ranges, dates, foreign keys). Reserve JSONB for genuinely variable-shape data (e.g. raw AI extraction output, arbitrary rule metadata that doesn't warrant its own columns).
- Every foreign key is a real constraint, not an implied convention.
- No derived data stored unless it's a deliberate, invalidatable cache (see §19 on eligibility results).
- All timestamps are `timestamptz`, stored in UTC (§30).
- UUID primary keys (`uuid`, default `gen_random_uuid()`) for all application tables, to align with `auth.users.id` and avoid enumerable sequential IDs on user-facing/public tables.
- Every table that holds user-owned or admin-controlled data is designed with an explicit RLS policy in mind from the start (§26), not retrofitted later.
- Job/recruitment history is preserved, not overwritten (§21) — government notifications get amended, and users who saved a job need to see what changed.
- Category and eligibility logic lives in structured tables, never as delimited strings in application code or a single column (§12–§14).

---

## 3. Authentication

Supabase Auth (`auth.users`) is the sole owner of authentication: password, password hashing, sessions, tokens, email verification state, and password-reset flow. No application table stores or duplicates any of that.

**Relationship between `auth.users` and `profiles`:**

- `profiles.id` is both the primary key of `profiles` and a foreign key referencing `auth.users.id`, with `ON DELETE CASCADE`. This is a strict 1:1 relationship — `profiles.id uuid primary key references auth.users(id) on delete cascade`.
- **User creation:** a `profiles` row is created automatically via a Postgres trigger (`on_auth_user_created` on `auth.users`, `AFTER INSERT`) that calls a `security definer` function to insert a bare `profiles` row (id only; all product fields null until the user completes profile setup). This keeps profile bootstrapping server-side and atomic with signup — the client never inserts into `profiles` directly on registration.
- **User deletion:** deleting the `auth.users` row cascades to delete `profiles`, which in turn cascades to `saved_jobs` (see §20) via their own `ON DELETE CASCADE` foreign keys to `profiles.id`. This gives a clean, complete account-deletion path without orphaned data — required for the privacy/deletion principle in ARCHITECTURE.md §9.
- **Profile creation vs. profile setup:** "creation" (the bare row via trigger) and "setup" (the user filling in DOB/category/state/education, per PRD.md §7) are distinct steps. A profile with null required fields is treated by the application as "incomplete" and drives the onboarding flow, not a database-level distinction.
- Admin role assignment is **not** stored on `profiles` — see §24.

---

## 4. Users / Profiles

```
profiles
  id                    uuid PK, FK -> auth.users(id) ON DELETE CASCADE
  full_name             text, nullable
  date_of_birth         date, nullable
  category_id           uuid, nullable, FK -> categories(id)
  state_id              uuid, nullable, FK -> states(id)
  domicile_state_id     uuid, nullable, FK -> states(id)
  gender                text, nullable, CHECK (gender IN ('male','female','other','prefer_not_to_say'))
  education_level_id    uuid, nullable, FK -> education_levels(id)
  experience_years      numeric(4,1), nullable, CHECK (experience_years >= 0)
  created_at            timestamptz NOT NULL DEFAULT now()
  updated_at            timestamptz NOT NULL DEFAULT now()
```

| Field | Required | Editable | Sensitive | Notes |
|---|---|---|---|---|
| id | yes (system) | no | no | Mirrors `auth.users.id` |
| full_name | no | yes | no | Display only |
| date_of_birth | yes for eligibility, nullable in DB | yes | **yes** | Age computed on read, never stored (§13) |
| category_id | yes for eligibility, nullable in DB | yes | **yes** | FK, not a string (§5) |
| state_id | yes for eligibility, nullable in DB | yes | no | FK, not a string (§6) |
| domicile_state_id | optional | yes | no | Distinct from `state_id` — a user may reside in one state but hold domicile in another |
| gender | optional | yes | **yes** | Only collected because some notifications gate on it (PRD.md §7); nullable, never required at signup |
| education_level_id | yes for eligibility, nullable in DB | yes | no | FK (§7) |
| experience_years | optional | yes | no | Simple scalar; domain-specific experience is out of MVP scope (see §17) |

All "required for eligibility, nullable in DB" fields are intentionally nullable at the schema level: PRD.md §10.2 requires that missing profile data produce "unknown / requires verification," not a blocked signup or a fabricated default. Enforcing NOT NULL here would force the application to invent values.

`user_qualifications` (a separate table, see §7) holds the user's actual qualification(s), since a user may hold more than one.

---

## 5. Categories

```
categories
  id            uuid PK
  code          text UNIQUE NOT NULL        -- stable machine key, e.g. 'GENERAL','OBC','SC','ST','EWS'
  name          text NOT NULL               -- display name
  description   text, nullable
  parent_id     uuid, nullable, FK -> categories(id)   -- e.g. an OBC sub-variant referencing OBC
  is_active     boolean NOT NULL DEFAULT true
  created_at    timestamptz NOT NULL DEFAULT now()
  updated_at    timestamptz NOT NULL DEFAULT now()

category_aliases
  id            uuid PK
  category_id   uuid NOT NULL, FK -> categories(id) ON DELETE CASCADE
  alias         text NOT NULL       -- e.g. 'OBC-NCL', 'Backward Class', a state PSC's local label
  source_note   text, nullable      -- where this alias was observed (which org/state uses it)
  UNIQUE (category_id, alias)
```

**Approach:** `categories` is the canonical, versionable reference list of **reservation categories only** — General/UR, OBC, SC, ST, EWS. `category_aliases` lets a state PSC's differently-labeled category ("OBC-NCL", "BC-B") map onto a canonical category without forcing every source to agree on naming, satisfying PRD.md §8's requirement that the system not assume a single taxonomy. `parent_id` allows a future sub-category (e.g. an EWS variant) to be modeled as a child of an existing category without a schema change.

**Resolved decision (supersedes the earlier open question in this section):** PwD/PwBD, Ex-Servicemen, and similar concepts are **not** modeled as rows in `categories`. Per [ELIGIBILITY_ENGINE.md](./ELIGIBILITY_ENGINE.md) §8, a reservation category and a special status are different concepts — a candidate holds exactly one primary reservation category but zero-or-more independent special statuses, and the two compose rather than substitute for each other (e.g. an OBC candidate who is also PwBD). Forcing both into `categories` would make it impossible to represent that combination without inventing composite rows for every category × status pairing. Special statuses are modeled separately in §5A.

Job-level category rules (§14) reference `categories.id`, never a free-text category name. An extraction pipeline that encounters an unrecognized category string resolves it through `category_aliases`; if no match exists, the rule is stored as unresolved and the job is routed to `review_required` rather than guessing a mapping.

**Privacy:** `categories` itself is public reference data (just labels). The sensitive data is the *link* from a specific `profiles.category_id` to a specific user — governed by RLS (§26), never exposed on any public endpoint or admin listing beyond what's operationally necessary.

---

## 5A. Statuses (Composable Special Statuses)

```
statuses
  id            uuid PK
  code          text UNIQUE NOT NULL        -- stable machine key, e.g. 'PWBD','EX_SERVICEMAN','DEPARTMENTAL_CANDIDATE'
  name          text NOT NULL               -- display name, e.g. 'Person with Benchmark Disability'
  description   text, nullable
  is_active     boolean NOT NULL DEFAULT true
  created_at    timestamptz NOT NULL DEFAULT now()
  updated_at    timestamptz NOT NULL DEFAULT now()

profile_statuses
  id            uuid PK
  profile_id    uuid NOT NULL, FK -> profiles(id) ON DELETE CASCADE
  status_id     uuid NOT NULL, FK -> statuses(id)
  created_at    timestamptz NOT NULL DEFAULT now()
  UNIQUE (profile_id, status_id)
```

**Purpose:** represents independent special statuses — PwBD/PwD, Ex-Serviceman, Departmental Candidate, and any future status a notification grants relaxation or eligibility conditions for — kept structurally separate from `categories` per the resolved decision above. `statuses` is a plain reference list, seeded and admin-extensible exactly like `categories` (§35); no status name is ever hardcoded in application logic, satisfying this revision's explicit requirement.

**Composability, not exclusivity:** `profile_statuses` is a join table with no uniqueness constraint beyond `(profile_id, status_id)` itself — a profile may hold zero, one, or many status rows simultaneously, and holding a status never modifies or replaces `profiles.category_id`. The two are read together, not merged:

```
Profile:
  category_id  -> OBC              (profiles.category_id, exactly one, §4)
  statuses     -> PwBD, Ex-Serviceman   (profile_statuses, zero or more, this table)
```

This is a deliberate mirror of the existing `categories`/`profiles.category_id` pattern (same shape: reference table + FK/join), so it introduces no new architectural concept — only a second, independently-composable axis alongside category, exactly as [ELIGIBILITY_ENGINE.md](./ELIGIBILITY_ENGINE.md) §8 requires.

**Privacy:** identical treatment to `category_id` (§5) — `statuses` itself is public reference data; the link from a specific `profile_id` to a specific `status_id` is sensitive (a disability status in particular) and is governed by the same RLS posture as the rest of the profile (§26): a user manages only their own `profile_statuses` rows, no other user or public caller can read them.

**Job-side rules that reference statuses** (relaxation and gating) are covered in §14 and §14A, once the job rule tables they attach to have been introduced.

---

## 6. States

```
states
  id            uuid PK
  name          text NOT NULL UNIQUE      -- e.g. 'Telangana'
  code          text NOT NULL UNIQUE      -- e.g. 'TG', ISO 3166-2:IN style
  is_union_territory boolean NOT NULL DEFAULT false
  is_active     boolean NOT NULL DEFAULT true
```

All 28 states + 8 union territories are seed data (§35). Every place a "state" concept appears elsewhere in the schema (`profiles.state_id`, `profiles.domicile_state_id`, job state-restriction rules in §15) is a foreign key into this table — no repeated free-text state strings anywhere in the schema.

---

## 7. Education and Qualifications

```
education_levels
  id            uuid PK
  code          text UNIQUE NOT NULL      -- '10TH','12TH','DIPLOMA','ITI','UG','PG','DOCTORATE','PROFESSIONAL'
  name          text NOT NULL
  rank          smallint NOT NULL         -- ordering for "at least X level" comparisons, e.g. 10th=1 ... PG=5
  is_active     boolean NOT NULL DEFAULT true

qualifications
  id                  uuid PK
  education_level_id  uuid NOT NULL, FK -> education_levels(id)
  code                text UNIQUE NOT NULL   -- e.g. 'BTECH_CS', 'MBBS', 'BED', 'ANY_BACHELOR'
  name                text NOT NULL          -- 'B.Tech in Computer Science', 'Any Bachelor's Degree', ...
  field_of_study      text, nullable         -- 'Computer Science', 'Science', null if not field-specific
  is_generic          boolean NOT NULL DEFAULT false  -- true for "Any Bachelor's Degree"-style entries
  created_at          timestamptz NOT NULL DEFAULT now()

user_qualifications
  id                uuid PK
  profile_id        uuid NOT NULL, FK -> profiles(id) ON DELETE CASCADE
  qualification_id  uuid NOT NULL, FK -> qualifications(id)
  institution        text, nullable
  year_completed      smallint, nullable
  created_at         timestamptz NOT NULL DEFAULT now()
  UNIQUE (profile_id, qualification_id)

job_qualification_requirements
  id                  uuid PK
  job_post_id         uuid NOT NULL, FK -> job_posts(id) ON DELETE CASCADE
  qualification_id    uuid, nullable, FK -> qualifications(id)   -- null when education_level_id alone expresses the requirement
  education_level_id  uuid, nullable, FK -> education_levels(id)
  group_id            smallint NOT NULL DEFAULT 1     -- rows sharing a group_id are OR'd together
  verification_status text NOT NULL DEFAULT 'ai_extracted' CHECK (verification_status IN ('verified','ai_extracted','ambiguous','unsupported'))
  confidence_score    numeric(3,2), nullable CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1))
  parse_note          text, nullable
  created_at          timestamptz NOT NULL DEFAULT now()
  updated_at          timestamptz NOT NULL DEFAULT now()
```

**Trade-offs and recommended approach:**

- `education_levels` is a small, stable, ranked list — supports simple "minimum level" checks (e.g. "12th or above").
- `qualifications` covers specific degrees/fields ("B.Tech in Computer Science", "MBBS") and generic catch-alls ("Any Bachelor's Degree", `is_generic = true`), avoiding a combinatorial explosion of one row per real-world degree while still letting a job require something specific.
- `job_qualification_requirements` expresses **OR** by grouping rows under the same `group_id` for a given `job_post_id` (e.g. "B.Tech OR any Engineering Diploma" = two rows, same `group_id`), and **AND** by using different `group_id` values — evaluation requires *at least one row satisfied per distinct `group_id`*. This is a deliberately simple AND-of-ORs model, not a general boolean expression engine (PRD.md §16, "avoid unnecessarily complicated expression engine"). It covers every example in the requirements ("B.Tech OR equivalent diploma", "10+2 with Science", "Graduation required") without needing nested expression trees. If a future notification needs genuinely nested logic, that's a signal to revisit — not something to pre-build.
- A user can hold multiple `user_qualifications`; matching checks whether any of the user's qualifications satisfies each required `group_id`.

**Verification state (closes ELIGIBILITY_ENGINE.md §16 gap 4):** `verification_status` makes every requirement row's provenance and trustworthiness explicit and auditable, distinguishing raw AI output from admin-confirmed rules:
- `verified` — an admin/reviewer has explicitly confirmed this exact requirement against the source notification.
- `ai_extracted` — produced by extraction, not yet individually reviewed (the default; a job can still reach `published` with `ai_extracted` requirement rows only if the *job's own* status has passed through the required review gate at `review_required`/`approved` per §11 — this column tracks per-row confidence, not a substitute for that workflow).
- `ambiguous` — extraction or review flagged the requirement as unclear (e.g. the source phrasing didn't reduce cleanly to a group/qualification match).
- `unsupported` — the requirement expresses a condition the current qualification model (§7) cannot represent at all (e.g. a genuinely nested boolean condition beyond AND-of-OR).

The eligibility engine (ELIGIBILITY_ENGINE.md §13 point 8) treats any row that is not `verified` or confidently `ai_extracted` as contributing `needs_verification` rather than a clean pass — **a low-confidence or unverified row must never silently produce `eligible`**, per this revision's explicit requirement. `confidence_score` (0–1, nullable) may optionally be populated by the extraction pipeline to help admins triage review queues, but it is documentation-only input for humans — the engine never treats a numeric AI confidence score as authoritative on its own; only `verification_status` (a value an admin or the deterministic pipeline sets) drives evaluation behavior. `parse_note` carries the same "why this is ambiguous/unsupported" free-text pattern already used on `job_age_rules`, `job_category_relaxations`/`job_relaxations`, and `job_experience_rules` (§13, §14, §17), so all rule tables now follow one consistent confidence-and-provenance convention.

---

## 8. Organizations

```
organizations
  id            uuid PK
  name          text NOT NULL UNIQUE     -- 'Union Public Service Commission', 'Railway Recruitment Board - Chennai'
  short_code    text, nullable UNIQUE    -- 'UPSC', 'RRB-MAS'
  org_type      text NOT NULL CHECK (org_type IN ('central','state','psu','autonomous_body','other'))
  state_id      uuid, nullable, FK -> states(id)   -- set for state-level bodies, null for central/all-India bodies
  website_url   text, nullable
  is_active     boolean NOT NULL DEFAULT true
  created_at    timestamptz NOT NULL DEFAULT now()
  updated_at    timestamptz NOT NULL DEFAULT now()

departments
  id              uuid PK
  organization_id uuid NOT NULL, FK -> organizations(id) ON DELETE CASCADE
  name            text NOT NULL
  is_active       boolean NOT NULL DEFAULT true
  UNIQUE (organization_id, name)
```

`departments` belongs to exactly one `organizations` row (e.g. Railway Recruitment Board → "Mechanical Department"). No example organizations/departments are hardcoded into the schema itself — they are seed/admin-entered data, matching PRD.md's requirement not to assume a fixed set of recruiting bodies.

---

## 9. Job Sources

```
job_sources
  id                uuid PK
  organization_id   uuid, nullable, FK -> organizations(id)
  name              text NOT NULL
  official_domain   text NOT NULL         -- e.g. 'upsc.gov.in', used to validate URLs (below)
  source_type       text NOT NULL CHECK (source_type IN ('official_website','official_portal','official_pdf','api','manual_admin_entry'))
  source_url        text NOT NULL
  is_active         boolean NOT NULL DEFAULT true
  last_checked_at   timestamptz, nullable
  created_at        timestamptz NOT NULL DEFAULT now()
  updated_at        timestamptz NOT NULL DEFAULT now()
```

**URL validation and source trust:** at the database layer, `source_url` and the advertisement/application URLs on `jobs` (§10) are constrained to well-formed absolute HTTPS URLs via a `CHECK` constraint (regex or `similar to`, permissive but rejecting obviously malformed values); this is a syntactic guard, not a trust guarantee. Trust is established at the application layer: `official_domain` records the domain admins have verified as the organization's legitimate site, and ingestion/review workflow (ARCHITECTURE.md §5, §8) checks that scraped/extracted URLs resolve to that domain (or an explicitly allow-listed related domain) before a job can move to `approved`. `manual_admin_entry` sources exist for jobs an admin adds by hand without an automated pipeline (the MVP's primary path per PRD.md §20) — these still require `source_url` to be filled in, just entered by a human rather than a crawler.

---

## 10. Jobs — `recruitment` vs `job_posts`

**Decision: use a two-table model — `job_notifications` (the recruitment notification) and `job_posts` (individual posts/positions within it) — rather than a single flat `jobs` table.**

Rationale: PRD.md §9 and §16 explicitly require supporting multiple posts with *different* age/category/qualification/state rules inside one notification (e.g. one UPSC notification covering several distinct posts, each with its own vacancy count and eligibility criteria). A single-table design would force either (a) duplicating the whole notification row per post, muddying "one notification, many posts" semantics and complicating history/status tracking, or (b) cramming per-post variation into JSONB, which PRD.md and the core principles (§2) both discourage for genuinely structured, queryable data like age ranges and category rules. The two-table split keeps notification-level fields (organization, source, advertisement URL, overall dates, status) in one place and post-level variation (title, vacancy count, and its own eligibility rules) in another, each independently queryable and indexable.

This is chosen over the alternative of naming the parent table `jobs` because "job" in PRD.md/user-facing language actually means "the thing a user browses and applies to," which is closer to a **post** than a notification — a UPSC CDS notification is one row in `job_notifications`, but a user searching for "Assistant Commandant" finds a `job_posts` row. The application-facing term "job" maps to `job_posts`; `job_notifications` is the underlying recruitment event. This naming is flagged for confirmation — see §36.

```
job_notifications
  id                        uuid PK
  organization_id           uuid NOT NULL, FK -> organizations(id)
  department_id             uuid, nullable, FK -> departments(id)
  source_id                 uuid NOT NULL, FK -> job_sources(id)
  title                     text NOT NULL              -- notification-level title, e.g. "CDS Examination (II), 2026"
  slug                      text NOT NULL UNIQUE
  description               text, nullable
  recruitment_type          text NOT NULL CHECK (recruitment_type IN ('direct','promotion','contract','deputation','other'))
  official_advertisement_url text NOT NULL CHECK (official_advertisement_url ~* '^https://')
  official_application_url  text, nullable CHECK (official_application_url IS NULL OR official_application_url ~* '^https://')
  notification_date         date NOT NULL
  application_start_date    date, nullable
  application_end_date      date, nullable
  status                    text NOT NULL DEFAULT 'discovered' REFERENCES job_statuses(code)   -- see §11
  created_at                timestamptz NOT NULL DEFAULT now()
  updated_at                timestamptz NOT NULL DEFAULT now()
  published_at              timestamptz, nullable
  expires_at                timestamptz, nullable
  CHECK (application_end_date IS NULL OR application_start_date IS NULL OR application_end_date >= application_start_date)

job_posts
  id                     uuid PK
  job_notification_id    uuid NOT NULL, FK -> job_notifications(id) ON DELETE CASCADE
  title                  text NOT NULL           -- post-level title, e.g. "Assistant Commandant"
  vacancy_count          integer, nullable CHECK (vacancy_count IS NULL OR vacancy_count >= 0)
  pay_scale_min          numeric(12,2), nullable
  pay_scale_max          numeric(12,2), nullable
  pay_scale_note         text, nullable          -- e.g. "Level 10, 7th CPC" where a simple range doesn't capture it
  created_at             timestamptz NOT NULL DEFAULT now()
  updated_at             timestamptz NOT NULL DEFAULT now()
```

Salary is modeled as a numeric min/max plus a free-text note: government pay scales (pay level, grade pay, matrix) don't reduce cleanly to a single number, so the note field carries the authoritative human-readable description while min/max support range-based filtering (PRD.md §11 filter by salary).

`jobs` as a user-facing concept = a `job_posts` row joined to its parent `job_notifications` row. All PRD.md references to "job" (job detail page, saved jobs, latest jobs) resolve to `job_posts.id` as the primary browsable entity, denormalized-read via a view or join, not a separate physical `jobs` table.

---

## 11. Job Status

```
job_statuses
  code          text PK      -- 'discovered','imported','processing','review_required','approved','published','expired','archived'
  description   text NOT NULL
  sort_order    smallint NOT NULL
```

**Decision: lookup table, not a PostgreSQL enum, not a bare validated string.**

Reasoning: a native `ENUM` type is rigid — adding a status requires `ALTER TYPE`, which has historically had transaction/locking friction, and enum values can't carry a description or ordering metadata. A bare `text` column with only application-level validation risks drift between what the app permits and what's actually stored. A lookup table (`job_statuses`) referenced by FK gets the same referential integrity as an enum, is trivially extensible via a migration + seed insert, and can carry `description`/`sort_order` for admin UI. This mirrors the `categories`/`states` pattern already used elsewhere in this schema, keeping the conventions consistent.

`job_notifications.status` (and implicitly, whether a `job_posts` row is "live") is a FK to `job_statuses.code`.

**Status meanings and valid transitions:**

| Status | Meaning | Valid next states |
|---|---|---|
| `discovered` | A potential job/notification identified from a monitored source but not yet fetched | `imported`, `archived` |
| `imported` | Raw source content fetched and stored | `processing`, `archived` |
| `processing` | Extraction/normalization in progress (may be AI-assisted) | `review_required`, `archived` |
| `review_required` | Structured data exists but needs admin review | `approved`, `processing` (kicked back for re-extraction), `archived` |
| `approved` | Admin has verified the data as accurate; not yet visible to users | `published`, `review_required` (if an issue is found before publish) |
| `published` | Visible to end users | `expired`, `archived`, `review_required` (correction needed post-publish) |
| `expired` | Application deadline has passed | `archived` |
| `archived` | Terminal state; removed from standard views, retained for audit/history | (none — terminal) |

Transitions are enforced at the application/service layer (ARCHITECTURE.md's domain layer), not via a database trigger, since transition rules involve business context (e.g. "who is allowed to approve") beyond what SQL constraints can express cleanly. The lookup table guarantees only that the *value* is one of the known statuses, not that a given transition is legal.

---

## 12. Eligibility Rules — Overview

Eligibility rules are modeled as a set of typed, structured tables — one concern per table — attached to a `job_posts` row, rather than a single field or a single generic "rules" JSONB blob. This directly satisfies PRD.md §12/CLAUDE.md's requirement that eligibility be deterministic, testable, and explainable: each rule type has its own columns with real types (dates, numbers, FKs), so the eligibility engine (docs/ELIGIBILITY_ENGINE.md, not yet authored) can evaluate each one independently and produce a per-rule reason, matching the example format in PRD.md §10.3.

The rule tables introduced below (§13–§17) are:

- `job_age_rules` (one row per `job_posts`; also carries the per-post relaxation combination mode — §13)
- `job_relaxations` (one row per applicable category *or* status per `job_posts` — renamed and widened from the earlier `job_category_relaxations`; §14)
- `job_status_requirements` (status-gated eligibility — required/optional/preference — distinct from relaxation; §14A)
- `job_state_rules` (one row per `job_posts`, or one row per allowed state — see §15)
- `job_gender_rules` (one row per `job_posts`)
- `job_experience_rules` (one row per `job_posts`)
- `job_qualification_requirements` (already defined in §7, now with a `verification_status`)

Any rule table row that doesn't exist for a given `job_post_id` means "this dimension is unrestricted / not specified" — the engine treats an absent age rule as "no age restriction," not as "unknown." A rule that *exists* but has an ambiguous/unsupported shape (e.g. an extraction that couldn't confidently parse a relaxation table) is what drives "unknown / requires verification," via an explicit `is_confident boolean` / `parse_note` pattern used across the rule tables below (and the equivalent `verification_status` pattern on `job_qualification_requirements`, §7).

---

## 13. Age Rules

```
job_age_rules
  id                          uuid PK
  job_post_id                 uuid NOT NULL UNIQUE, FK -> job_posts(id) ON DELETE CASCADE
  min_age                     smallint, nullable CHECK (min_age IS NULL OR min_age >= 0)
  max_age                     smallint, nullable CHECK (max_age IS NULL OR max_age >= 0)
  age_cutoff_date             date NOT NULL          -- the reference date age is computed against for this post
  relaxation_combination_mode text NOT NULL DEFAULT 'unsupported'
                               CHECK (relaxation_combination_mode IN ('additive','max_of','mutually_exclusive','unsupported'))
  is_confident                boolean NOT NULL DEFAULT true
  parse_note                  text, nullable
  CHECK (min_age IS NULL OR max_age IS NULL OR max_age >= min_age)
```

The user's age is **never** stored — `profiles.date_of_birth` is the only persisted fact; age is always computed at evaluation time as `age_cutoff_date - date_of_birth`, per PRD.md §13's explicit instruction. `age_cutoff_date` lives per `job_post_id` (not globally "today") because different notifications, and even different posts within one notification, can specify different reference dates (e.g. "age as on 01/08/2026").

Leap-year DOBs (Feb 29) are handled at the application layer using a single documented convention (age counted as reached on March 1 in non-leap years) — this is an application/domain-logic concern, not a schema concern, and is called out here so it isn't silently decided differently in two places later.

Category- and status-based relaxation are **not** columns on this table — they live in `job_relaxations` (§14), joined against `job_age_rules.max_age` at evaluation time, so a job with "max 30, +5 for SC/ST, +10 for PwBD" doesn't need one column per possible relaxation combination.

**`relaxation_combination_mode` (closes ELIGIBILITY_ENGINE.md §7/§16 gap 2):** this field is placed here, on `job_age_rules`, rather than on `job_relaxations` or as a new standalone table, because it is a **per-post** setting — "how do this post's applicable relaxations combine" is a single fact about the post as a whole, not something that varies per relaxation row, and `job_age_rules` is already the one-row-per-`job_post_id` table that owns every other post-level age fact. Placing it anywhere else (e.g. duplicated onto every `job_relaxations` row for the post) would risk two rows for the same post disagreeing about their own combination mode, which cannot be a meaningful state. The four supported values map directly onto [ELIGIBILITY_ENGINE.md](./ELIGIBILITY_ENGINE.md) §7:
- `additive` — applicable relaxations from multiple statuses/categories sum.
- `max_of` — only the single largest applicable relaxation applies.
- `mutually_exclusive` — the post's category/status taxonomy is structured so a candidate is never classified under more than one relaxation-bearing bucket at once (no stacking decision is ever actually needed).
- `unsupported` (the default) — the notification's stacking behavior is not stated clearly enough, or extraction could not confidently determine it; a post left at this default with two or more applicable relaxations for a given user routes that user's age dimension to `needs_verification`, per ELIGIBILITY_ENGINE.md §7 — **the engine never assumes additive stacking by default.**

---

## 14. Category & Status Relaxation Rules

**Renamed and widened from the earlier `job_category_relaxations` to `job_relaxations`, to close ELIGIBILITY_ENGINE.md §16 gap 2 (a status-keyed relaxation table) without duplicating the age-rule model.**

```
job_relaxations
  id                    uuid PK
  job_post_id           uuid NOT NULL, FK -> job_posts(id) ON DELETE CASCADE
  category_id           uuid, nullable, FK -> categories(id)
  status_id             uuid, nullable, FK -> statuses(id)
  age_relaxation_years  smallint NOT NULL DEFAULT 0 CHECK (age_relaxation_years >= 0)
  is_confident          boolean NOT NULL DEFAULT true
  parse_note            text, nullable
  created_at            timestamptz NOT NULL DEFAULT now()
  CHECK (
    (category_id IS NOT NULL AND status_id IS NULL) OR
    (category_id IS NULL AND status_id IS NOT NULL)
  )
  UNIQUE (job_post_id, category_id, status_id)
```

**One row per `(job_post_id, category_id)` or `(job_post_id, status_id)`** — e.g. `(post_123, category=SC) -> +5`, `(post_123, category=OBC) -> +3`, `(post_123, status=PwBD) -> +10`, `(post_123, status=EX_SERVICEMAN) -> +3`. The `CHECK` constraint enforces that every row is keyed by *exactly one* of category or status, never both and never neither — this is the "keep it relational, avoid duplicating the age-rule model" requirement satisfied directly: rather than a second parallel `job_status_relaxations` table with its own near-identical shape, category and status relaxation share one table and one evaluation code path, differing only in which FK is populated. A category or status with no row for a given post is treated as "no relaxation specified" (evaluated as 0, per §3's absent-row convention), or as "unknown" if the post's other categories/statuses *do* have explicit relaxation rows and this one is conspicuously missing — an application-layer judgment call, not a schema one. This keeps category **and** status relaxation logic entirely in data, never hardcoded in application code, per PRD.md §14 and this revision's explicit requirement not to hardcode status names.

This table only expresses *age* relaxation, since that's the dominant real-world case (reservation of vacancies itself — how many seats are reserved per category — is a recruitment/HR detail out of scope for an eligibility-checker product; PRD.md focuses on "can this user apply," not "how many seats are set aside"). How multiple applicable rows for the *same user* on the *same post* combine (e.g. a user who is both OBC and PwBD, each with their own row here) is governed entirely by `job_age_rules.relaxation_combination_mode` (§13), not by anything in this table — `job_relaxations` only ever states individual, single-status/category relaxation facts; it never encodes combination logic itself.

---

## 14A. Status-Gated Eligibility

**New section, closing ELIGIBILITY_ENGINE.md §16 gap 3 — a representation for status-*gated* (not merely status-*relaxed*) eligibility.**

```
job_status_requirements
  id                uuid PK
  job_post_id       uuid NOT NULL, FK -> job_posts(id) ON DELETE CASCADE
  status_id         uuid NOT NULL, FK -> statuses(id)
  requirement_type  text NOT NULL CHECK (requirement_type IN ('required','optional','preference'))
  is_confident      boolean NOT NULL DEFAULT true
  parse_note        text, nullable
  created_at        timestamptz NOT NULL DEFAULT now()
  UNIQUE (job_post_id, status_id)
```

This table is distinct from `job_relaxations` (§14) — it answers "must/may/should the user hold this status to be considered for this post at all," not "how much age relaxation does this status grant." A post can have rows in both tables for the same status (e.g. a post reserved for Ex-Servicemen that *also* grants them an age relaxation), or only one.

**`requirement_type` values:**
- `required` — the post is gated on this status: a user without it fails the dimension outright (`not_eligible` if the profile confidently shows the status is absent, `needs_verification` if the profile simply hasn't recorded any statuses and therefore the absence can't be confirmed — see the null-vs-empty handling note below). Example: a post reserved exclusively for Ex-Servicemen.
- `optional` — the notification explicitly states the status is not a gating condition (e.g. "open to all; Ex-Servicemen may also apply under this category") — informational only, never fails the dimension, exists mainly so extraction has somewhere to put an explicit "not required" statement rather than omitting the row entirely.
- `preference` — the notification expresses a preference for candidates holding this status (e.g. "preference will be given to...") without making it a hard requirement. **Per this revision's explicit instruction, `preference` must never be treated as an eligibility gate** — the eligibility engine treats a `preference` row identically to no row at all for pass/fail purposes (the dimension is unrestricted), and surfaces the preference to the user only as informational text on the job detail page (consistent with the "conditions outside the engine's modeled scope are shown informationally, not evaluated" pattern in ELIGIBILITY_ENGINE.md §14), never as a factor that could downgrade an otherwise-eligible result.

**Null-vs-empty distinction for `required` rows:** because `profile_statuses` (§5A) is a join table with no rows meaning "confirmed to hold no statuses" is indistinguishable at the schema level from "hasn't been asked" — both are simply zero rows. The eligibility engine (not this schema) is responsible for treating a `required` status check against a profile with zero `profile_statuses` rows as `needs_verification` by default rather than an automatic `not_eligible`, since the schema alone cannot express "the user was asked and confirmed no" versus "the user has never been asked." This mirrors how a null `profiles.gender` is treated (§11) and is noted here so implementers don't assume the schema encodes certainty it does not have.

Absence of any `job_status_requirements` row for a post means the post has no status-gating at all — the ordinary §3 absent-row convention.

---

## 15. State / Domicile Rules

```
job_state_scope
  id                uuid PK
  job_post_id       uuid NOT NULL UNIQUE, FK -> job_posts(id) ON DELETE CASCADE
  scope_type        text NOT NULL CHECK (scope_type IN ('all_india','specific_states','domicile_required'))

job_state_scope_states
  id                uuid PK
  job_state_scope_id uuid NOT NULL, FK -> job_state_scope(id) ON DELETE CASCADE
  state_id          uuid NOT NULL, FK -> states(id)
  UNIQUE (job_state_scope_id, state_id)
```

`scope_type = 'all_india'` needs no rows in `job_state_scope_states`. `'specific_states'` (a post open only to certain states' residents, without necessarily requiring domicile) or `'domicile_required'` (must hold domicile in a listed state) both populate one row per eligible state in `job_state_scope_states`, supporting multi-state postings. The engine evaluates `scope_type = 'domicile_required'` against `profiles.domicile_state_id`, and `'specific_states'` against `profiles.state_id` — reflecting PRD.md §16's explicit instruction that current-state and domicile are distinct concepts and must not be conflated.

---

## 16. Gender Rules

```
job_gender_rules
  id            uuid PK
  job_post_id   uuid NOT NULL UNIQUE, FK -> job_posts(id) ON DELETE CASCADE
  allowed_gender text NOT NULL CHECK (allowed_gender IN ('all','male','female','other'))
```

Absence of a row for a `job_post_id` means unrestricted (equivalent to `'all'`); the row only needs to exist when a post is gender-restricted, keeping the common case (no restriction) free of boilerplate rows. `profiles.gender` remains optional and is only consulted when a job actually has a `job_gender_rules` row — matching PRD.md §16's requirement not to require gender for every user.

---

## 17. Experience Rules

```
job_experience_rules
  id                    uuid PK
  job_post_id           uuid NOT NULL UNIQUE, FK -> job_posts(id) ON DELETE CASCADE
  min_years              numeric(4,1), nullable CHECK (min_years IS NULL OR min_years >= 0)
  max_years              numeric(4,1), nullable
  domain_note            text, nullable     -- e.g. "in a teaching hospital", free text since domain taxonomy is out of MVP scope
  as_of_date             date, nullable     -- cutoff date experience is measured against, if specified
  is_confident           boolean NOT NULL DEFAULT true
  parse_note             text, nullable
```

Kept intentionally simple — a numeric range plus a free-text domain note — rather than a structured "experience domain" taxonomy, since PRD.md marks experience matching as a lower-priority, "job-specific conditions" concern and over-modeling it now would be speculative. `profiles.experience_years` (a single scalar, §4) is compared against `min_years`/`max_years`; `domain_note` is surfaced to the user as an "unknown, please verify" flag rather than being machine-matched against `domain_note`-like text on the profile — matching text fields against each other is not attempted at the database or engine level.

---

## 18. Job Qualification Requirements

Covered in §7 (`job_qualification_requirements`) — presented there rather than duplicated, since qualifications and their job-level requirements are one coherent concern.

---

## 19. Eligibility Result

**Decision: eligibility is calculated dynamically at read time; results are not persisted as the source of truth. A short-lived, explicitly invalidated cache MAY be added later purely for performance, never as authoritative data.**

Rationale: PRD.md §10.4 and CLAUDE.md both require eligibility to be deterministic and reproducible from current rules and current profile data — persisting a stale result risks showing a user a verdict that no longer matches their actual profile or the job's actual rules (e.g. after they edit their profile, or an admin corrects a category relaxation). Given the MVP's scale (PRD.md/§33: thousands of users, not millions, initially), on-demand calculation joined across `job_age_rules`, `job_relaxations`, `job_status_requirements`, `job_state_scope`, `job_gender_rules`, `job_experience_rules`, and `job_qualification_requirements` for a single job/user pair is cheap — this is not a heavy aggregation.

If/when a persisted cache is introduced (post-MVP, only if profiling shows it's needed), it would look like:

```
eligibility_results   -- NOT part of MVP; documented for future reference only
  id              uuid PK
  profile_id      uuid NOT NULL, FK -> profiles(id) ON DELETE CASCADE
  job_post_id     uuid NOT NULL, FK -> job_posts(id) ON DELETE CASCADE
  status          text NOT NULL CHECK (status IN ('eligible','not_eligible','unknown'))
  checks          jsonb NOT NULL      -- array of {rule, status, reason} — genuinely variable shape, appropriate JSONB use
  rules_version   text NOT NULL       -- hash/version stamp of the rule rows used, to detect staleness
  checked_at      timestamptz NOT NULL DEFAULT now()
  UNIQUE (profile_id, job_post_id)
```

`checks` is exactly the case where JSONB is appropriate per §2: an ordered list of heterogeneous per-rule explanations is not naturally relational, and nothing needs to query *inside* it independently of the row it belongs to. Such a cache would need explicit invalidation on: profile update (any eligibility-relevant field), any change to that job's rule tables, or a job status change — each of those is a natural trigger point in the application layer, not something to build prematurely.

---

## 20. Saved Jobs

```
saved_jobs
  id            uuid PK
  profile_id    uuid NOT NULL, FK -> profiles(id) ON DELETE CASCADE
  job_post_id   uuid NOT NULL, FK -> job_posts(id) ON DELETE CASCADE
  saved_at      timestamptz NOT NULL DEFAULT now()
  UNIQUE (profile_id, job_post_id)
```

The unique constraint on `(profile_id, job_post_id)` prevents saving the same job twice at the database level (not just application-level de-duplication). "Removing" a saved job is a hard `DELETE` of the row — there's no product requirement to retain history of *what was once saved*, unlike job history itself (§21). Whether a saved job is expired is not a stored flag on `saved_jobs`; it's derived at read time from the joined `job_posts` → `job_notifications.status`/`expires_at`, avoiding a duplicated, driftable boolean.

---

## 21. Job History

```
job_history
  id                  uuid PK
  job_notification_id uuid NOT NULL, FK -> job_notifications(id) ON DELETE CASCADE
  job_post_id         uuid, nullable, FK -> job_posts(id) ON DELETE CASCADE   -- null when the change is notification-level
  changed_by          uuid, nullable, FK -> auth.users(id) ON DELETE SET NULL  -- null for system/automated changes, or once the acting user's account is deleted
  field_name          text NOT NULL          -- e.g. 'application_end_date', 'vacancy_count', 'status'
  old_value           text, nullable
  new_value           text, nullable
  change_reason       text, nullable         -- e.g. 'deadline extended per corrigendum dated ...'
  changed_at          timestamptz NOT NULL DEFAULT now()
```

Every meaningful field change on `job_notifications` or `job_posts` (deadline extended, vacancy count revised, advertisement/application URL changed, status transition) is appended here by the application service layer at the point of the update — this table is append-only; rows are never edited or deleted. `old_value`/`new_value` are stored as `text` rather than typed per-field, since the table spans many different underlying column types and this is a generic audit trail, not a source of query-time truth (the current value always lives on `job_notifications`/`job_posts` directly). This satisfies PRD.md's requirement that government sources changing a notification be tracked, not silently overwritten.

`changed_by` uses `ON DELETE SET NULL`, not `ON DELETE CASCADE` and not the default `ON DELETE RESTRICT` — deleting a user's account (§3, `auth.users` deletion) must never cascade into deleting or blocking deletion of job history, since the historical record of *what changed* is operational data about the job, not the user's personal data, and PRD.md/§29 require that recruitment history never be deleted unnecessarily. `SET NULL` preserves the change record while removing its link to the now-deleted account, consistent with the account-deletion/privacy requirements in SECURITY.md §23.

---

## 22. AI Import / Extraction

```
job_imports
  id                    uuid PK
  job_source_id         uuid NOT NULL, FK -> job_sources(id)
  job_notification_id   uuid, nullable, FK -> job_notifications(id)   -- set once a notification row exists
  source_url            text NOT NULL
  document_url          text, nullable          -- e.g. the specific PDF fetched
  status                text NOT NULL CHECK (status IN ('discovered','downloaded','extracted','parsed','validation_failed','review_required','approved','rejected'))
  ai_provider           text, nullable           -- e.g. 'anthropic'
  ai_model              text, nullable           -- e.g. 'claude-sonnet-5'
  raw_extraction_output jsonb, nullable          -- exactly what the model returned, untouched
  validation_errors     jsonb, nullable          -- structured list of validation failures, if any
  extracted_at          timestamptz, nullable
  reviewed_by           uuid, nullable, FK -> auth.users(id) ON DELETE SET NULL  -- null before review, or once the reviewing user's account is deleted
  reviewed_at           timestamptz, nullable
  review_notes          text, nullable
  created_at            timestamptz NOT NULL DEFAULT now()
  updated_at            timestamptz NOT NULL DEFAULT now()
```

`reviewed_by` uses `ON DELETE SET NULL` for the same reason as `job_history.changed_by` above: an import/extraction record is provenance data about how a published job came to exist, not the reviewing user's personal data, so deleting that user's account must not delete or block deletion of the import record — only the identity link is removed.

`raw_extraction_output` and `validation_errors` are JSONB by design — this is precisely the "genuinely variable structure" case from §2: raw AI output shape depends on the model/prompt version and must be inspectable as-received for debugging and trust review (CLAUDE.md: "AI output is untrusted input"), not normalized into columns until it's been validated. Once validated and approved, the *normalized* result is written into the real relational tables (`job_notifications`, `job_posts`, `job_age_rules`, `job_relaxations`, `job_status_requirements`, `job_qualification_requirements`, etc.) — `job_imports` never becomes the read path for published job data, only the audit trail of how it got there. `job_notification_id` starts null and is populated once extraction produces (or is matched to) an actual notification row, giving full traceability from AI output to the published record it produced.

**Lifecycle mapping (raw output vs. authoritative rule, kept distinguishable end to end):**

```
AI extraction              → job_imports.raw_extraction_output (untouched, JSONB)
  ↓
validation                 → job_imports.validation_errors populated if invalid;
                              status moves to 'validation_failed' or 'parsed'
  ↓
normalization               → structured candidate values derived from raw output,
                              held in application memory / a draft state until write
  ↓
verification / review       → an admin reviews the normalized candidate against the
                              source; on the rule tables themselves this is recorded
                              per-row via `is_confident`/`parse_note` (job_age_rules,
                              job_relaxations, job_status_requirements, job_state_scope,
                              job_gender_rules, job_experience_rules) or the equivalent
                              `verification_status` (job_qualification_requirements, §7)
  ↓
published rule              → the same rule-table row, now `is_confident = true` /
                              `verification_status = 'verified'` (or left at a lower
                              confidence deliberately, if the reviewer confirms the
                              *source itself* is ambiguous rather than the extraction
                              being wrong) — this is the only representation the
                              eligibility engine ever reads
```

At every step, `job_imports.raw_extraction_output` remains untouched and permanently distinguishable from whatever the rule tables end up holding — even after a row is corrected by a human reviewer, the original AI output that prompted the correction is still inspectable in `job_imports`, satisfying PRD.md's requirement that AI output never become indistinguishable from verified, authoritative data.

---

## 23. Documents / Advertisements

```
job_documents
  id                    uuid PK
  job_notification_id   uuid NOT NULL, FK -> job_notifications(id) ON DELETE CASCADE
  document_type         text NOT NULL CHECK (document_type IN ('advertisement','corrigendum','result','other'))
  source_url            text NOT NULL CHECK (source_url ~* '^https://')
  storage_path          text, nullable        -- Supabase Storage path, if the platform mirrors the file
  checksum              text, nullable        -- sha256 of the downloaded file, to detect if the source silently changed it
  version               smallint NOT NULL DEFAULT 1
  published_date        date, nullable        -- date the document itself claims to be published
  downloaded_at          timestamptz, nullable
  created_at            timestamptz NOT NULL DEFAULT now()
  UNIQUE (job_notification_id, source_url, version)
```

A document is only physically mirrored into Supabase Storage (`storage_path` populated) when the platform chooses to cache it (e.g. for stability if the source later 404s); the `source_url` is always retained regardless, since the official advertisement link must always be available per PRD.md §12. `checksum` lets the system detect that a government source silently replaced a PDF at the same URL — triggering a re-review rather than assuming content is unchanged. `version` + the unique constraint allow a corrigendum to be stored as a new row rather than overwriting history, consistent with §21.

---

## 24. Admin Users

```
admin_roles
  code          text PK      -- 'super_admin','admin','editor','reviewer'
  description   text NOT NULL

admin_role_assignments
  id            uuid PK
  user_id       uuid NOT NULL, FK -> auth.users(id) ON DELETE CASCADE
  role_code     text NOT NULL, FK -> admin_roles(code)
  granted_by    uuid, nullable, FK -> auth.users(id) ON DELETE SET NULL  -- null if granted by a system process, or once the granting user's account is deleted
  granted_at    timestamptz NOT NULL DEFAULT now()
  UNIQUE (user_id, role_code)
```

Admin authorization is **not** an `is_admin boolean` on `profiles` — that pattern is trivially spoofable if any client-side logic ever reads it, and conflates "has a profile" with "has elevated privilege," which are different concerns. `admin_role_assignments` is a separate table with its own RLS (readable only by the user themself and other admins, writable only by `super_admin`), and every server-side authorization check (RLS policies on admin-managed tables, and application-layer route guards) resolves role by querying this table — never trusting a client-supplied role claim, per CLAUDE.md. Role granularity (`super_admin` > `admin` > `editor` > `reviewer`, roughly: full control > manage jobs/sources > edit/extract > review/approve only) is intentionally coarse for MVP; a full permissions-matrix table is not built until a real need for finer-grained permissions appears.

**`granted_by` uses `ON DELETE SET NULL`** (resolved in Phase 2.1; previously left as the default `NO ACTION`, which was a genuine inconsistency with the other actor-reference columns below, not a deliberate design choice). `user_id` — *whose* role this row grants — correctly uses `ON DELETE CASCADE`: if the assignee's account is deleted, the assignment itself is meaningless and should disappear with it. `granted_by` — *who granted it* — is different: it is provenance/audit data about how the assignment came to exist, exactly like `job_history.changed_by`, `job_imports.reviewed_by`, and `audit_logs.actor_id` (§21, §22, §25). Deleting the granting admin's own account must never cascade into deleting *other users'* role assignments, and must never be blocked by the fact that some past grant still references them — the historical fact "this role was granted, and by whom, at the time" must survive account deletion (SECURITY.md §23), with only the now-dangling identity reference nulled. This makes all four actor-reference columns in the schema follow one uniform rule.

---

## 25. Audit Logs

```
audit_logs
  id            uuid PK
  actor_id      uuid, nullable, FK -> auth.users(id) ON DELETE SET NULL     -- null for system-initiated events, or once the acting user's account is deleted
  event_type    text NOT NULL          -- 'job_created','job_published','job_unpublished','job_expired','eligibility_rule_changed','admin_role_changed','source_changed', ...
  entity_table  text NOT NULL          -- e.g. 'job_notifications'
  entity_id     uuid NOT NULL
  metadata      jsonb, nullable        -- event-specific structured detail, e.g. {"old_role":"editor","new_role":"admin"}
  created_at    timestamptz NOT NULL DEFAULT now()
```

`audit_logs` is deliberately generic (entity table + id + event type) rather than one table per event type, since the set of auditable event types will grow and a single append-only log is simpler to query chronologically ("show me everything that happened to job X" or "show me everything admin Y did"). It is distinct from `job_history` (§21): `job_history` is a field-level before/after diff scoped to job data specifically (feeds the job detail page's "last updated" info and admin correction workflows), while `audit_logs` is a broader security/compliance event trail covering admin role changes and publish/unpublish actions across the system. `metadata` never stores sensitive user profile data (e.g. no DOB/category values embedded in an audit row) — only IDs and non-sensitive event context, per the instruction to avoid logging sensitive user information unnecessarily.

`actor_id` uses `ON DELETE SET NULL`, for the same reason as `job_history.changed_by` and `job_imports.reviewed_by` above: the audit event itself (what happened, to what, when) is the record of value and must survive account deletion intact, while the link to a deleted account's identity is removed rather than the event being deleted or the account deletion being blocked. Across all three tables, this is the uniform rule: **account deletion (§3, §23-equivalent privacy requirement) must never delete or invalidate historical audit information — only the now-dangling personal-identity reference is nulled.**

---

## 26. Row Level Security

RLS is enabled on every table below; policies are described conceptually here (no SQL yet, per task constraints).

| Table | Public (anon) | Authenticated user (own data) | Authenticated user (others') | Admin |
|---|---|---|---|---|
| `profiles` | no access | SELECT/UPDATE own row (`id = auth.uid()`) | no access | full SELECT (support/review needs only); UPDATE not needed |
| `user_qualifications` | no access | full CRUD on own rows (`profile_id = auth.uid()`) | no access | SELECT for support |
| `profile_statuses` | no access | full CRUD on own rows (`profile_id = auth.uid()`) | no access | SELECT for support (same posture as `user_qualifications` — sensitive, self-managed only) |
| `saved_jobs` | no access | full CRUD on own rows (`profile_id = auth.uid()`) | no access | no access needed |
| `categories`, `statuses`, `states`, `education_levels`, `qualifications` | SELECT (reference data) | SELECT | SELECT | full CRUD (`admin`+) |
| `organizations`, `departments`, `job_sources` | SELECT | SELECT | SELECT | full CRUD (`admin`+) |
| `job_notifications`, `job_posts` | SELECT where `status = 'published'` and not expired | same as public | same as public | full CRUD, and SELECT regardless of status |
| `job_age_rules`, `job_relaxations`, `job_status_requirements`, `job_state_scope(_states)`, `job_gender_rules`, `job_experience_rules`, `job_qualification_requirements` | SELECT, joined only via a published `job_posts` row | same | same | full CRUD (`editor`+) |
| `job_documents` | SELECT, joined only via a published `job_notifications` row | same | same | full CRUD (`editor`+) |
| `job_history` | no access | no access | no access | SELECT (all roles); no direct writes (system-inserted via service role from application layer) |
| `job_imports` | no access | no access | no access | SELECT/UPDATE (`reviewer`+); INSERT via service role only (ingestion pipeline) |
| `admin_roles`, `admin_role_assignments` | no access | no access (even for the row's own `user_id`, to avoid a user reading/inferring their own elevated status outside proper login context — actual role checks happen server-side) | no access | SELECT (`admin`+); INSERT/UPDATE/DELETE (`super_admin` only) |
| `audit_logs` | no access | no access | no access | SELECT (`admin`+); INSERT via service role only |

`statuses` (§5A) follows the exact same public-read policy as `categories`, and `profile_statuses` follows the exact same self-managed-only policy as `user_qualifications` — a user must only be able to manage their own `profile_statuses` rows, per this revision's explicit requirement, and this is enforced identically to how `category_id` on `profiles` itself is already protected (a user cannot set `profile_id` to anything but their own `auth.uid()` on insert, enforced by the same RLS `WITH CHECK` pattern as `saved_jobs`/`user_qualifications`). `job_status_requirements` sits in the same admin-write/public-read bucket as every other job rule table — reading which statuses gate a published post is not sensitive (the rule itself is public), only the *link* to a specific user's own statuses is.

General principles applied throughout: a user can always read/write their own rows (matched by `auth.uid()`), never another user's; unauthenticated (`anon`) and authenticated non-admin users see the same public surface — only genuinely `published` and unexpired job data, plus reference tables; nothing about eligibility *rules* is hidden from public view (they're not sensitive — the *combination* with a specific user's profile is what's private, and that combination is never persisted per §19); write access to jobs/rules/sources is admin-role-gated via `admin_role_assignments`, checked through a `security definer` helper function (e.g. `is_admin(auth.uid(), 'editor')`) referenced in policies, rather than duplicating the role-check logic across every policy definition.

---

## 27. Indexes

| Index | On | Why |
|---|---|---|
| `job_notifications(status, notification_date DESC)` | `job_notifications` | Powers "latest published jobs" (PRD.md §14) — filter by `status='published'`, sort by notification date |
| `job_notifications(application_end_date)` where `status = 'published'` | `job_notifications` | Powers "closing soon" queries (partial index keeps it small) |
| `job_posts(job_notification_id)` | `job_posts` | FK join, notification → its posts |
| `job_notifications(organization_id)` | `job_notifications` | "Jobs by organization" filter |
| `job_state_scope_states(state_id)` | `job_state_scope_states` | "Jobs by state" filter |
| `job_qualification_requirements(qualification_id)` | `job_qualification_requirements` | "Jobs by qualification" filter |
| `job_relaxations(job_post_id)` | `job_relaxations` | Eligibility engine lookup per post (already covered by the table's own FK index, called out for clarity); serves both category- and status-keyed rows since they share one table (§14) |
| `job_relaxations(category_id)`, `job_relaxations(status_id)` | `job_relaxations` | Reverse lookups (e.g. admin "which posts grant a PwBD relaxation") — both nullable columns get their own index since a row only ever populates one |
| `job_status_requirements(job_post_id)` | `job_status_requirements` | Eligibility engine lookup per post for status-gated rules (§14A) |
| `profile_statuses(profile_id)` | `profile_statuses` | Mirrors `user_qualifications(profile_id)` — the engine loads a user's full status set once per evaluation batch |
| `saved_jobs(profile_id)` | `saved_jobs` | "User's saved jobs" — the dominant read pattern on this table |
| `job_notifications` full-text index (`to_tsvector('english', title || description)`) | `job_notifications` | Job search (title/description keyword match) per PRD.md §16, PostgreSQL-native to start |
| `job_posts(title)` (trigram or plain btree, TBD at implementation) | `job_posts` | Search/filter by post title |
| `profiles(category_id)`, `profiles(state_id)` | `profiles` | Supports admin-side aggregate queries and eligibility batch jobs (not a hot path for individual users, but needed if/when "notify all eligible users" is built) |

Deliberately **not** indexed: low-cardinality boolean/status flags on small reference tables (`is_active` on `categories`/`states`) — table scans on tables with a few dozen rows are cheaper than maintaining an index. Every index above is tied to a named query pattern from PRD.md, not added speculatively.

---

## 28. Constraints

Representative constraints already specified inline above, consolidated here:

- **Foreign keys:** every relationship table above (`profiles.category_id`, `job_posts.job_notification_id`, `saved_jobs.job_post_id`, etc.) is a real FK, with `ON DELETE CASCADE` used specifically where child data has no meaning without the parent (profile → auth.users, job_posts → job_notifications, saved_jobs → profiles/job_posts, rule tables → job_posts, `admin_role_assignments.user_id` → auth.users — the assignment itself is meaningless once the assignee's account is gone), `ON DELETE SET NULL` used specifically for actor-reference FKs on audit/history-like rows where the *event* must outlive the *account that performed it* (`job_history.changed_by`, `job_imports.reviewed_by`, `audit_logs.actor_id` — §21/§22/§25 — and `admin_role_assignments.granted_by` — §24, resolved in Phase 2.1 after being flagged as a genuine inconsistency rather than a deliberate omission), and `ON DELETE RESTRICT`/no cascade (default) where the parent shouldn't be deletable while referenced (e.g. `organizations` referenced by `job_notifications` — an org with jobs on record can be deactivated via `is_active`, not deleted).
- **Unique constraints:** `saved_jobs(profile_id, job_post_id)`; `category_aliases(category_id, alias)`; `states(name)`, `states(code)`; `job_notifications(slug)`; `job_state_scope_states(job_state_scope_id, state_id)`; `admin_role_assignments(user_id, role_code)`; `profile_statuses(profile_id, status_id)`; `job_relaxations(job_post_id, category_id, status_id)`; `job_status_requirements(job_post_id, status_id)`.
- **NOT NULL:** applied to every column that has no valid "missing" meaning (e.g. `job_notifications.title`, `job_age_rules.age_cutoff_date`) — see individual table definitions above for the full list; deliberately **not** applied to profile eligibility fields (§4) since null there is meaningful ("not yet provided").
- **Check constraints:** URL format checks (`~* '^https://'`) on all official/source/document URLs; `application_end_date >= application_start_date` on `job_notifications`; `max_age >= min_age` on `job_age_rules`; non-negative checks on ages, vacancy counts, experience years, relaxation years; enum-style `CHECK (... IN (...))` on `gender`, `org_type`, `source_type`, `document_type`, `scope_type`, `allowed_gender`, `relaxation_combination_mode`, `requirement_type`, `verification_status` — used instead of a lookup table for these because the value sets are small, genuinely fixed (not admin-extensible like job statuses or categories), and don't need a description/ordering; an exactly-one-of-two-FKs check (`category_id` XOR `status_id`) on `job_relaxations`, enforcing at the database level that every relaxation row is unambiguously keyed.
- **URL validation strategy:** schema-level checks are syntactic only (well-formed `https://` URL); domain-trust validation (does this URL actually belong to the claimed government source) is an application-layer concern performed during the review pipeline, as described in §9 — the schema can't and shouldn't try to encode "is this really upsc.gov.in's site."
- **Date constraints:** `application_end_date >= application_start_date`; no constraint forces `notification_date <= application_start_date` since some notifications are published with applications opening later, sometimes with a gap, and this is legitimate.

---

## 29. Soft Delete / Archiving

No table uses a bare `deleted_at`/soft-delete flag for **job** data — the existing status lifecycle (§11) already models the meaningful lifecycle states (`published` → `expired` → `archived`), and `archived` *is* the platform's soft-delete for jobs: hidden from all standard views, retained for audit/history, never physically deleted, per PRD.md's explicit "never delete important recruitment history unnecessarily." A genuine hard `DELETE` of a `job_notifications`/`job_posts` row is reserved for exceptional cases (e.g. a duplicate erroneously created by an ingestion bug, caught before publish) and is an admin/manual operation, not part of the normal lifecycle.

Reference data (`organizations`, `job_sources`, `categories`, `states`, `education_levels`, `qualifications`) uses `is_active boolean` rather than a status enum or deletion — these are simple on/off toggles (e.g. a source that's no longer monitored), and job/rule rows that reference an inactive entity keep their historical FK link (no cascade), so old published jobs don't lose their organization reference just because that organization was later deactivated.

User data (`profiles`, `saved_jobs`, `user_qualifications`) has no soft-delete at all — account deletion is a hard, cascading delete (§3), matching the privacy/deletion requirement in ARCHITECTURE.md §9. There is no product need to retain a deleted user's profile data after they've requested deletion.

---

## 30. Timestamps

All `timestamptz` columns are stored in UTC (Postgres's `timestamptz` always normalizes to UTC internally regardless of session timezone, which is the standard, correct approach — no custom UTC-handling logic needed at the schema level). The application layer converts to India Standard Time (UTC+5:30) only at presentation time.

**Date-only vs. timestamp distinction, applied deliberately:**
- `date_of_birth`, `notification_date`, `application_start_date`, `application_end_date`, `age_cutoff_date`, `published_date` (on documents), `year_completed` are `date` (no time-of-day component) — government notifications specify calendar dates, not instants, and treating them as `date` avoids timezone-conversion bugs where a deadline could appear to shift by a day depending on the reading client's timezone.
- `created_at`, `updated_at`, `published_at`, `expires_at`, `last_checked_at`, `saved_at`, `changed_at`, `checked_at`, `granted_at`, `reviewed_at`, `downloaded_at`, `extracted_at` are `timestamptz` — these are genuine instants (when a row was written/an event occurred), where sub-day precision and unambiguous UTC storage matter.
- `application_end_date` (a `date`) is what the application logic evaluates against "is this job still open" — comparison is done as a date comparison against the current IST calendar date, not a UTC instant comparison, so a deadline of "31 August 2026" behaves the way a candidate reading the official notification would expect, regardless of the server's own timezone.

---

## 31. Database Diagram

```
auth.users
   |
   | 1:1 (id = auth.users.id, cascade delete)
   v
profiles ------------------------------+----------------+
   |  \        \            \          |                |
   |   \        \            \         | 1:N             | 1:N
   |    \        \            \        v                v
   |     \        \            \    user_qualifications  profile_statuses --FK--> statuses
   |      \        \            \       |
   |      \        \            \       v
   |      \        \            \    qualifications --> education_levels
   | FK    | FK     | FK         | FK
   v       v        v            v
categories states  states     (gender: plain column, no FK)
(category_ (state_id) (domicile_
 aliases)              state_id)

profiles --1:N--> saved_jobs --N:1--> job_posts

organizations --1:N--> departments
organizations --1:N--> job_notifications
departments   --1:N--> job_notifications (nullable)
job_sources   --1:N--> job_notifications

job_notifications --1:N--> job_posts
job_notifications --1:N--> job_documents
job_notifications --1:N--> job_history (job_post_id nullable on this table)
job_notifications --1:N--> job_imports (nullable link)
job_notifications --FK---> job_statuses (status code)

job_posts --1:1--> job_age_rules  (carries relaxation_combination_mode)
job_posts --1:N--> job_relaxations --FK--> categories  (nullable)
job_posts --1:N--> job_relaxations --FK--> statuses     (nullable; exactly one of the two FKs set per row)
job_posts --1:N--> job_status_requirements --FK--> statuses
job_posts --1:1--> job_state_scope --1:N--> job_state_scope_states --FK--> states
job_posts --1:1--> job_gender_rules
job_posts --1:1--> job_experience_rules
job_posts --1:N--> job_qualification_requirements --FK--> qualifications / education_levels
job_posts --1:N--> job_history (via job_post_id)

job_sources --1:N--> job_imports

auth.users --1:N--> admin_role_assignments --FK--> admin_roles
auth.users --1:N--> audit_logs (actor_id)
auth.users --1:N--> job_history (changed_by)
auth.users --1:N--> job_imports (reviewed_by)

audit_logs: generic (entity_table, entity_id) pointer into any table above
```

---

## 32. Query Examples

All conceptual SQL/pseudocode — not migrations.

**Latest published jobs:**
```sql
SELECT jp.*, jn.title AS notification_title, jn.notification_date
FROM job_posts jp
JOIN job_notifications jn ON jn.id = jp.job_notification_id
WHERE jn.status = 'published'
ORDER BY jn.notification_date DESC, jn.created_at DESC
LIMIT 20;
```

**Jobs closing within 7 days:**
```sql
SELECT jp.*, jn.application_end_date
FROM job_posts jp
JOIN job_notifications jn ON jn.id = jp.job_notification_id
WHERE jn.status = 'published'
  AND jn.application_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
ORDER BY jn.application_end_date ASC;
```

**Jobs for a particular state (via state scope):**
```sql
SELECT DISTINCT jp.*
FROM job_posts jp
JOIN job_notifications jn ON jn.id = jp.job_notification_id
LEFT JOIN job_state_scope jss ON jss.job_post_id = jp.id
LEFT JOIN job_state_scope_states jsss ON jsss.job_state_scope_id = jss.id
WHERE jn.status = 'published'
  AND (jss.scope_type = 'all_india' OR jsss.state_id = :user_state_id);
```

**Jobs matching a qualification:**
```sql
SELECT DISTINCT jp.*
FROM job_posts jp
JOIN job_qualification_requirements jqr ON jqr.job_post_id = jp.id
WHERE jqr.qualification_id = :qualification_id
   OR jqr.education_level_id = :education_level_id;
```

**User's saved jobs (with expiry flag derived at read time):**
```sql
SELECT jp.*, jn.application_end_date,
       (jn.status = 'expired' OR jn.application_end_date < CURRENT_DATE) AS is_expired
FROM saved_jobs sj
JOIN job_posts jp ON jp.id = sj.job_post_id
JOIN job_notifications jn ON jn.id = jp.job_notification_id
WHERE sj.profile_id = auth.uid()
ORDER BY sj.saved_at DESC;
```

**User's profile:**
```sql
SELECT * FROM profiles WHERE id = auth.uid();
```

**Published jobs with active application windows:**
```sql
SELECT jp.*
FROM job_posts jp
JOIN job_notifications jn ON jn.id = jp.job_notification_id
WHERE jn.status = 'published'
  AND (jn.application_start_date IS NULL OR jn.application_start_date <= CURRENT_DATE)
  AND (jn.application_end_date IS NULL OR jn.application_end_date >= CURRENT_DATE);
```

**Jobs requiring eligibility evaluation (e.g. for a given user, computed on demand):**
```sql
SELECT jp.id, jar.min_age, jar.max_age, jar.age_cutoff_date, jar.relaxation_combination_mode,
       jr_cat.age_relaxation_years AS category_relaxation_years,
       jr_status.age_relaxation_years AS status_relaxation_years,
       jgr.allowed_gender
FROM job_posts jp
JOIN job_notifications jn ON jn.id = jp.job_notification_id
LEFT JOIN job_age_rules jar ON jar.job_post_id = jp.id
LEFT JOIN job_relaxations jr_cat ON jr_cat.job_post_id = jp.id AND jr_cat.category_id = :user_category_id
LEFT JOIN profile_statuses ps ON ps.profile_id = :user_profile_id
LEFT JOIN job_relaxations jr_status ON jr_status.job_post_id = jp.id AND jr_status.status_id = ps.status_id
LEFT JOIN job_status_requirements jsr ON jsr.job_post_id = jp.id
LEFT JOIN job_gender_rules jgr ON jgr.job_post_id = jp.id
WHERE jn.status = 'published';
-- application layer combines this with job_state_scope, job_experience_rules,
-- job_qualification_requirements results, and jar.relaxation_combination_mode
-- (to combine jr_cat/jr_status when the user has multiple applicable relaxation
-- rows, per ELIGIBILITY_ENGINE.md §7) to produce the full eligibility explanation.
```

---

## 33. Scalability

**1,000 users / early job volume:** the schema as designed performs well with default indexes above; no special measures needed. Eligibility is computed dynamically per §19 without issue at this scale.

**100,000 users:** `profiles`-driven queries (e.g. "which users are eligible for job X" for a future notification feature) start to benefit from the `profiles(category_id)`/`profiles(state_id)` indexes already specified. Pagination (keyset/cursor-based on `job_notifications(notification_date, id)`) replaces simple `OFFSET` pagination on listing endpoints to avoid deep-offset slowdowns. Read replicas (a Supabase/Postgres feature) can offload public job-browsing read traffic from the primary if write contention becomes visible — not needed pre-emptively.

**1,000,000 jobs (`job_posts` rows):** the full-text search index and the `job_notifications(status, notification_date DESC)` index remain the primary access paths and continue to scale logarithmically. At this volume, consider: a materialized view for the "latest published jobs" home feed (refreshed on a schedule or on publish events) to avoid recomputing the same hot query per request; moving full-text/faceted search to a dedicated search system (Postgres `tsvector` genuinely stops being sufficient well before 1M rows if query latency under concurrent load becomes a problem) — ARCHITECTURE.md already flags this as an anticipated evolution, not a schema change today. Table partitioning (e.g. `job_notifications` by year) is explicitly **not** recommended until real query-performance data shows a need — premature partitioning adds operational complexity (constraint design, partition maintenance) that this product's scale doesn't yet justify.

Background jobs (ingestion, scheduled re-checks of `job_sources.last_checked_at`, expiry status transitions) run outside request/response cycles (e.g. Vercel Cron / Supabase scheduled functions per TECH_STACK.md) and write through the same tables/constraints — no schema changes needed to support them, only application-layer scheduling.

---

## 34. Migration Strategy

- All schema changes ship as versioned SQL migration files (Supabase CLI migration format), applied in order — no manual schema edits in any environment, per CLAUDE.md.
- **Local development:** Supabase CLI (`supabase start`) runs a local Postgres instance; migrations apply via `supabase db reset`/`supabase migration up` against it.
- **Staging:** a dedicated Supabase project mirrors production configuration; migrations are applied via CI before any staging deploy, giving a rehearsal environment for schema changes before they touch production data.
- **Production:** migrations apply via a controlled CI/CD step (not manually via the Supabase dashboard), with the migration history table (`supabase_migrations.schema_migrations`) as the record of what's applied where.
- **Rollback strategy:** every migration that is structurally reversible (adding a nullable column, adding a table, adding an index) ships with a corresponding down-migration. Destructive changes (dropping a column/table, tightening a constraint on existing data) are handled by a forward-only "expand → migrate data → contract" pattern across multiple migrations rather than a single down-migration, since a truly safe rollback of a destructive change usually isn't possible without data loss anyway — the safer default is to never lose the ability to move forward correctly, rather than promise a rollback that can't really restore prior state.
- **Seed/reference data** (§35) is applied via a separate, idempotent seed script/migration (safe to re-run, using `ON CONFLICT DO NOTHING`/upsert semantics), kept distinct from schema-structure migrations so reference-data updates don't get tangled with DDL changes.

---

## 35. Seed Data

Reference/lookup data needed at initial deploy (no real user data ever included):

- `states`: all 28 Indian states + 8 union territories, with `code` values.
- `categories`: General/UR, OBC, SC, ST, EWS, per PRD.md §8 — reservation categories only (see §5 for why PwD/PwBD and Ex-Servicemen are not seeded here).
- `statuses` (§5A): PwBD, Ex-Serviceman, Departmental Candidate at minimum, per ELIGIBILITY_ENGINE.md §8's worked examples; extended as real notifications surface further statuses.
- `education_levels`: 10th, 12th, Diploma, ITI, Undergraduate, Graduate/Postgraduate (or a finer UG/PG split — see §7), Doctorate, Professional.
- `job_statuses`: the eight statuses from §11, with descriptions and sort order.
- `admin_roles`: `super_admin`, `admin`, `editor`, `reviewer`, with descriptions.
- A small set of common `qualifications` rows (e.g. `ANY_BACHELOR`, `ANY_DIPLOMA`) to bootstrap the generic/common cases admins will reference immediately; organization- or field-specific qualifications are added by admins as encountered rather than pre-seeded exhaustively.

---

## 36. Important Database Decisions

| Decision | Why | Alternatives considered | Trade-offs |
|---|---|---|---|
| JSONB only for `raw_extraction_output`, `validation_errors`, `checks` (future cache), `audit_logs.metadata` | These are the only genuinely variable-shape, non-independently-queried structures in the schema | JSONB everywhere ("flexible schema"); fully relational even for AI raw output | Relational-everywhere would force premature normalization of AI output whose shape isn't stable; JSONB-everywhere would lose FK integrity and make the eligibility-critical data (age, category, state rules) unauditable and hard to index — rejected as contrary to PRD/CLAUDE.md's determinism requirement |
| Lookup table (`job_statuses`) instead of native enum for job status | Extensible via migration + insert, no `ALTER TYPE` friction, carries description/order metadata, consistent with `categories`/`states` pattern | Native Postgres `ENUM`; validated free-text `text` column | Enum is marginally faster/smaller but rigid to extend; free-text risks drift between app and DB — lookup table is the best fit for a value set expected to grow occasionally |
| Dynamic (not persisted) eligibility results for MVP | Guarantees results always reflect current rules/profile; at MVP scale the join cost is negligible | Always-persisted results with invalidation triggers | Persisting now would add invalidation-correctness risk (a missed invalidation path silently serves stale eligibility) for a performance problem that doesn't exist yet at this scale |
| `job_notifications` + `job_posts` two-table model | Required to support multiple posts with independently varying eligibility rules inside one notification (PRD.md §16) | Single flat `jobs` table with per-post rows duplicating notification fields; single table + JSONB array of posts | Duplicating notification fields per post would break "one notification, many posts" semantics for status/source/URL tracking; JSONB posts array would hide post-level rules from relational indexing/FKs, contrary to §2 |
| Category modeled as `categories` + `category_aliases`, FK everywhere | Supports differing category taxonomies across recruiting bodies without assuming one fixed list (PRD.md §8) | Free-text category strings on jobs/profiles; a single fixed enum of 5 values | Free-text breaks determinism and makes eligibility matching fragile to spelling/label variation; a fixed enum can't represent a state PSC's locally-labeled sub-category without a schema change |
| Qualification requirements as AND-of-OR-groups (`group_id`) rather than a boolean expression tree | Covers every example requirement in PRD.md/§18 without a general expression engine | Full boolean expression tree (nested AND/OR/NOT); single free-text requirement string parsed at read time | An expression tree is more powerful than anything currently needed and adds real implementation/testing complexity; free text would defeat structured, deterministic matching entirely |
| Coarse 4-role admin model (`super_admin`/`admin`/`editor`/`reviewer`) rather than a full permissions matrix | Matches PRD.md's admin requirements without speculative complexity | Fine-grained per-action permission table | A full permissions matrix is easy to add later (new table + FK) once real role-boundary needs emerge; building it now is premature for a small internal admin team |
| Separate `job_history` (field diffs) vs. `audit_logs` (event trail) | Different consumers: job history feeds the public "last updated" UI and admin correction review; audit log is an internal security/compliance trail | One unified log table for everything | A single table would force either exposing security-sensitive audit rows to a job-detail-page-adjacent query, or filtering awkwardly on every read — kept separate for clean access boundaries (also reflected in differing RLS in §26) |
| Composable `statuses`/`profile_statuses`, kept separate from `categories`/`profiles.category_id` (§5A) | Resolves the previously-open question below: a reservation category and a special status are different, independently-composable concepts per ELIGIBILITY_ENGINE.md §8, and a single-valued category field cannot represent a user holding more than one special status at once | Adding PwD/Ex-Serviceman as rows in `categories`; a single free-text "additional status" column on `profiles` | Rows-in-`categories` cannot represent a user holding *multiple* special statuses simultaneously without inventing composite category rows for every combination; a free-text column would break deterministic matching the same way free-text category strings would (§5) |
| `job_relaxations` widened to a category-or-status FK (§14) rather than a second parallel table | Keeps one evaluation code path and one table shape for "an age relaxation tied to something the user holds," per this revision's explicit instruction not to duplicate the age-rule model | A separate `job_status_relaxations` table mirroring `job_category_relaxations` | A second near-identical table would double the schema surface and evaluation logic for no representational gain; a single `CHECK`-constrained either/or FK is simpler and just as queryable |
| `relaxation_combination_mode` placed on `job_age_rules`, not on `job_relaxations` or a new table (§13) | It is a single per-post fact ("how do this post's relaxations combine"), and `job_age_rules` already owns every other post-level age fact | A column duplicated onto every `job_relaxations` row; a new one-row-per-post `job_relaxation_config` table | Duplicating the mode onto every relaxation row risks rows for the same post disagreeing with each other, which is meaningless; a wholly new table for one column would be unwarranted for a field this narrow |
| `job_status_requirements` as a distinct table from `job_relaxations` (§14A) | "Must the user hold this status to be considered" (gating) and "how much age relaxation does holding it grant" (relaxation) are different questions a notification can answer independently and differently for the same status | Overloading `job_relaxations` with a `requirement_type` column covering both concerns | A single overloaded table would conflate two different evaluation semantics (a gate vs. a modifier) in one row shape, and a post can legitimately need both a relaxation row and a gating row for the same status — keeping them separate lets both exist independently without a compound-meaning column |
| `verification_status` (+ optional `confidence_score`) added to `job_qualification_requirements` (§7) | Makes qualification-rule trustworthiness explicit and auditable, closing the one rule table that previously had no confidence/provenance signal while every other rule table already had `is_confident`/`parse_note` | Leaving qualification confidence implicit in the job's own `review_required`/`approved` status only | Job-level status alone can't express "this job is approved overall, but this one specific requirement row is still ambiguous" — a per-row signal is needed for the engine to route only the affected dimension to `needs_verification` rather than the whole job |

**Resolved:** the previously-open question on whether PwD/PwBD and Ex-Servicemen status belong in `categories` or a separate concept is resolved by this revision — see the composable `statuses`/`profile_statuses` decision above and §5A/§5. It no longer appears in the open-questions list below.

**Remaining open questions, flagged rather than silently decided:**
- Whether `job_notifications`/`job_posts` naming should instead be `recruitments`/`jobs` to align more directly with PRD.md's user-facing vocabulary ("job") — naming choice made for schema clarity (§10) but not yet confirmed against how the application/API layer will name its own domain types.
- Whether `education_levels` needs a UG/PG split beyond a single "Graduate" rank, since many notifications distinguish "Graduate" from "Postgraduate" as different minimum bars — current seed plan (§35) assumes a split exists; needs confirmation this matches PRD.md's intent in §7 ("Education level... Graduate" is listed as one item there).
- Whether `job_experience_rules.domain_note` free text is sufficient long-term, or whether a structured experience-domain taxonomy will be needed once real notifications with complex experience requirements are ingested.
- Whether a genuine status-*gating* scenario (a `job_status_requirements` row with `requirement_type = 'required'`) will actually be encountered often enough in real notifications to justify its own admin UI treatment, or whether it stays a rarely-used escape hatch — a product question, not a schema one, but worth revisiting once real notifications are ingested.

---

## 36A. Eligibility Dimension Mapping

Direct mapping from each eligibility dimension in [ELIGIBILITY_ENGINE.md](./ELIGIBILITY_ENGINE.md) §3 to its database representation, added per this revision's explicit requirement for a clear, single-place cross-reference between the two documents.

| Eligibility Dimension | Database Representation |
|---|---|
| **Age** | `job_age_rules` (`min_age`, `max_age`, `age_cutoff_date`, `relaxation_combination_mode`) joined against `profiles.date_of_birth`; age itself is always computed at evaluation time, never stored (§13). |
| **Category** (primary reservation category) | `profiles.category_id` → `categories` (§5); relaxation for the user's category on a given post comes from `job_relaxations` rows where `category_id` is set (§14). |
| **Special Status** (PwBD, Ex-Serviceman, etc.) | `profiles.category_id`'s independent counterpart: `profile_statuses` → `statuses` (§5A, zero-or-many per profile). Relaxation comes from `job_relaxations` rows where `status_id` is set (§14); gating/preference comes from `job_status_requirements` (§14A). |
| **Relaxation stacking** | `job_age_rules.relaxation_combination_mode` (`additive` \| `max_of` \| `mutually_exclusive` \| `unsupported`) governs how multiple applicable `job_relaxations` rows (category and/or status) combine for one user on one post (§13, §14). |
| **State** | `profiles.state_id` → `states`, checked against `job_state_scope`/`job_state_scope_states` when `scope_type = 'specific_states'` (§15). |
| **Domicile** | `profiles.domicile_state_id` → `states` (a distinct FK from `state_id`), checked against `job_state_scope_states` when `scope_type = 'domicile_required'` (§15) — never inferred from `state_id`. |
| **Gender** | `profiles.gender` compared against `job_gender_rules.allowed_gender`; absence of a row means unrestricted (§16). |
| **Experience** | `profiles.experience_years` compared against `job_experience_rules.min_years`/`max_years`; a non-null `domain_note` on the rule always routes the dimension to `needs_verification` regardless of the numeric comparison, since domain text is never machine-matched (§17). |
| **Qualification** | `user_qualifications`/`profiles.education_level_id` evaluated against `job_qualification_requirements` (AND across `group_id` values, OR within a `group_id`), gated by each requirement row's `verification_status` (§7, §18). |

This table is intentionally a thin index into the fuller definitions elsewhere in this document — it exists so a reader (or the eligibility engine's implementer) can go from "which dimension am I evaluating" straight to "which table(s) do I query" without re-deriving the mapping from prose each time.

---

## 37. Final Schema Summary

| Table | Purpose | Main relationships |
|---|---|---|
| `profiles` | User's eligibility-relevant profile data | 1:1 `auth.users`; FK → `categories`, `states` (x2), `education_levels` |
| `categories` | Canonical reservation-category reference list | Self-referencing `parent_id`; referenced by `profiles`, `job_relaxations` |
| `category_aliases` | Alternate labels mapping to a canonical category | FK → `categories` |
| `statuses` | Canonical independent special-status reference list (PwBD, Ex-Serviceman, etc.) | Referenced by `profile_statuses`, `job_relaxations`, `job_status_requirements` |
| `profile_statuses` | A user's held special status(es) — zero or more, independent of `category_id` | FK → `profiles`, `statuses` |
| `states` | Indian states/UTs reference list | Referenced by `profiles`, `organizations`, `job_state_scope_states` |
| `education_levels` | Ranked education level reference list | Referenced by `profiles`, `qualifications`, `job_qualification_requirements` |
| `qualifications` | Specific/generic degree qualifications | FK → `education_levels`; referenced by `user_qualifications`, `job_qualification_requirements` |
| `user_qualifications` | A user's held qualification(s) | FK → `profiles`, `qualifications` |
| `job_qualification_requirements` | AND/OR qualification requirements per post | FK → `job_posts`, `qualifications`, `education_levels` |
| `organizations` | Recruiting bodies | FK → `states` (nullable); referenced by `departments`, `job_notifications` |
| `departments` | Sub-units of an organization | FK → `organizations`; referenced by `job_notifications` |
| `job_sources` | Traceable source of a notification | FK → `organizations`; referenced by `job_notifications`, `job_imports` |
| `job_notifications` | A recruitment notification (parent of posts) | FK → `organizations`, `departments`, `job_sources`, `job_statuses`; parent of `job_posts`, `job_documents`, `job_history`, `job_imports` |
| `job_posts` | An individual post/position within a notification | FK → `job_notifications`; parent of all rule tables, `job_qualification_requirements`, `saved_jobs` target |
| `job_statuses` | Lookup of valid lifecycle statuses | Referenced by `job_notifications.status` |
| `job_age_rules` | Per-post age min/max/cutoff, plus `relaxation_combination_mode` | FK → `job_posts` (1:1) |
| `job_relaxations` | Per-post age relaxation, keyed by either category or status (exactly one) | FK → `job_posts`, `categories` (nullable), `statuses` (nullable) |
| `job_status_requirements` | Per-post status gating (required/optional/preference) | FK → `job_posts`, `statuses` |
| `job_state_scope` / `job_state_scope_states` | Per-post state/domicile eligibility scope | FK → `job_posts` (1:1) / `states` |
| `job_gender_rules` | Per-post gender restriction | FK → `job_posts` (1:1) |
| `job_experience_rules` | Per-post experience requirement | FK → `job_posts` (1:1) |
| `saved_jobs` | A user's bookmarked jobs | FK → `profiles`, `job_posts`; unique per pair |
| `job_history` | Field-level change log for notifications/posts | FK → `job_notifications`, `job_posts` (nullable), `auth.users` (nullable) |
| `job_imports` | AI/ingestion extraction tracking | FK → `job_sources`, `job_notifications` (nullable), `auth.users` (reviewer) |
| `job_documents` | Advertisement/corrigendum/document records | FK → `job_notifications` |
| `admin_roles` | Lookup of admin role codes | Referenced by `admin_role_assignments` |
| `admin_role_assignments` | Which users hold which admin role | FK → `auth.users`, `admin_roles` |
| `audit_logs` | System-wide security/compliance event trail | FK → `auth.users` (actor, nullable); generic pointer to any entity |
| *(future, not MVP)* `eligibility_results` | Optional persisted eligibility cache | FK → `profiles`, `job_posts` |

---

## Summary

**Major tables:** `profiles` (linked 1:1 to `auth.users`), reference tables (`categories`/`category_aliases`, `statuses`, `states`, `education_levels`, `qualifications`), `profile_statuses` (a user's composable special statuses, independent of `category_id`), `organizations`/`departments`/`job_sources`, the `job_notifications` + `job_posts` pair modeling recruitment notifications and their individual posts, six dedicated per-post rule tables (age — now carrying `relaxation_combination_mode` — category/status relaxation via the widened `job_relaxations`, status-gated eligibility via `job_status_requirements`, state/domicile scope, gender, experience) plus `job_qualification_requirements` (now carrying `verification_status`), `saved_jobs`, `job_history`, `job_imports`, `job_documents`, and admin/audit tables (`admin_roles`, `admin_role_assignments`, `audit_logs`).

**Eligibility data model:** fully relational, one typed table per rule dimension, attached to `job_posts`. Age is always computed from `profiles.date_of_birth` against a per-post `age_cutoff_date`, never stored. A reservation category (`categories`, single-valued) and independent special statuses (`statuses`, zero-or-many via `profile_statuses`) are modeled as two separate, composable concepts rather than one field, and both can grant age relaxation through the same `job_relaxations` table — how multiple applicable relaxations for one user combine is governed by an explicit `relaxation_combination_mode` (`additive`/`max_of`/`mutually_exclusive`/`unsupported`) rather than an assumed default. Status can also *gate* eligibility (`job_status_requirements`), distinct from granting relaxation, with an explicit `preference` value that the engine must never treat as a hard requirement. State/domicile scope, gender, and experience remain their own tables, and qualification requirements now carry an auditable `verification_status` so unverified or ambiguous AI-extracted rules can never silently resolve to `eligible`. See §36A for the full dimension-by-dimension mapping. Eligibility *results* are still computed dynamically, not persisted, for MVP.

**RLS strategy:** users can only read/write their own `profiles`/`saved_jobs`/`user_qualifications`/`profile_statuses`; everyone (including anonymous visitors) can read published jobs and reference data (including `statuses`); only role-gated admins (via `admin_role_assignments`, never a client-trusted flag) can write jobs, rules, sources, or reference data; audit/history tables are admin-readable, system-writable only.

**Major design decisions:** relational-first schema with JSONB reserved for genuinely variable AI-output and audit-metadata shapes; a lookup table for job status instead of a native enum; dynamic (not persisted) eligibility calculation for MVP; a two-table `job_notifications`/`job_posts` split to support multi-post notifications with independently varying rules; alias-based category modeling to support varying taxonomies; AND-of-OR qualification matching instead of a general expression engine; a coarse four-role admin model; and, new in this revision, a composable status model kept structurally separate from reservation category, a single widened `job_relaxations` table (rather than a duplicate parallel table) for both category- and status-based relaxation, an explicit per-post relaxation combination mode, a dedicated status-gating table with a non-binding `preference` value, and an auditable verification state on qualification requirements.

**Risks:** with the composable status/relaxation model now in place, the primary remaining risk shifts from *modeling* stacked relaxations (resolved) to *extraction accuracy* — correctly inferring `relaxation_combination_mode` and per-status relaxation values from real notification text is a harder AI-extraction problem than single-category relaxation was, so `unsupported`/`needs_verification` rates on this dimension should be watched closely once real ingestion begins. The pre-existing risk that "latest jobs" and search will need to move off plain Postgres full-text search well before 1M rows under concurrent load remains unchanged by this revision.

**Open questions:** final naming of `job_notifications`/`job_posts` vs. `recruitments`/`jobs` in the application layer; whether education levels need a UG/PG split; whether experience-domain matching needs more structure than free text; and whether status-gated eligibility (`job_status_requirements` with `requirement_type = 'required'`) will be common enough in practice to warrant dedicated admin tooling. The category-vs-special-status open question from the prior revision is now resolved (§36). None of the remaining items block moving forward with migrations for the core schema, but they should be resolved before the eligibility engine and admin UI are built against this design.
