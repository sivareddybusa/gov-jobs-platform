# Previous-year papers (Phase 7)

Candidates see **official links** to an exam's previous-year question papers and answer keys, grouped by year, on **Previous Papers** (`/previous-papers`) for the exams they are preparing for. **No paper is hosted, copied or typed in**: real papers are copyrighted and their text must come from the conducting body, so the platform only links to the official site, exactly as in Phase 4.

## Decisions
- Papers reuse the Phase 4 pipeline and table (`exam_materials`) with two new kinds, `previous_paper` and `answer_key`. One pipeline, one set of trust rules, no second place for official links to drift.
- Only links on the exam's **own** official site (or a subdomain) and on an official host are kept; the DB enforces the host rule (`is_official_exam_url`).
- Classification and the year are **rule-based, never AI**: `classifyMaterial` (sample/model papers stay `sample_paper`; they are never presented as real papers) and `extractPaperYear`.
- The **year is shown only when the link's own title or URL states exactly one plausible year** (2000 up to the current year). A collection ("2019-2023"), no year, or an out-of-range number gives no year; the page then says "Year not stated in the link". The DB allows `paper_year` only on papers and answer keys, between 2000 and 2100.
- Papers are not tied to the exam's edition (a 2019 paper is relevant to the 2026 exam); notifications still are.
- If the exam has questions from official papers (Phase 5, with a stated answer key), the page links to Practice for them. Nothing is imported from the linked files here.

## Pipeline
`services/materials/sync.ts` now runs 6 official-only searches per exam (notification, syllabus, sample paper, guidance, previous papers, answer keys), up to 12 links per paper kind. Migration `20261118090000_phase7_previous_papers.sql` also clears `exams.materials_synced_at` so existing exams are re-checked for the new kinds (3 exams per run; cron or Admin → Exams → "Collect materials now").

## Known limits
- Links are as good as the search results: titles can be file numbers or truncated (e.g. an SSC notice titled by its file number), and some "answer key" links are notices or tentative keys for the current cycle. Each opens the official document so candidates can check.
- Some bodies publish no papers on their own site (IBPS showed none in the live check); those exams show a plain "none found yet" message.
- A link to an official index page (SSC's "Previous Year Question Paper" page) counts as a paper link; the individual papers are on that page.
- Links are not re-verified for liveness; no downloads, search inside papers, or per-paper solving yet.

## Tests
`tests/materials/domain.test.ts` (classification incl. sample-vs-real, year rules), `tests/materials/sync.test.ts` (fake search; real DB: official/own-site only, years only from the link, DB constraints on kind and year), `tests/e2e/previous-papers.spec.ts` (login required, year ordering, no invented years, safe external links, papers kept off Study Materials).
