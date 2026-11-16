import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getExamSearchProvider } from "@/lib/search/exam-search";
import { extractExamFromText } from "@/lib/ingestion/exam-extract";
import { isLlmConfigured } from "@/lib/llm/resolve";
import { safeFetch } from "@/lib/ingestion/safe-fetch";
import { extractText } from "@/lib/ingestion/extract-text";
import { extractSyllabusFromText } from "@/lib/ingestion/syllabus-extract";
import { runMaterialsSync, type MaterialsSummary } from "@/services/materials/sync";
import { runSyllabusSync, type SyllabusSummary } from "@/services/syllabus/sync";
import { refreshStaleExams, runExamSync, type PageReader, type SyncSummary } from "./sync";

const readPage: PageReader = async (url) => {
  const res = await safeFetch(url, { timeoutMs: 30_000, maxBytes: 5 * 1024 * 1024 });
  const { text } = await extractText(res.body);
  return { text, finalUrl: res.finalUrl };
};

export type SyncAvailability = { search: boolean; extractor: boolean };

export async function getSyncAvailability(): Promise<SyncAvailability> {
  return { search: getExamSearchProvider() !== null, extractor: await isLlmConfigured() };
}

export type RunResult =
  { status: "ok"; summary: SyncSummary } | { status: "unavailable"; reason: string };

/** Runs discovery + refresh with the real providers. Used by the admin button and the cron route. */
export async function runConfiguredExamSync(): Promise<RunResult> {
  const search = getExamSearchProvider();
  if (!search) {
    return {
      status: "unavailable",
      reason: "Google Search is not configured (GOOGLE_SEARCH_API_KEY / GOOGLE_SEARCH_ENGINE_ID).",
    };
  }
  if (!(await isLlmConfigured())) {
    return {
      status: "unavailable",
      reason: "No AI provider is in use. A super admin can add one under Admin → AI providers.",
    };
  }
  const deps = { db: createAdminClient(), search, extract: extractExamFromText, readPage };
  const discovered = await runExamSync(deps);
  const refreshed = await refreshStaleExams(deps);
  return {
    status: "ok",
    summary: {
      queries: discovered.queries,
      pagesRead: discovered.pagesRead + refreshed.pagesRead,
      created: discovered.created + refreshed.created,
      refreshed: discovered.refreshed + refreshed.refreshed,
      skipped: discovered.skipped + refreshed.skipped,
      failed: discovered.failed + refreshed.failed,
    },
  };
}

export type SyllabusRunResult =
  { status: "ok"; summary: SyllabusSummary } | { status: "unavailable"; reason: string };

/** Fetches syllabi for published exams that have none yet (or a stale one). */
export async function runConfiguredSyllabusSync(): Promise<SyllabusRunResult> {
  const search = getExamSearchProvider();
  if (!search)
    return { status: "unavailable", reason: "No search provider is configured (SERPER_API_KEY)." };
  if (!(await isLlmConfigured())) {
    return {
      status: "unavailable",
      reason: "No AI provider is in use. A super admin can add one under Admin → AI providers.",
    };
  }
  const summary = await runSyllabusSync({
    db: createAdminClient(),
    search,
    extract: extractSyllabusFromText,
    readPage,
  });
  return { status: "ok", summary };
}

export type MaterialsRunResult =
  { status: "ok"; summary: MaterialsSummary } | { status: "unavailable"; reason: string };

/** Collects official document links for published exams that have none yet (or stale ones). No AI needed. */
export async function runConfiguredMaterialsSync(): Promise<MaterialsRunResult> {
  const search = getExamSearchProvider();
  if (!search)
    return { status: "unavailable", reason: "No search provider is configured (SERPER_API_KEY)." };
  return { status: "ok", summary: await runMaterialsSync({ db: createAdminClient(), search }) };
}
