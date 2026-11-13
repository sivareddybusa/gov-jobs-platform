import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ExamRow, ExamWithOrg } from "@/db/exams";

type DB = SupabaseClient<Database>;
type ExamInsert = Database["public"]["Tables"]["exams"]["Insert"];
type ExamUpdate = Database["public"]["Tables"]["exams"]["Update"];

// Admin reads/status changes go through the caller's own client:
// `exams_update_admin` RLS and the `enforce_exam_review_rights` trigger are the
// authoritative layers under the services/admin/exams role checks.

export async function listAllExams(db: DB): Promise<ExamWithOrg[]> {
  const { data } = await db
    .from("exams")
    .select("*, organizations(id, name)")
    .order("updated_at", { ascending: false });
  return (data as ExamWithOrg[] | null) ?? [];
}

export async function getExamById(db: DB, id: string): Promise<ExamRow | null> {
  const { data } = await db.from("exams").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function updateExamRow(
  db: DB,
  id: string,
  patch: ExamUpdate,
): Promise<{ data: ExamRow | null; error: PostgrestError | null }> {
  return db
    .from("exams")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
}

// --- Sync helpers: always called with the service-role client (RLS bypass). ---

export async function findExamBySlugOrSource(
  db: DB,
  slug: string,
  sourceUrl: string,
): Promise<ExamRow | null> {
  const { data } = await db
    .from("exams")
    .select("*")
    .or(`slug.eq.${slug},source_url.eq.${sourceUrl}`)
    .limit(1);
  return data?.[0] ?? null;
}

export async function insertSyncedExam(
  db: DB,
  input: ExamInsert,
): Promise<{ data: ExamRow | null; error: PostgrestError | null }> {
  return db.from("exams").insert(input).select("*").single();
}

export async function listExamsForRefresh(db: DB, limit: number): Promise<ExamRow[]> {
  const { data } = await db
    .from("exams")
    .select("*")
    .not("source_url", "is", null)
    .in("status", ["published", "draft"])
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  return data ?? [];
}
