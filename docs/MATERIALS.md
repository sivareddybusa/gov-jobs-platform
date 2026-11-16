# Official study materials (Phase 4)

Candidates see **official document links** per exam (on the exam page and on **Study Materials** for the exams they are preparing for): notifications/advertisements, syllabus & exam pattern, official sample/model papers, and instructions/guidance. **Nothing is hosted or copied** — links open the official site — and **nobody types them**: the sync (service role) collects them.

## Decisions (owner)
- Materials = official documents as links (no cached copies, no AI-written notes). Supabase Storage is therefore **not used** in this phase; it is reserved for future user-owned files (e.g. profile documents).
- Kinds collected: notification, syllabus, sample paper, guidance. Previous-year question papers are deliberately **not** matched; they belong to the previous-papers phase.

## Pipeline (`services/materials/sync.ts`) — no AI
1. For published, verified exams with no materials or a check older than 7 days (3 per run), run 4 official-only searches (notification, syllabus, sample paper, instructions) using the edition-free exam name.
2. Keep a hit only if it is on an official host **and on the exam's own official site or a subdomain** (`ssc.gov.in`, `ibps.in` → `ibpsreg.ibps.in`); a government portal that merely hosts practice sets (e.g. ndl.gov.in) is not the conducting body.
3. Relevance: most of the exam's distinctive name words must appear in the hit's title/snippet/URL.
4. Classification by fixed rules (`classifyMaterial`), not by a model, so nothing can be invented. Unclassifiable links are dropped.
5. Notifications must match the exam's edition: a link naming only other roman-numeral editions or years is dropped (CRP SPL-XIII under SPL-XIV).
6. Upsert (idempotent), max 4 per kind; the check time is recorded and audited.

## Database
`exam_materials(exam_id, kind, title, url, host, discovered_at, last_seen_at)`, unique per (exam, url). CHECKs: `kind` enumerated, `url` must satisfy `is_official_exam_url` (https, official host). RLS: readable for published verified exams (and by reviewers); no INSERT/UPDATE/DELETE policy — only the service role writes. `exams.materials_synced_at/materials_error` feed the admin monitor.

## Operating it
Admin → Exams → **Collect materials now** (admin role; needs only the search key, no AI), or the cron route `GET /api/cron/exam-sync` (exams, then syllabus, then materials). Per-exam status shows on the admin Exams page.

## Known limits
- Titles come from search results and can be truncated or file-name-like.
- Generic documents that name no edition (e.g. "Supplementary Advertisement") can be from an older cycle; the link opens the official document so candidates can check its date.
- Links are not re-verified for liveness yet; `last_seen_at` shows when the search last returned each one.

## Tests
`tests/materials/domain.test.ts` (classification, titles, own-site rule, edition rule), `tests/materials/sync.test.ts` (fake search; real DB: idempotent upsert, only own-site/official/relevant/classifiable links, RLS, DB constraints; runs only touch their own exams), and E2E in `tests/e2e/exams.spec.ts` (exam page + Study Materials page).
