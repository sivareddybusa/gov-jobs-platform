import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ExamRow } from "@/db/exams";

type DB = SupabaseClient<Database>;

export type ExamTargetRow = Database["public"]["Tables"]["user_exam_targets"]["Row"];
export type ExamTargetWithExam = ExamTargetRow & {
  exams: Pick<ExamRow, "id" | "slug" | "name" | "short_name" | "category" | "status"> | null;
};

// `profileId` is always the server-resolved session id; the own-row RLS
// policies on user_exam_targets are the independent second layer.

export async function listExamTargets(db: DB, profileId: string): Promise<ExamTargetWithExam[]> {
  const { data } = await db
    .from("user_exam_targets")
    .select("*, exams(id, slug, name, short_name, category, status)")
    .eq("profile_id", profileId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  return (data as ExamTargetWithExam[] | null) ?? [];
}

export async function getExamTarget(
  db: DB,
  profileId: string,
  targetId: string,
): Promise<ExamTargetRow | null> {
  const { data } = await db
    .from("user_exam_targets")
    .select("*")
    .eq("profile_id", profileId)
    .eq("id", targetId)
    .maybeSingle();
  return data;
}

export async function getTargetForExam(
  db: DB,
  profileId: string,
  examId: string,
): Promise<ExamTargetRow | null> {
  const { data } = await db
    .from("user_exam_targets")
    .select("*")
    .eq("profile_id", profileId)
    .eq("exam_id", examId)
    .maybeSingle();
  return data;
}

export async function insertExamTarget(
  db: DB,
  row: { profileId: string; examId: string; isPrimary: boolean; targetYear: number | null },
): Promise<{ data: ExamTargetRow | null; error: PostgrestError | null }> {
  return db
    .from("user_exam_targets")
    .insert({
      profile_id: row.profileId,
      exam_id: row.examId,
      is_primary: row.isPrimary,
      target_year: row.targetYear,
    })
    .select("*")
    .single();
}

export async function updateExamTarget(
  db: DB,
  profileId: string,
  targetId: string,
  patch: Partial<Pick<ExamTargetRow, "status" | "is_primary" | "ended_at" | "target_year">>,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await db
    .from("user_exam_targets")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("profile_id", profileId)
    .eq("id", targetId);
  return { error };
}

export async function setPrimaryExamTarget(
  db: DB,
  targetId: string,
): Promise<{ error: PostgrestError | null }> {
  const { error } = await db.rpc("set_primary_exam_target", { target_id: targetId });
  return { error };
}
