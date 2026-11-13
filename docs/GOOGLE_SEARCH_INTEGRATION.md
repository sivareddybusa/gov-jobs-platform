# Exam catalog: automatic discovery from Google + official sites

**Decision (owner, Phase 2 revision):** admins do not enter exams. The catalog is fetched automatically; admins only monitor it and can take content down. Publication is automatic **only from official domains**.

## Pipeline

```
Google Programmable Search  ->  keep only official-host results
  -> safeFetch (SSRF-guarded) -> text extraction (PDF/HTML, read-only)
  -> Gemini extracts {isExamPage, name, shortName, category, description}
  -> Zod validation -> "name literally on the page" check
  -> upsert into `exams` (service role) -> audit log
```

Code: `services/exams/sync.ts` (pure pipeline, injected providers), `services/exams/run.ts` (real providers), `lib/search/exam-search.ts`, `lib/ingestion/exam-extract.ts`, `domain/exams` (`isOfficialExamUrl`).

## Trust rules (enforced in code AND the database)

- Official = `https://` host under `gov.in`, `nic.in`, `ibps.in` or `nta.ac.in` (blanket `*.ac.in` was removed after a college blog was auto-published in the first real run) (anchored; `evilgov.in`, `gov.in@evil.com`, `evil.com/gov.in` do not match). The DB function `is_official_exam_url` and the constraint `exams_auto_verified_requires_official_host` re-check this: an `auto_verified` row cannot exist unless both `official_website_url` and `source_url` are official.
- AI output is untrusted: the exam's **website is derived from the page we fetched, never from model output**; the extracted name must appear verbatim in the page text, otherwise the page is skipped (guards against invention); redirects off an official host are skipped.
- Non-official results are never fetched, never stored.
- Re-syncing refreshes description/source/timestamps only. It **never changes status or verification**, so an admin takedown (draft/archived) survives the next sync.
- Candidates see only `published` + (`admin_verified` | `auto_verified`) exams (RLS). Every exam shows its source and last-synced time to admins.
- Admins cannot create exams (no INSERT policy); the only user-level write is `exams_update_admin` (unpublish / restore / block). Every sync action and takedown is in `audit_logs` (`actor_id` null = system).

## Configuration

| Variable | Purpose |
|---|---|
| `SERPER_API_KEY` | Preferred search provider (serper.dev, Google results). Queries add `site:gov.in OR site:nic.in OR site:ibps.in OR site:nta.ac.in`. |
| `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_ENGINE_ID` | Alternative: Google Programmable Search. New Google projects are denied access to this API ("project does not have access"), so Serper is the default route. |
| AI provider | The extractor uses whichever LLM is "In use" on Admin → AI providers (see `docs/AI_PROVIDERS.md`); `GEMINI_API_KEY` is only a fallback. |
| `CRON_SECRET` | Optional. Enables `GET /api/cron/exam-sync` with `Authorization: Bearer <secret>` for scheduled runs (e.g. daily). Disabled when unset. |

If Google or Gemini is not configured the admin page says exactly what is missing, the sync button is disabled and the cron route returns 503. Nothing else is affected, and **no exam data is invented** — the catalog simply stays empty until a sync succeeds.

## Running it

- Admin → Exams → **Sync from Google now** (admin role), or schedule `/api/cron/exam-sync`.
- A run searches up to 10 queries (organizations already tracked + exam categories), reads at most 8 official pages, then refreshes up to 8 of the stalest existing exams. Counts (added / refreshed / skipped / failed) are reported and audit-logged; per-exam failures show on the admin page.

## Testing status

Pipeline behaviour (official-only filtering, hallucination guard, redirect guard, takedown survival, failure recording, DB constraint) is covered by `tests/exams/sync.test.ts` against the real local DB with fake providers. **The live Google and Gemini calls have not been exercised** (no credentials / Gemini billing blocked), so the first real run must be watched.

## Not covered yet

Syllabus, study materials, practice questions and papers are not fetched yet; they will reuse this pipeline in later phases under the same official-domain rule.
