import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/supabase/types";
import type { SyllabusNode } from "@/domain/syllabus";

type DB = SupabaseClient<Database>;
export type ExamForSyllabus = Pick<
  Database["public"]["Tables"]["exams"]["Row"],
  "id" | "name" | "source_url" | "syllabus_synced_at"
>;

// Sync helpers: always called with the SERVICE-ROLE client.

/** Published, verified exams whose syllabus was never synced or is older than `staleDays`. */
export async function listExamsNeedingSyllabus(
  db: DB,
  limit: number,
  staleDays = 7,
  onlyIds?: string[],
): Promise<ExamForSyllabus[]> {
  const cutoff = new Date(Date.now() - staleDays * 86_400_000).toISOString();
  let q = db
    .from("exams")
    .select("id, name, source_url, syllabus_synced_at")
    .eq("status", "published")
    .in("verification_status", ["admin_verified", "auto_verified"])
    .or(`syllabus_synced_at.is.null,syllabus_synced_at.lt.${cutoff}`)
    .order("syllabus_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (onlyIds) q = q.in("id", onlyIds);
  const { data } = await q;
  return data ?? [];
}

export async function replaceExamSyllabus(
  db: DB,
  examId: string,
  sourceUrl: string,
  tree: SyllabusNode[],
) {
  return db.rpc("replace_exam_syllabus", {
    p_exam_id: examId,
    p_source_url: sourceUrl,
    p_tree: tree as unknown as Json,
  });
}

export async function markSyllabusStatus(
  db: DB,
  examId: string,
  status: "not_found" | "failed",
  error: string | null,
) {
  return db
    .from("exams")
    .update({
      syllabus_status: status,
      syllabus_error: error ? error.slice(0, 500) : null,
      syllabus_synced_at: new Date().toISOString(),
    })
    .eq("id", examId);
}
