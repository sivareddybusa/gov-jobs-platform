# Exam syllabus (Phase 3)

Candidates see a syllabus tree (subject → chapter → topic) on each exam's page (`/preparation/exams/[slug]`). **Nobody types syllabus data**: it is fetched from official pages and stored by the service role.

## Pipeline (`services/syllabus/sync.ts`)
1. Pick published, verified exams with no syllabus or one older than 7 days (3 per run).
2. Candidate pages: the exam's own official source page, then official search hits for the full name and the edition-free base name (years/roman numerals stripped), plain and `filetype:pdf`, with `site:` filters. Syllabus-looking URLs/titles are tried first (max 6 pages).
   - **Wrong-exam guard:** most of the exam's distinctive name words must appear near the top of the page, otherwise the page is skipped (stops e.g. an SPL notice being attached to an RRB exam).
3. Read page → take a window around the first "syllabus / scheme of examination / exam pattern" heading → the "In use" LLM extracts `{hasSyllabus, subjects → chapters → topics}`.
4. Validate (Zod) → **prune**: every node's name must appear in the page text, otherwise the node and its subtree are dropped; de-duplicate per parent; max 3 levels, 600 nodes.
5. Fewer than 5 surviving nodes ⇒ "not found" (not stored). Otherwise `replace_exam_syllabus()` swaps the exam's whole tree atomically and records the source URL.

## Trust rules (also enforced in the database)
- `syllabus_nodes.source_url` must be an official host (`is_official_exam_url`); pages that redirect off an official host are ignored.
- Structure is enforced by a trigger (child sits one level below a parent of the same exam) and a CHECK (only subjects are roots).
- RLS: candidates/anonymous can read nodes only for published, verified exams; reviewers can read all; **no** INSERT/UPDATE/DELETE policy — only `replace_exam_syllabus` (service role) writes.
- A failed or empty re-sync never wipes an existing syllabus. Every store is audit-logged (`syllabus.auto_synced`, actor null = system).
- The UI always shows the official source link, the sync date, and a "confirm against the latest notification" note.

## Operating it
- Admin → Exams → **Fetch syllabi now** (admin role), or the cron route `GET /api/cron/exam-sync` (runs exam sync, then syllabus sync). Per-exam syllabus status (ok / not found / error) shows on the admin Exams page.

## Known limits (honest)
- First real run: SSC CGL got a full tree from the official notice/syllabus PDFs (10 subjects, 31 chapters, ~290 topics, every name verified on the page). IBPS notices publish only the exam pattern, so those trees are sections only.
- Sites that block bots (UPSC returns 403) or render only with JavaScript (ssc.gov.in HTML pages) cannot be read; PDFs on the same sites usually can. A headless browser would be a later, larger step.
- A syllabus can come from a neighbouring edition's document (e.g. 2024 syllabus for a 2026 exam). The source link on the exam page shows which; the UI tells candidates to confirm with the latest notification.
- Long syllabi take a while on large models; the Cloudflare adapter allows 150 s per call with one retry on transient errors.

## Tests
`tests/syllabus/domain.test.ts` (matching, prune guard, window), `tests/llm/syllabus-extract.test.ts`, `tests/syllabus/sync.test.ts` (real DB: only-on-page nodes, atomic replace, keep-old-on-miss, non-official/redirect guard, failure recording, RLS, structure/official-host constraints), E2E in `tests/e2e/exams.spec.ts`. Tests restrict runs to their own exams so they never touch real catalog rows.
