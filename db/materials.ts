import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { MATERIAL_KINDS, PAPER_KINDS, type MaterialKind, type PaperKind } from "@/domain/materials";

type DB = SupabaseClient<Database>;
export type MaterialRow = Pick<
  Database["public"]["Tables"]["exam_materials"]["Row"],
  "id" | "kind" | "title" | "url" | "host" | "last_seen_at"
>;

/** Candidate read: RLS limits this to published, verified exams. Grouped by kind, newest first. */
export async function listMaterialsByKind(
  db: DB,
  examId: string,
): Promise<Record<MaterialKind, MaterialRow[]>> {
  const { data } = await db
    .from("exam_materials")
    .select("id, kind, title, url, host, last_seen_at")
    .eq("exam_id", examId)
    .order("discovered_at", { ascending: false });
  const grouped = Object.fromEntries(MATERIAL_KINDS.map((k) => [k, [] as MaterialRow[]])) as Record<
    MaterialKind,
    MaterialRow[]
  >;
  for (const row of data ?? []) grouped[row.kind as MaterialKind]?.push(row);
  return grouped;
}

export type PaperRow = Pick<MaterialRow, "id" | "title" | "url" | "host"> & {
  paperYear: number | null;
};

/**
 * Candidate read of an exam's official question papers and answer keys (RLS: published, verified
 * exams only). Newest year first; documents that state no year come last.
 */
export async function listPapersByKind(
  db: DB,
  examId: string,
): Promise<Record<PaperKind, PaperRow[]>> {
  const { data } = await db
    .from("exam_materials")
    .select("id, kind, title, url, host, paper_year")
    .eq("exam_id", examId)
    .in("kind", [...PAPER_KINDS])
    .order("paper_year", { ascending: false, nullsFirst: false })
    .order("title", { ascending: true });
  const grouped: Record<PaperKind, PaperRow[]> = { previous_paper: [], answer_key: [] };
  for (const r of data ?? []) {
    grouped[r.kind as PaperKind]?.push({
      id: r.id,
      title: r.title,
      url: r.url,
      host: r.host,
      paperYear: r.paper_year,
    });
  }
  return grouped;
}
