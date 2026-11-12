# Product Requirements Document (PRD)

**Project:** Government Jobs Eligibility and Discovery Platform
**Status:** Draft v1.0 — source of truth for product scope
**Related documents:** [TECH_STACK.md](./TECH_STACK.md) (technology decisions), [ARCHITECTURE.md](./ARCHITECTURE.md) (system architecture). `docs/DATABASE.md`, `docs/ELIGIBILITY_ENGINE.md`, and `docs/SECURITY.md` are referenced by [CLAUDE.md](../CLAUDE.md) as future sources of truth and do not yet exist; nothing in this PRD should be read as defining their content.

This document defines **what** the product must do. It does not define **how** it is implemented — see ARCHITECTURE.md for that. If a requirement here appears to conflict with the documented architecture or tech stack, that conflict must be surfaced and resolved before implementation, not silently worked around.

---

## 1. Overview

The Government Jobs Eligibility and Discovery Platform helps job seekers in India find government job openings ("sarkari naukri") that are actually relevant to them, and understand — in plain, explainable terms — whether they appear eligible to apply.

Users create an account and build a profile (date of birth, category, state, education). The platform matches this profile against a curated database of government job postings and surfaces:

- Which jobs the user may be eligible for, and why.
- Which jobs they are likely ineligible for, and why.
- Jobs where eligibility cannot be determined with confidence ("requires verification").

For every job, the platform always links back to the **official government advertisement** and the **official application portal**. The platform is an information and discovery layer on top of official government sources — it is not a government website, does not accept applications, and does not guarantee eligibility outcomes.

---

## 2. Goals

1. Help users discover government jobs relevant to their profile, cutting through scattered and inconsistent sarkari naukri sources.
2. Reduce the manual effort of reading dense eligibility criteria across many notifications.
3. Personalize job discovery using structured profile data (age, category, state, education).
4. Make every eligibility result explainable in plain language, not a black-box yes/no.
5. Always keep users one click away from the authoritative source: the official advertisement and the official application website.
6. Keep job listings fresh — reflect newly published notifications and remove/expire stale ones promptly.
7. Give admins full control over what job data is published, with review workflows for anything AI-assisted.

---

## 3. Non-Goals

The initial product explicitly will **not**:

