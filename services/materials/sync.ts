import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { isOfficialExamUrl } from "@/domain/exams";
import { pageIsAboutExam, baseExamName } from "@/domain/syllabus";
import {
  classifyMaterial,
  cleanMaterialTitle,
  isOnExamSite,
  notificationMatchesEdition,
  type MaterialKind,
} from "@/domain/materials";
import type { ExamSearchProvider } from "@/lib/search/exam-search";
import {
  listExamsNeedingMaterials,
  markMaterialsSynced,
  upsertMaterials,
  type ExamForMaterials,
} from "@/db/admin/materials";
import { recordAuditEvent } from "@/lib/audit";

type DB = SupabaseClient<Database>;

export type MaterialsDeps = {
  /** Service-role client: the sync is a trusted system job. */
  db: DB;
  search: ExamSearchProvider;
};

export type MaterialsSummary = { exams: number; links: number; failed: number };

const OFFICIAL_ONLY = "(site:gov.in OR site:nic.in OR site:ibps.in OR site:nta.ac.in)";
const MAX_PER_KIND = 4;
const MAX_EXAMS_PER_RUN = 3;

const KIND_QUERIES = (name: string) => [
  `${name} notification advertisement pdf ${OFFICIAL_ONLY}`,
  `${name} syllabus scheme of examination ${OFFICIAL_ONLY}`,
  `${name} sample model paper ${OFFICIAL_ONLY}`,
  `${name} instructions guidelines candidates ${OFFICIAL_ONLY}`,
];

export type FoundMaterial = { kind: MaterialKind; title: string; url: string; host: string };

/**
 * Official, classified, exam-relevant links for one exam. Relevance uses the
 * search engine's own title/snippet/url (most of the exam's name words must
 * appear); classification uses fixed rules. No AI is involved, so nothing can
 * be invented: every link is one the search engine returned on an official host.
 */
export async function findMaterialsForExam(
  deps: Pick<MaterialsDeps, "search">,
  exam: Pick<ExamForMaterials, "name" | "official_website_url">,
): Promise<FoundMaterial[]> {
  const searchName = baseExamName(exam.name) || exam.name;
  const seen = new Set<string>();
  const perKind = new Map<MaterialKind, number>();
  const found: FoundMaterial[] = [];

  for (const q of KIND_QUERIES(searchName)) {
    let hits;
    try {
      hits = await deps.search.search(q);
    } catch {
      continue; // one failing query must not lose the others
    }
    for (const h of hits) {
      if (seen.has(h.url) || !isOfficialExamUrl(h.url)) continue;
      // Only the exam's own conducting-body site counts as "official" material.
      if (!isOnExamSite(h.url, exam.official_website_url)) continue;
      seen.add(h.url);
      if (!pageIsAboutExam(exam.name, `${h.title} ${h.snippet} ${h.url}`)) continue;
      const kind = classifyMaterial({ url: h.url, title: h.title });
      if (!kind || (perKind.get(kind) ?? 0) >= MAX_PER_KIND) continue;
      // A notification belongs to one edition; skip other editions' notices.
      if (kind === "notification" && !notificationMatchesEdition(exam.name, `${h.url} ${h.title}`))
        continue;
      perKind.set(kind, (perKind.get(kind) ?? 0) + 1);
      found.push({ kind, title: cleanMaterialTitle(h.title, h.url), url: h.url, host: h.host });
    }
  }
  return found;
}

export async function syncMaterialsForExam(
  deps: MaterialsDeps,
  exam: ExamForMaterials,
): Promise<number> {
  const found = await findMaterialsForExam(deps, exam);
  const now = new Date().toISOString();
  const { error } = await upsertMaterials(
    deps.db,
    found.map((m) => ({ ...m, exam_id: exam.id, last_seen_at: now })),
  );
  if (error) throw new Error("Could not store the materials.");
  await markMaterialsSynced(deps.db, exam.id, null);
  if (found.length > 0) {
    await recordAuditEvent({
      actorId: null,
      eventType: "materials.auto_synced",
      entityTable: "exams",
      entityId: exam.id,
      metadata: { links: found.length },
    });
  }
  return found.length;
}

export async function runMaterialsSync(
  deps: MaterialsDeps,
  limit = MAX_EXAMS_PER_RUN,
  /** Restrict the run to these exams (used by tests so they never touch real rows). */
  onlyIds?: string[],
): Promise<MaterialsSummary> {
  const summary: MaterialsSummary = { exams: 0, links: 0, failed: 0 };
  for (const exam of await listExamsNeedingMaterials(deps.db, limit, 7, onlyIds)) {
    summary.exams++;
    try {
      summary.links += await syncMaterialsForExam(deps, exam);
    } catch (e) {
      summary.failed++;
      await markMaterialsSynced(deps.db, exam.id, e instanceof Error ? e.message : "Unknown error");
    }
  }
  return summary;
}
