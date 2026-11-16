import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { MATERIAL_KINDS, type MaterialKind } from "@/domain/materials";

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
