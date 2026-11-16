import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { questionContentKey, topicKey, type QuestionDraft, type Topic } from "@/domain/questions";
import type { SyllabusNode } from "@/domain/syllabus";

type DB = SupabaseClient<Database>;

// Sync helpers use the SERVICE-ROLE client; the list*/stats readers also work with a reviewer's
// RLS client (reviewer SELECT policies).

export type ExamForQuestions = { id: string; name: string };

/** Published, verified exams that have a syllabus, least recently generated first. */
export async function listExamsWithSyllabus(
  db: DB,
  limit: number,
  onlyIds?: string[],
): Promise<ExamForQuestions[]> {
  let q = db
    .from("exams")
    .select("id, name")
    .eq("status", "published")
    .in("verification_status", ["admin_verified", "auto_verified"])
    .eq("syllabus_status", "ok")
    .order("questions_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (onlyIds) q = q.in("id", onlyIds);
  const { data } = await q;
  return data ?? [];
}

/** The exam's syllabus as a tree (service role; no RLS filtering). */
export async function getSyllabusTree(db: DB, examId: string): Promise<SyllabusNode[]> {
  const { data } = await db
    .from("syllabus_nodes")
    .select("id, parent_id, name, position")
    .eq("exam_id", examId)
    .order("depth")
    .order("position");
  const byId = new Map<string, SyllabusNode>();
  const roots: SyllabusNode[] = [];
  for (const r of data ?? []) {
    const node: SyllabusNode = { name: r.name };
    byId.set(r.id, node);
    const parent = r.parent_id ? byId.get(r.parent_id) : undefined;
    if (parent) (parent.children ??= []).push(node);
    else if (!r.parent_id) roots.push(node);
  }
  return roots;
}

/** Number of AI questions already stored per normalized topic name. */
export async function countGeneratedByTopic(db: DB, examId: string): Promise<Map<string, number>> {
  const { data } = await db
    .from("questions")
    .select("topic")
    .eq("exam_id", examId)
    .eq("origin", "ai_generated");
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    if (!r.topic) continue;
    const k = topicKey(r.topic);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

export type NewQuestion = {
  examId: string;
  origin: "official_paper" | "ai_generated";
  draft: QuestionDraft;
  topic?: Topic | undefined;
  sourceUrl?: string | undefined;
};

/** Atomically stores a question and its answer. Returns true when new, false when it already existed. */
export async function insertQuestion(db: DB, q: NewQuestion): Promise<boolean> {
  const hash = createHash("sha256")
    .update(questionContentKey(q.draft.prompt, q.draft.options))
    .digest("hex");
  const { data, error } = await db.rpc("add_question", {
    p_exam_id: q.examId,
    p_origin: q.origin,
    ...(q.topic ? { p_subject: q.topic.subject, p_topic: q.topic.topic } : {}),
    p_prompt: q.draft.prompt.trim(),
    p_options: q.draft.options.map((o) => o.trim()),
    ...(q.draft.difficulty ? { p_difficulty: q.draft.difficulty } : {}),
    ...(q.sourceUrl ? { p_source_url: q.sourceUrl } : {}),
    p_verification: q.origin === "official_paper" ? "source_verbatim" : "ai_cross_checked",
    p_content_hash: hash,
    p_correct: q.draft.correctIndex,
    ...(q.draft.explanation.trim() ? { p_explanation: q.draft.explanation.trim() } : {}),
  });
  if (error) throw new Error("Could not store the question.");
  return data !== null;
}

export async function markQuestionsSynced(db: DB, examId: string, error: string | null) {
  return db
    .from("exams")
    .update({
      questions_synced_at: new Date().toISOString(),
      questions_error: error ? error.slice(0, 500) : null,
    })
    .eq("id", examId);
}

export type OfficialSource = { id: string; exam_id: string; url: string };

/** Official sample/model papers not read yet. */
export async function listPapersToRead(
  db: DB,
  limit: number,
  onlyExamIds?: string[],
): Promise<OfficialSource[]> {
  let q = db
    .from("exam_materials")
    .select("id, exam_id, url, exams!inner(status, verification_status)")
    .eq("kind", "sample_paper")
    .is("questions_extracted_at", null)
    .eq("exams.status", "published")
    .in("exams.verification_status", ["admin_verified", "auto_verified"])
    .order("discovered_at")
    .limit(limit);
  if (onlyExamIds) q = q.in("exam_id", onlyExamIds);
  const { data } = await q;
  return (data ?? []).map((r) => ({ id: r.id, exam_id: r.exam_id, url: r.url }));
}

export async function markPaperRead(db: DB, materialId: string) {
  return db
    .from("exam_materials")
    .update({ questions_extracted_at: new Date().toISOString() })
    .eq("id", materialId);
}

// ---- Admin monitor --------------------------------------------------------

export type QuestionStatRow = {
  examId: string;
  examName: string;
  aiPublished: number;
  officialPublished: number;
  hidden: number;
  syncedAt: string | null;
  error: string | null;
};

export async function listQuestionStats(db: DB): Promise<QuestionStatRow[]> {
  const [{ data: exams }, { data: qs }] = await Promise.all([
    db
      .from("exams")
      .select("id, name, questions_synced_at, questions_error")
      .eq("status", "published")
      .order("name"),
    db.from("questions").select("exam_id, origin, status").limit(20_000),
  ]);
  const stats = new Map<string, QuestionStatRow>();
  for (const e of exams ?? []) {
    stats.set(e.id, {
      examId: e.id,
      examName: e.name,
      aiPublished: 0,
      officialPublished: 0,
      hidden: 0,
      syncedAt: e.questions_synced_at,
      error: e.questions_error,
    });
  }
  for (const q of qs ?? []) {
    const row = stats.get(q.exam_id);
    if (!row) continue;
    if (q.status === "hidden") row.hidden++;
    else if (q.origin === "official_paper") row.officialPublished++;
    else row.aiPublished++;
  }
  return [...stats.values()];
}

export type AdminQuestionRow = {
  id: string;
  prompt: string;
  origin: string;
  status: string;
  subject: string | null;
  topic: string | null;
  examName: string;
};

export async function listRecentQuestions(db: DB, limit = 40): Promise<AdminQuestionRow[]> {
  const { data } = await db
    .from("questions")
    .select("id, prompt, origin, status, subject, topic, exams(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id,
    prompt: r.prompt,
    origin: r.origin,
    status: r.status,
    subject: r.subject,
    topic: r.topic,
    examName: r.exams?.name ?? "",
  }));
}

export async function setQuestionStatus(db: DB, id: string, status: "published" | "hidden") {
  return db.from("questions").update({ status }).eq("id", id);
}
