import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  appearsVerbatim,
  checkGeneratedDraft,
  checkOfficialDraft,
  hasAnswerKey,
  leafTopics,
  pickTopicsToGenerate,
  shuffleOptions,
  solveAgrees,
  type Topic,
} from "@/domain/questions";
import type {
  OfficialQuestionExtractor,
  QuestionGenerator,
  QuestionSolver,
} from "@/lib/ingestion/question-extract";
import type { PageReader } from "@/services/exams/sync";
import {
  countGeneratedByTopic,
  getSyllabusTree,
  insertQuestion,
  listExamsWithSyllabus,
  listPapersToRead,
  markPaperRead,
  markQuestionsSynced,
  type ExamForQuestions,
} from "@/db/admin/questions";
import { recordAuditEvent } from "@/lib/audit";

type DB = SupabaseClient<Database>;

export type QuestionDeps = {
  /** Service-role client: generation is a trusted system job. */
  db: DB;
  generate: QuestionGenerator;
  solve: QuestionSolver;
  extractOfficial: OfficialQuestionExtractor;
  readPage: PageReader;
  /** Injectable for tests. */
  random?: () => number;
};

export type QuestionSummary = {
  topics: number;
  proposed: number;
  published: number;
  rejected: number;
  papers: number;
  official: number;
  failed: number;
};

const TOPICS_PER_RUN = 3;
const EXAMS_PER_RUN = 3;
const QUESTIONS_PER_TOPIC_CALL = 5;
const PAPERS_PER_RUN = 2;

export function emptyQuestionSummary(): QuestionSummary {
  return { topics: 0, proposed: 0, published: 0, rejected: 0, papers: 0, official: 0, failed: 0 };
}

/**
 * AI path for one topic: generate -> structural checks -> an independent solve
 * must pick the same answer -> store. Anything that fails a gate is dropped.
 * Returns {proposed, published}.
 */
export async function generateForTopic(
  deps: QuestionDeps,
  exam: ExamForQuestions,
  topic: Topic,
): Promise<{ proposed: number; published: number }> {
  const drafts = await deps.generate({
    examName: exam.name,
    subject: topic.subject,
    topic: topic.topic,
    count: QUESTIONS_PER_TOPIC_CALL,
  });
  const structurallyOk = drafts.filter((d) => checkGeneratedDraft(d).length === 0);
  if (structurallyOk.length === 0) return { proposed: drafts.length, published: 0 };

  // Two independent solves must both pick the generator's answer. The solver never sees that
  // answer, and the second solve gets the options in reverse order, so an ambiguous question or a
  // position-biased pick is caught (the answer would move).
  const forward = structurallyOk.map((d) => ({ prompt: d.prompt, options: d.options }));
  const reversed = forward.map((d) => ({ prompt: d.prompt, options: [...d.options].reverse() }));
  const [first, second] = [await deps.solve(forward), await deps.solve(reversed)];
  let published = 0;
  for (const [i, d] of structurallyOk.entries()) {
    const reversedAnswer = second[i];
    const backInOriginalOrder =
      typeof reversedAnswer === "number" ? d.options.length - 1 - reversedAnswer : null;
    if (
      !solveAgrees(d.correctIndex, first[i]) ||
      !solveAgrees(d.correctIndex, backInOriginalOrder)
    ) {
      continue;
    }
    const stored = await insertQuestion(deps.db, {
      examId: exam.id,
      origin: "ai_generated",
      draft: shuffleOptions(d, deps.random),
      topic,
    });
    if (stored) published++;
  }
  return { proposed: drafts.length, published };
}

/** Reads one official paper and stores the questions it literally contains, with its own answer key. */
export async function importOfficialPaper(
  deps: QuestionDeps,
  paper: { examId: string; url: string },
): Promise<{ proposed: number; published: number }> {
  const page = await deps.readPage(paper.url);
  // Without a stated answer key nothing can be verified, so nothing is imported.
  if (!hasAnswerKey(page.text)) return { proposed: 0, published: 0 };

  const extracted = await deps.extractOfficial(page.text);
  let published = 0;
  for (const q of extracted) {
    if (q.correctIndex === null) continue;
    const draft = {
      prompt: q.prompt,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: "",
    };
    if (checkOfficialDraft(draft).length > 0) continue;
    if (!appearsVerbatim(draft, page.text)) continue;
    const stored = await insertQuestion(deps.db, {
      examId: paper.examId,
      origin: "official_paper",
      draft: { ...draft, explanation: "Official answer key." },
      sourceUrl: page.finalUrl,
    });
    if (stored) published++;
  }
  return { proposed: extracted.length, published };
}

/** One run: read a few unread official papers, then generate for the thinnest syllabus topics. */
export async function runQuestionSync(
  deps: QuestionDeps,
  /** Restrict to these exams (tests use this so they never touch real rows). */
  onlyIds?: string[],
): Promise<QuestionSummary> {
  const summary = emptyQuestionSummary();

  for (const paper of await listPapersToRead(deps.db, PAPERS_PER_RUN, onlyIds)) {
    summary.papers++;
    try {
      const r = await importOfficialPaper(deps, { examId: paper.exam_id, url: paper.url });
      summary.official += r.published;
      summary.proposed += r.proposed;
      summary.rejected += r.proposed - r.published;
      await markPaperRead(deps.db, paper.id);
    } catch {
      // Not marked as read: it is retried on a later run.
      summary.failed++;
    }
  }

  let budget = TOPICS_PER_RUN;
  for (const exam of await listExamsWithSyllabus(deps.db, EXAMS_PER_RUN, onlyIds)) {
    if (budget <= 0) break;
    const tree = await getSyllabusTree(deps.db, exam.id);
    const counts = await countGeneratedByTopic(deps.db, exam.id);
    const topics = pickTopicsToGenerate(leafTopics(tree), counts, budget);
    let firstError: string | null = null;
    for (const topic of topics) {
      budget--;
      summary.topics++;
      try {
        const r = await generateForTopic(deps, exam, topic);
        summary.proposed += r.proposed;
        summary.published += r.published;
        summary.rejected += r.proposed - r.published;
      } catch (e) {
        summary.failed++;
        firstError ??= e instanceof Error ? e.message : "Unknown error";
      }
    }
    await markQuestionsSynced(deps.db, exam.id, firstError);
    if (topics.length > 0) {
      await recordAuditEvent({
        actorId: null,
        eventType: "questions.auto_generated",
        entityTable: "exams",
        entityId: exam.id,
        metadata: { topics: topics.length, published: summary.published },
      });
    }
  }
  return summary;
}
