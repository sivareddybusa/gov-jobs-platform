import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { isOfficialExamUrl } from "@/domain/exams";
import {
  MIN_SYLLABUS_NODES,
  countNodes,
  pickSyllabusWindow,
  pruneTreeToSource,
} from "@/domain/syllabus";
import { extractionToTree } from "@/lib/validation/syllabus";
import type { ExamSearchProvider } from "@/lib/search/exam-search";
import type { SyllabusExtractor } from "@/lib/ingestion/syllabus-extract";
import type { PageReader } from "@/services/exams/sync";
import {
  listExamsNeedingSyllabus,
  markSyllabusStatus,
  replaceExamSyllabus,
  type ExamForSyllabus,
} from "@/db/admin/syllabus";
import { recordAuditEvent } from "@/lib/audit";

type DB = SupabaseClient<Database>;

export type SyllabusDeps = {
  /** Service-role client: the sync is a trusted system job. */
  db: DB;
  search: ExamSearchProvider;
  extract: SyllabusExtractor;
  readPage: PageReader;
};

export type SyllabusSummary = { exams: number; stored: number; notFound: number; failed: number };

const MAX_PAGES_PER_EXAM = 4;
const MAX_EXAMS_PER_RUN = 3;
const OFFICIAL_ONLY = "(site:gov.in OR site:nic.in OR site:ibps.in OR site:nta.ac.in)";

/** Candidate pages for one exam: its own source page first, then official search hits. */
export async function findSyllabusCandidates(
  deps: Pick<SyllabusDeps, "search">,
  exam: Pick<ExamForSyllabus, "name" | "source_url">,
): Promise<string[]> {
  const urls: string[] = [];
  const add = (u: string) => {
    if (isOfficialExamUrl(u) && !urls.includes(u)) urls.push(u);
  };
  if (exam.source_url) add(exam.source_url);
  try {
    for (const r of await deps.search.search(`${exam.name} syllabus ${OFFICIAL_ONLY}`)) add(r.url);
  } catch {
    // Search failing still leaves the exam's own source page to try.
  }
  return urls.slice(0, MAX_PAGES_PER_EXAM);
}

/**
 * Finds, extracts and stores one exam's syllabus. Returns "stored" or
 * "not_found". Throws only on an infrastructure failure (caller records it).
 */
export async function syncSyllabusForExam(
  deps: SyllabusDeps,
  exam: ExamForSyllabus,
): Promise<"stored" | "not_found"> {
  let lastError: unknown = null;
  let reachedAnyPage = false;

  for (const url of await findSyllabusCandidates(deps, exam)) {
    try {
      const page = await deps.readPage(url);
      reachedAnyPage = true;
      // Trust only the page actually fetched, and only if still official after redirects.
      if (!isOfficialExamUrl(page.finalUrl)) continue;

      const window = pickSyllabusWindow(page.text);
      const extraction = await deps.extract(window);
      if (!extraction.hasSyllabus) continue;

      const tree = pruneTreeToSource(extractionToTree(extraction), window);
      if (countNodes(tree) < MIN_SYLLABUS_NODES) continue;

      const { data, error } = await replaceExamSyllabus(deps.db, exam.id, page.finalUrl, tree);
      if (error) throw new Error("Could not store the syllabus.");
      await recordAuditEvent({
        actorId: null,
        eventType: "syllabus.auto_synced",
        entityTable: "exams",
        entityId: exam.id,
        metadata: { source_url: page.finalUrl, nodes: data },
      });
      return "stored";
    } catch (e) {
      lastError = e;
    }
  }

  // Nothing usable. If no page could even be read, that is a failure worth showing;
  // otherwise the pages simply contain no syllabus.
  if (!reachedAnyPage && lastError) throw lastError;
  return "not_found";
}

export async function runSyllabusSync(
  deps: SyllabusDeps,
  limit = MAX_EXAMS_PER_RUN,
  /** Restrict the run to these exams (used by tests so they never touch real rows). */
  onlyIds?: string[],
): Promise<SyllabusSummary> {
  const summary: SyllabusSummary = { exams: 0, stored: 0, notFound: 0, failed: 0 };
  for (const exam of await listExamsNeedingSyllabus(deps.db, limit, 7, onlyIds)) {
    summary.exams++;
    try {
      if ((await syncSyllabusForExam(deps, exam)) === "stored") summary.stored++;
      else {
        summary.notFound++;
        await markSyllabusStatus(deps.db, exam.id, "not_found", null);
      }
    } catch (e) {
      summary.failed++;
      await markSyllabusStatus(
        deps.db,
        exam.id,
        "failed",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  }
  return summary;
}
