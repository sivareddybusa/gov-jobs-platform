import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;
type MaterialInsert = Database["public"]["Tables"]["exam_materials"]["Insert"];
export type ExamForMaterials = Pick<
  Database["public"]["Tables"]["exams"]["Row"],
  "id" | "name" | "official_website_url" | "materials_synced_at"
>;

// Sync helpers: always called with the SERVICE-ROLE client.

export async function listExamsNeedingMaterials(
  db: DB,
  limit: number,
  staleDays = 7,
  onlyIds?: string[],
): Promise<ExamForMaterials[]> {
  const cutoff = new Date(Date.now() - staleDays * 86_400_000).toISOString();
  let q = db
    .from("exams")
    .select("id, name, official_website_url, materials_synced_at")
    .eq("status", "published")
    .in("verification_status", ["admin_verified", "auto_verified"])
    .or(`materials_synced_at.is.null,materials_synced_at.lt.${cutoff}`)
    .order("materials_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (onlyIds) q = q.in("id", onlyIds);
  const { data } = await q;
  return data ?? [];
}

export async function upsertMaterials(db: DB, rows: MaterialInsert[]) {
  if (rows.length === 0) return { error: null };
  return db.from("exam_materials").upsert(rows, { onConflict: "exam_id,url" });
}

export async function markMaterialsSynced(db: DB, examId: string, error: string | null) {
  return db
    .from("exams")
    .update({
      materials_synced_at: new Date().toISOString(),
      materials_error: error ? error.slice(0, 500) : null,
    })
    .eq("id", examId);
}
