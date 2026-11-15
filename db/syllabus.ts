import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { SyllabusNode } from "@/domain/syllabus";

type DB = SupabaseClient<Database>;

export type SyllabusView = {
  tree: SyllabusNode[];
  total: number;
  sourceUrl: string | null;
  syncedAt: string | null;
};

/** Candidate read: RLS limits this to published, verified exams. */
export async function getSyllabus(db: DB, examId: string): Promise<SyllabusView> {
  const [{ data: nodes }, { data: exam }] = await Promise.all([
    db
      .from("syllabus_nodes")
      .select("id, parent_id, depth, name, position, source_url")
      .eq("exam_id", examId)
      .order("depth")
      .order("position"),
    db
      .from("exams")
      .select("syllabus_synced_at, syllabus_source_url")
      .eq("id", examId)
      .maybeSingle(),
  ]);
  const rows = nodes ?? [];
  const byId = new Map<string, SyllabusNode & { _pos: number }>();
  const roots: Array<SyllabusNode & { _pos: number }> = [];
  for (const r of rows) {
    const node: SyllabusNode & { _pos: number } = { name: r.name, _pos: r.position };
    byId.set(r.id, node);
    const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
    if (parent) (parent.children ??= []).push(node);
    else if (!r.parent_id) roots.push(node);
  }
  const strip = (n: SyllabusNode & { _pos?: number }): SyllabusNode => ({
    name: n.name,
    ...(n.children ? { children: n.children.map(strip) } : {}),
  });
  return {
    tree: roots.map(strip),
    total: rows.length,
    sourceUrl: exam?.syllabus_source_url ?? null,
    syncedAt: exam?.syllabus_synced_at ?? null,
  };
}