- Submit job applications on behalf of users, or act as an application portal.
- Guarantee that a user is eligible for a job — eligibility results are an informational aid, not a legal determination.
- Replace, mirror, or represent itself as an official government notification or government website.
- Make final legal, recruitment, or hiring decisions of any kind.
- Automatically ingest from every possible government recruitment source on day one — source coverage grows incrementally, curated and reviewed by admins.
- Send notifications/alerts in the MVP (see [§14 Future Features](#14-future-features)).
- Support languages other than English in the MVP.

---

## 4. Personas

### 4.1 General job seeker
A candidate — student, graduate, or working professional — looking broadly across central and state government job openings. Their core problem: sarkari naukri information is fragmented across dozens of unofficial aggregator sites and official portals, each with inconsistent formatting, and manually checking eligibility for every listing is tedious and error-prone. They need a single, trustworthy place to see "jobs I can probably apply to" with a clear explanation, and a fast path to the real advertisement and application form.

### 4.2 State-specific government job seeker
A candidate primarily interested in jobs tied to their home state (state PSC recruitment, state department roles, domicile-restricted posts). Their core problem: state-level recruitment is even more fragmented than central recruitment, and many notifications carry domicile/state-residency requirements that are easy to miss. They need strong state and domicile filtering and eligibility checks that correctly account for state-specific rules.

### 4.3 Admin / content manager
An internal operator responsible for the accuracy and freshness of the job database. Their core problem: government notifications arrive as PDFs and web pages in inconsistent formats, and publishing incorrect or outdated information damages user trust and could mislead someone into missing a deadline or misjudging their eligibility. They need tools to add, review, correct, and publish/unpublish job records confidently, with full traceability back to the original source, and to review AI-assisted extraction before it goes live.

---

## 5. User Journeys

### 5.1 Primary journey (new user)

```
Landing page
  → Registration (email + password)
  → Email verification
  → Profile setup (DOB, category, state, education)
  → Dashboard (personalized job list)
  → Job details (full eligibility explanation)
  → View Official Advertisement  (informational, opens official source)
  → Apply on Official Website     (external, official application)
```

### 5.2 Returning user

```
Login → Dashboard → browse / search / filter → job details → save/unsave → logout
```

### 5.3 Supporting flows

| Flow | Requirement |
|---|---|
| Login | Email + password; error on invalid credentials without revealing which field is wrong. |
| Logout | Terminates the session; protected pages become inaccessible. |
| Forgot password | Email-based reset link; old sessions/tokens invalidated appropriately. |
| Edit profile | User can update editable fields (see §7); changes take effect on next eligibility calculation. |
| Save job | Authenticated user bookmarks a job for later; visible in "Saved jobs". |
| Remove saved job | Un-bookmarks a previously saved job. |
| Search jobs | Free-text search across title, organization, department, qualification, keywords. |
| Filter jobs | Narrow listings by state, category, qualification, department, organization, job type, salary, deadline, eligibility status. |
| View latest jobs | Chronological listing by publication/notification date (see §11). |
| View closing-soon jobs | Jobs whose application deadline falls within a defined near-term window (e.g. next 7 days), still open. |

### 5.4 Admin journey

```
Admin login (elevated authorization)
  → Job queue (discovered / imported / review_required)
  → Review job (verify extracted fields, source, URLs)
  → Approve → Publish
  → Monitor published jobs → Unpublish / Expire / Archive as needed
  → Manage sources
```

---

## 6. Authentication Requirements

- **Registration:** email + password. Email format and password strength are validated before account creation.
- **Email verification:** required before a user can access the dashboard or profile. Unverified accounts see a "verify your email" state.
- **Login:** email + password against verified accounts.
- **Logout:** invalidates the active session.
- **Password reset:** self-service, email-link based; reset does not reveal whether an email exists in the system (prevents account enumeration).
- **Protected dashboard:** inaccessible to unauthenticated users — redirect to login.
- **Protected profile:** inaccessible to unauthenticated users, and a user may only view/edit their own profile.
- **Admin authentication/authorization:** admins authenticate through the same identity system but hold a distinct, server-verified role. Admin-only routes and actions must be authorized server-side; client-side role flags are never trusted (see [CLAUDE.md](../CLAUDE.md) — "never trust client-side authorization").

---

## 7. User Profile

Every field below must document: **purpose**, **required?**, **validation**, **editable?**, and **affects eligibility?**. No field is collected unless it is needed for the discovery/eligibility purpose of the product.

| Field | Why collected | Required | Validation | Editable | Affects eligibility |
|---|---|---|---|---|---|
| Date of birth | Compute age against each job's cutoff date | Yes | Valid past date; plausible age range (e.g. 15–80 years) | Yes | Yes |
| Category (caste category) | Apply category-based eligibility and age relaxation rules | Yes | Must match a supported category value (see §8) | Yes | Yes |
| State | Match state-specific and domicile-restricted postings | Yes | Must match a supported Indian state/UT value | Yes | Yes |
| Domicile state (if different from current state) | Some notifications require domicile, distinct from current residence | Optional, prompted where relevant | Must match a supported state/UT value | Yes | Yes |
| Education level | Filter/match minimum qualification requirements | Yes | Enum: e.g. 10th, 12th, Diploma, Graduate, Postgraduate, Doctorate | Yes | Yes |
| Qualification / field of study | Match subject-specific eligibility (e.g. "B.Ed required") | Optional at signup, recommended for accuracy | Free-text or controlled list, normalized | Yes | Yes |
| Gender | Some notifications reserve posts or apply relaxations by gender | Optional; requested only when needed for eligibility display | Enum: Male / Female / Other / Prefer not to say | Yes | Yes (only where a specific job's rules use it) |
| Experience (years, domain) | Some posts require minimum work experience | Optional | Non-negative number + domain tag | Yes | Yes (only where a specific job's rules use it) |
| Email | Authentication, verification, password reset | Yes | Valid email format, unique | No (requires re-verification flow, out of MVP scope) | No |
| Full name | Personalization/display only | Optional | Free text, length-limited | Yes | No |

Profile completeness directly affects eligibility precision: incomplete profiles produce more "unknown / requires verification" results rather than false positives or negatives (see §9).

---

## 8. Category System

The platform must support the category concepts commonly used in Indian government recruitment (e.g. General/UR, OBC (including OBC-NCL/Non-Creamy Layer), SC, ST, EWS, and category-linked reservations such as PwD/PwBD and Ex-Servicemen), while explicitly **not assuming every notification uses an identical category taxonomy** — state-level PSCs and specific departments sometimes use different labels or additional sub-categories.

Design requirements:
- Category values are stored as a normalized, versionable reference list, not hardcoded strings scattered through logic.
- A job's eligibility rules reference categories from this reference list; unrecognized category rules in a notification must fall back to "unknown / requires verification" rather than being guessed.
- The taxonomy must be extensible — new categories or state-specific variants can be added without a breaking schema change.

**Privacy note:** category/caste data is sensitive personal information under Indian data protection norms. Requirements:
- Collected only for the stated eligibility purpose (purpose limitation).
- Never exposed in public-facing contexts (no public profile pages showing category).
- Access restricted to the owning user and authorized system logic; admins do not get blanket access to individual user category data beyond what is operationally necessary.
- Detailed access-control and encryption mechanisms are defined in `docs/SECURITY.md` once authored; this PRD only establishes the product requirement that this field be treated as sensitive.

---

## 9. Jobs

A job record contains, at minimum:

- Job title
- Organization
- Department
- Recruitment type (e.g. direct recruitment, promotion-linked, contract)
- Description
- Vacancy count (total, and by category where published)
- Qualification/education requirements
- Age requirement (min/max)
- Age cutoff date (the reference date age is calculated against — not always the application date)
- Category rules (including age relaxation per category)
- State/domicile requirements
- Experience requirements
- Important dates (notification date, application start/end, exam date(s) where known)
- Salary / pay scale
- Official advertisement URL
- Official application URL (may be absent if not yet available — see §16 edge cases)
- Source (see §13)
- Publication status (see §10)
- Created date
- Last updated timestamp
- Expiry date (derived from application deadline, or set explicitly)

A single notification may contain multiple posts with different rules per post (see §16); the data model must support per-post eligibility rules rather than one flat rule set per notification.

### Job Status Lifecycle

| Status | Meaning |
|---|---|
| `discovered` | A potential job has been found (e.g. via a monitored source) but not yet fetched/processed. |
| `imported` | Source content has been fetched and stored, not yet parsed into structured fields. |
| `processing` | Extraction/normalization is in progress (may involve AI-assisted parsing). |
| `review_required` | Structured data exists but needs human/admin review before it can be trusted. |
| `approved` | Admin has reviewed and approved the data as accurate. |
| `published` | Visible to end users on the platform. |
| `expired` | Application deadline has passed; no longer shown as an active/open job, but retained for history/saved-job context. |
| `archived` | Removed from all standard views; retained for audit/history only. |

---

## 10. Eligibility

### 10.1 What the engine evaluates
Age, age cutoff date, category, category-based age relaxation, gender (where a job specifies it), state/domicile, education, qualification, experience, and any other job-specific conditions captured in that job's structured rules.

### 10.2 Result states
Every evaluation returns exactly one of:
- **Eligible** — all applicable checks passed.
- **Not eligible** — at least one applicable check failed.
- **Unknown / requires verification** — a rule could not be evaluated with confidence (e.g. missing profile field, ambiguous or unsupported rule in the source notification).

### 10.3 Explainability
Every result must include a per-rule breakdown with human-readable reasons, not just a final verdict. Example:

```
Eligible
  Age:
    ✓ User age: 24
    ✓ Required age: 18–30
  Education:
    ✓ Graduation required
    ✓ User has graduation
  Category:
    ✓ Applicable category relaxation applied (OBC: +3 years)

Not eligible
  Age:
    ✗ Maximum permitted age after applicable relaxation: 30
    ✗ User age: 34
```

### 10.4 Product requirement on determinism
Eligibility is deterministic application logic evaluated against structured, versioned rules — not an AI judgment call made at query time. AI may assist upstream in *extracting* structured rules from a notification (see §17), but the eligibility calculation itself must be reproducible, testable, and independent of any AI call. This is a hard product requirement, not an implementation detail — see also [CLAUDE.md](../CLAUDE.md) and `docs/ELIGIBILITY_ENGINE.md`.

---

## 11. Dashboard

The dashboard is the authenticated user's home view. It must show:
- Personalized eligible job count
- Latest jobs (see §12 for "latest" definition)
- Recommended jobs (matched to profile)
- Closing-soon jobs
- Saved jobs
- Eligibility status and reasons inline on job cards (at minimum a status badge; full reasons on the job detail page)
- Job filters, at minimum: state, category, qualification, department, organization, job type, salary, application deadline, eligibility status, and a "newest first" sort.

## 12. Job Detail Page

Must display: job title, organization, important dates, vacancy count, qualification, age requirements, category rules, state requirements, salary, the full eligibility result and explanation, source, and last-updated information.

The page must present two clearly distinct, separately labeled actions:
- **"View Official Advertisement"** — opens the original government notification (informational).
- **"Apply on Official Website"** — opens the official application portal (transactional). This must never be the platform's own domain, and must be absent (not faked) if no official application URL is known yet.

## 13. Job Sources

Every job — with no exception — must carry a traceable source before it can be published:
- Source name (e.g. "UPSC", "SSC", "Rajasthan PSC")
- Source URL
- Official advertisement URL
- Application URL (nullable until known)
- Last-checked timestamp (when the platform last confirmed this record against the source)

A job with no source information must never reach `published` status. This is enforced as a hard product rule, not a best-effort guideline.

## 14. "Latest Jobs" Definition

"Latest" is defined deterministically by **notification/publication date** (the date the government body issued the notification), not by ingestion time or any AI-driven ranking. Sort order for the "Latest jobs" view is publication date descending; ties broken by created-date descending. This must remain a simple, auditable rule so users can trust what "latest" means.

## 15. Saved Jobs

Authenticated users can save a job, remove a saved job, and view their list of saved jobs. Saved jobs must visually indicate when the underlying job has expired (application deadline passed) so the user isn't misled into thinking it's still open.

## 16. Search

Search covers job title, organization, department, qualification, location/state, and free-text keywords. Per TECH_STACK.md/ARCHITECTURE.md, search starts on PostgreSQL full-text search; the product requirement is relevance and reasonable latency at MVP scale, not a specific search engine — the architecture may evolve to a dedicated search system if scale requires it, without changing this product requirement.

## 17. Admin

Admins must be able to: create a job, edit a job, review a job (including AI-extracted data), publish a job, unpublish a job, expire a job, archive a job, manage job sources, view job history (audit trail of changes), and see data-quality warnings (e.g. missing application URL, source not checked recently, conflicting dates).

## 18. AI Usage

**Acceptable AI uses:**
- PDF text extraction
- Advertisement parsing
- Structured job-data extraction
- Eligibility-rule extraction (structured rules the deterministic engine later evaluates)
- Job summarization
- Explaining an already-computed eligibility result in natural language

**Required pipeline for anything AI touches:**
```
AI extraction → validation → normalization → review (where required) → publish
```

**AI must never:**
- Invent job information not present in the source
- Invent application URLs
- Decide final eligibility
- Cause a job to reach `published` status without passing through the pipeline above

AI output is treated as untrusted input everywhere in the product, per [CLAUDE.md](../CLAUDE.md).

## 19. Notifications (Future)

Not part of the MVP. Documented here only so future scope is clear:
- New matching job alerts
- Application deadline approaching
- Saved job deadline reminders
- Job update notifications (e.g. dates changed)
- Eligibility-rule change notifications

---

## 20. MVP Scope

**In scope for MVP:**
- Registration, email verification, login, logout, password reset
- User profile: DOB, category, state, education (as defined in §7)
- Job database with the fields in §9
- Deterministic eligibility engine (§10)
- Personalized dashboard (§11)
- Latest jobs view (§14)
- Job filtering and search (§16)
- Job detail page with distinct advertisement/application links (§12)
- Saved jobs (§15)
- Basic admin job management: create, edit, review, publish, unpublish, expire, archive (§17, manual entry focus — automated ingestion pipelines are future scope)

**Explicitly out of MVP scope:** automated multi-source monitoring/ingestion at scale, AI-assisted extraction pipeline (manual admin entry is sufficient for MVP; AI extraction is architected for but not required to ship), notifications/alerts of any kind, mobile app, multi-language support, personalized ML-based recommendations, analytics dashboards.

## 21. Future Roadmap

- Automated government website monitoring and scheduled ingestion
- PDF ingestion pipeline with AI-assisted extraction (already architected for in §18/ARCHITECTURE.md, deferred to post-MVP for delivery)
- Email alerts
- Push notifications
- WhatsApp/Telegram notifications
- Advanced search (typo-tolerant, faceted, dedicated search engine)
- Personalized recommendations beyond rule-based matching
- Mobile application
- Multi-language support
- More granular eligibility rules (e.g. PwD sub-categories, ex-servicemen rules, state-specific reservation nuances)
- Product analytics

---

## 22. Non-Functional Requirements

- **Accuracy:** published job data must reflect the official source; no fabricated fields.
- **Explainability:** every eligibility verdict must be traceable to specific rule checks.
- **Security:** server-side authorization for all protected/admin actions; no service-role credentials ever reach the browser; Row Level Security enforced at the database layer; all external and user input validated (Zod, per TECH_STACK.md).
- **Privacy:** sensitive fields (category, DOB) collected only for stated purpose, access-controlled, never exposed publicly.
- **Freshness:** published jobs reflect source-checked data; `last_checked` timestamps are visible to admins to identify stale records.
- **Auditability:** admin actions on job records are logged (who changed what, when).
- **Availability of official information:** a user must always be able to reach the official advertisement for any published job; the platform must never be the sole/last source of truth for a job's content.

---

## 23. Acceptance Criteria

**Registration**
- User can register with a valid email and a password meeting complexity requirements.
- Invalid email format is rejected with a clear error.
- Weak password is rejected with a clear error.
- Account cannot access the dashboard until email is verified.
- Unauthenticated users cannot access the dashboard, profile, or saved jobs routes — they are redirected to login.

**Eligibility**
- Age is calculated correctly against each job's specific age cutoff date (not today's date, unless the job specifies today's date as the cutoff).
- Applicable category-based age relaxation is applied per the job's documented rules.
- Education/qualification requirements are evaluated against the user's profile.
- Any rule the engine cannot confidently evaluate (missing profile data, unsupported rule shape) produces "unknown / requires verification," never a guessed eligible/not-eligible.
- Every eligibility result returns a list of human-readable, per-rule reasons.

**Jobs**
- Every job in `published` status has a non-null source, source URL, and official advertisement URL.
- A job missing required source fields cannot be transitioned to `published`.
- Expired jobs (past application deadline) do not appear in "active"/"open" job listings, though they remain viewable in a user's saved jobs with an expired indicator.
- "View Official Advertisement" and "Apply on Official Website" are visually and functionally distinct controls, and the application link is only shown when a real application URL is known.

**Search & Filtering**
- Search returns jobs matching title, organization, department, qualification, or state keywords.
- Filters can be combined (e.g. state + category + qualification) and narrow results accordingly.

**Admin**
- Only authenticated users with the admin role (verified server-side) can access admin job management actions.
- A job cannot be published without passing through required review when it originated from AI-assisted extraction.

---

## 24. Edge Cases

- User profile is missing a field required by a specific job's rules → that rule's check returns "unknown / requires verification," not a false eligible/ineligible.
- A job's eligibility criteria are ambiguous or contradictory in the source notification → job-level or rule-level status reflects "requires verification"; admin is flagged to clarify.
- A job has multiple age cutoff dates (e.g. different cutoff for different posts within one notification) → each post is modeled as its own eligibility rule set, not a single shared cutoff.
- Different categories carry different age relaxations for the same post → relaxation table is per-category, per-job.
- A single notification contains multiple posts with different qualification/age/category rules → data model supports per-post rules, not one rule set per notification.
- User's age is exactly at the maximum permitted boundary → boundary is inclusive unless the source notification explicitly states otherwise; the specific rule interpretation must be documented per job, not assumed globally.
- User's birthday falls on Feb 29 (leap year) → age calculation must handle this without error (e.g. treat as March 1 in non-leap years, or per a documented, consistent rule).
- Job's application deadline has passed → job auto-transitions to `expired`, disappears from active listings, but remains referenceable from saved jobs / history.
- Government source updates or corrects a published notification → job record must be re-checked and updated (with `last_updated` bumped); admin is notified of the change for review, not silently auto-published.
- Advertisement PDF is temporarily unavailable at the source → the stored URL is preserved, the job is not deleted; admin/system may flag it for a re-check.
- AI extraction produces incorrect structured data → caught by the review pipeline (§18) before publish; if discovered post-publish, admin corrects and the change is audited.
- Job has no official application URL yet (e.g. "applications open soon") → "Apply on Official Website" control is not shown; job can still be published as informational with advertisement link only, clearly indicating applications haven't opened.
- Job is restricted to a specific domicile (not just state of residence) → domicile is modeled as a distinct field from current state and evaluated separately.
- Qualification allows multiple acceptable alternatives (e.g. "B.Tech OR equivalent diploma") → qualification rule supports an OR-list, not a single required value.

---

## 25. Product Metrics

Metrics that reflect real product health, not vanity counts:
- Registered users, and profile completion rate (proxy for whether users can get accurate eligibility results)
- Jobs published, jobs discovered per day (pipeline health)
- Job freshness (median time between source publication and platform publication; count of jobs with stale `last_checked`)
- Saved jobs count, job detail views
- Official application link click-through (proxy for whether the platform is actually helping users act)
- Search usage and zero-result search rate
- Eligibility calculation errors (rules that fail to evaluate / throw, tracked as defects, not accepted output)
- Data correction rate (how often admins have to fix published data — a data-quality signal, lower is better)

---

## 26. Product Principles

1. Accuracy over speed — never rush unverified data to publish.
2. Official sources are authoritative; the platform is a lens onto them, not a replacement.
3. Eligibility must be explainable — no unexplained black-box verdicts.
4. AI assists but never makes the final eligibility decision.
5. User privacy is important — sensitive attributes (category, DOB) are protected and purpose-limited.
6. Do not collect unnecessary personal data.
7. The platform must clearly distinguish itself from government websites at every touchpoint.
8. Users should always have direct access to the official notification.
9. Never invent job information.
10. Freshness of job information is a first-class product concern, not an afterthought.
