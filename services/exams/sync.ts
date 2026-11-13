import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { EXAM_CATEGORY_LABELS, isOfficialExamUrl, slugify } from "@/domain/exams";
import type { ExamSearchProvider } from "@/lib/search/exam-search";
import type { ExamExtractor } from "@/lib/ingestion/exam-extract";
import {
  findExamBySlugOrSource,
  insertSyncedExam,
  listExamsForRefresh,
  updateExamRow,
} from "@/db/admin/exams";
import { recordAuditEvent } from "@/lib/audit";

type DB = SupabaseClient<Database>;

/** Fetches a page and returns its visible text. Injected so tests never touch the network. */
export type PageReader = (url: string) => Promise<{ text: string; finalUrl: string }>;

export type SyncDeps = {
  /** Service-role client: the sync is a trusted system job. */
  db: DB;
  search: ExamSearchProvider;
  extract: ExamExtractor;
  readPage: PageReader;
};

export type SyncSummary = {
  queries: number;
  pagesRead: number;
  created: number;
  refreshed: number;
  skipped: number;
  failed: number;
};

const MAX_QUERIES = 12;
const MAX_ORG_QUERIES = 2;
const MAX_PAGES = 12;

function emptySummary(): SyncSummary {
  return { queries: 0, pagesRead: 0, created: 0, refreshed: 0, skipped: 0, failed: 0 };
}

/**
 * Search terms (not catalog data): every exam category first, then a few tracked
 * organizations that have an official website (so leftover/test orgs never crowd
 * out the real searches).
 */
export async function buildSyncQueries(db: DB): Promise<string[]> {
  const { data } = await db
    .from("organizations")
    .select("name")
    .not("website_url", "is", null)
    .order("name")
    .limit(MAX_ORG_QUERIES);
  // Ask the search engine for official domains only; results are filtered again in code.
  const officialOnly = "(site:gov.in OR site:nic.in OR site:ibps.in OR site:nta.ac.in)";
  const categoryQueries = Object.values(EXAM_CATEGORY_LABELS)
    .filter((label) => label !== "Other")
    .map((label) => `${label} recruitment examination India notification ${officialOnly}`);
  const orgQueries = (data ?? []).map((o) => `${o.name} recruitment examination ${officialOnly}`);
  return [...categoryQueries, ...orgQueries].slice(0, MAX_QUERIES);
}

/** Cheap guard against invention: the extracted name must literally appear on the page. */
export function nameAppearsOnPage(
  extraction: { name: string; shortName?: string | null | undefined },
  pageText: string,
): boolean {
  const norm = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
  const hay = norm(pageText);
  return [extraction.name, extraction.shortName]
    .filter((v): v is string => !!v)
    .some((c) => hay.includes(norm(c)));
}

type PageOutcome = "created" | "refreshed" | "skipped";

/** Reads one official page and upserts the exam it describes. Throws on a real failure. */
export async function syncExamFromPage(deps: SyncDeps, url: string): Promise<PageOutcome> {
  const page = await deps.readPage(url);
  // Trust only the page we actually fetched, and only if it is (still) official after redirects.
  if (!isOfficialExamUrl(page.finalUrl)) return "skipped";

  const extraction = await deps.extract(page.text);
  if (!extraction.isExamPage || !nameAppearsOnPage(extraction, page.text)) return "skipped";

  const slug = slugify(extraction.name);
  if (!slug || slug === "exams") return "skipped";

  const websiteUrl = new URL(page.finalUrl).origin;
  const now = new Date().toISOString();
  const existing = await findExamBySlugOrSource(deps.db, slug, page.finalUrl);

  if (existing) {
    // Refresh facts only. Never change status/verification: an admin takedown
    // (draft/archived) must survive the next sync.
    const { error } = await updateExamRow(deps.db, existing.id, {
      description: extraction.description ?? existing.description,
      source_url: page.finalUrl,
      last_synced_at: now,
      sync_status: "ok",
      sync_error: null,
    });
    if (error) throw new Error("Could not update the exam.");
    await recordAuditEvent({
      actorId: null,
      eventType: "exam.sync_refreshed",
      entityTable: "exams",
      entityId: existing.id,
      metadata: { source_url: page.finalUrl },
    });
    return "refreshed";
  }

  const { data, error } = await insertSyncedExam(deps.db, {
    slug,
    name: extraction.name,
    short_name: extraction.shortName ?? null,
    category: extraction.category,
    description: extraction.description ?? null,
    official_website_url: websiteUrl,
    source_url: page.finalUrl,
    discovered_via: "google_sync",
    // Auto-publication is allowed only because the host passed isOfficialExamUrl
    // above; the database re-checks it (exams_auto_verified_requires_official_host).
    verification_status: "auto_verified",
    status: "published",
    published_at: now,
    verified_at: now,
    last_synced_at: now,
    sync_status: "ok",
  });
  if (error || !data) throw new Error("Could not save the exam.");
  await recordAuditEvent({
    actorId: null,
    eventType: "exam.auto_published",
    entityTable: "exams",
    entityId: data.id,
    metadata: { source_url: page.finalUrl, slug },
  });
  return "created";
}

async function processUrls(deps: SyncDeps, urls: string[], summary: SyncSummary) {
  for (const url of urls.slice(0, MAX_PAGES)) {
    summary.pagesRead++;
    try {
      summary[await syncExamFromPage(deps, url)]++;
    } catch (e) {
      summary.failed++;
      await markFailure(deps.db, url, e);
    }
  }
}

/** One full sync run: search -> official hosts only -> read -> extract -> validate -> store. */
export async function runExamSync(deps: SyncDeps, queries?: string[]): Promise<SyncSummary> {
  const summary = emptySummary();
  const terms = queries ?? (await buildSyncQueries(deps.db));
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const q of terms) {
    summary.queries++;
    try {
      for (const r of await deps.search.search(q)) {
        if (isOfficialExamUrl(r.url) && !seen.has(r.url)) {
          seen.add(r.url);
          urls.push(r.url);
        }
      }
    } catch {
      summary.failed++;
    }
  }
  await processUrls(deps, urls, summary);
  return summary;
}

/** Re-reads already-catalogued exams (oldest sync first) so their facts stay current. */
export async function refreshStaleExams(deps: SyncDeps, limit = MAX_PAGES): Promise<SyncSummary> {
  const summary = emptySummary();
  const exams = await listExamsForRefresh(deps.db, limit);
  await processUrls(
    deps,
    exams.flatMap((e) => (e.source_url ? [e.source_url] : [])),
    summary,
  );
  return summary;
}

async function markFailure(db: DB, sourceUrl: string, e: unknown) {
  const message = (e instanceof Error ? e.message : "Unknown error").slice(0, 500);
  await db
    .from("exams")
    .update({
      sync_status: "failed",
      sync_error: message,
      last_synced_at: new Date().toISOString(),
    })
    .eq("source_url", sourceUrl);
}
