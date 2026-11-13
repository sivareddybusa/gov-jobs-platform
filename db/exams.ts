import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import type { ExamCategory } from "@/domain/exams";

type DB = SupabaseClient<Database>;

export type ExamRow = Database["public"]["Tables"]["exams"]["Row"];
export type ExamWithOrg = ExamRow & { organizations: { id: string; name: string } | null };

const EXAM_SELECT = "*, organizations(id, name)";

// Candidate-facing reads. RLS (`exams_select_published`) already limits an
// ordinary caller to published + verified exams; the explicit filters
// below keep the intent visible and make an admin viewing this page see the
// same list a candidate would.

export async function searchPublishedExams(
  db: DB,
  filters: { query?: string | undefined; category?: ExamCategory | undefined },
): Promise<ExamWithOrg[]> {
  let q = db
    .from("exams")
    .select(EXAM_SELECT)
    .eq("status", "published")
    .in("verification_status", ["admin_verified", "auto_verified"]);
  if (filters.category) q = q.eq("category", filters.category);
  const term = filters.query?.trim().replace(/[%_,()]/g, "");
  if (term) q = q.or(`name.ilike.%${term}%,short_name.ilike.%${term}%,description.ilike.%${term}%`);
  const { data } = await q.order("name").limit(60);
  return (data as ExamWithOrg[] | null) ?? [];
}

export async function getPublishedExamBySlug(db: DB, slug: string): Promise<ExamWithOrg | null> {
  const { data } = await db
    .from("exams")
    .select(EXAM_SELECT)
    .eq("slug", slug)
    .eq("status", "published")
    .in("verification_status", ["admin_verified", "auto_verified"])
    .maybeSingle();
  return data as ExamWithOrg | null;
}
