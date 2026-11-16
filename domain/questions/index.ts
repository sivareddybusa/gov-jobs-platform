import { normalizeForMatch, type SyllabusNode } from "@/domain/syllabus";

// Pure rules for the practice question bank (no I/O, no AI). The AI only proposes;
// everything here decides whether a proposal is acceptable.

export type QuestionDraft = {
  prompt: string;
  /** Exactly four options. */
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty?: "easy" | "medium" | "hard" | undefined;
};

export type QuestionOrigin = "official_paper" | "ai_generated";
export const QUESTION_ORIGIN_LABELS: Record<QuestionOrigin, string> = {
  official_paper: "Official paper",
  ai_generated: "AI-generated practice",
};

/** Target number of AI questions per topic before it stops being picked. */
export const TARGET_QUESTIONS_PER_TOPIC = 5;
const MIN_PROMPT = 10;
const MAX_PROMPT = 600;
const MAX_OPTION = 300;

/** Questions that cannot stand alone as text: they refer to material we do not have. */
const NEEDS_EXTERNAL_MATERIAL =
  /\b(passage|paragraph below|the following (figure|graph|chart|diagram|table|pie|bar)|figure (given|shown)|shown (above|below)|given (above|below) (figure|graph|chart|table)|refer to (the )?(figure|graph|chart|diagram))\b/i;
/** Vague "about the topic itself" questions that have no single checkable answer. */
const VAGUE_META =
  /\b(purpose of|primary basis|key (difference|characteristic|feature)|main (idea|goal)|which of the following is (a|an) (difference|similarity|example of (a|an) (difference|similarity))|is important because)\b/i;
/** Options that make "exactly one correct answer" unverifiable. */
const COMPOUND_OPTION =
  /\b(all of the above|none of the above|both (a|b|c|d)\b|(a|b|c|d) and (a|b|c|d)\b|any of these|none of these)\b/i;
/** Topics whose correct answer changes with time: a model cannot be trusted on them. */
const TIME_SENSITIVE_TOPIC =
  /\b(current affairs|recent|latest|news|this year|appointments?|awards? and honou?rs|budget|schemes?)\b|\b20\d{2}\b/i;

export function isTimeSensitiveTopic(name: string): boolean {
  return TIME_SENSITIVE_TOPIC.test(name);
}

export type DraftProblem =
  | "prompt_length"
  | "needs_external_material"
  | "vague_prompt"
  | "option_count"
  | "option_empty_or_long"
  | "duplicate_options"
  | "compound_option"
  | "answer_out_of_range"
  | "missing_explanation";

/**
 * Structural checks for an AI-generated question. Returns the problems found
 * (empty = acceptable). The second-pass solve is a separate gate.
 */
export function checkGeneratedDraft(d: QuestionDraft): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const prompt = d.prompt.trim();
  if (prompt.length < MIN_PROMPT || prompt.length > MAX_PROMPT) problems.push("prompt_length");
  if (NEEDS_EXTERNAL_MATERIAL.test(prompt)) problems.push("needs_external_material");
  if (VAGUE_META.test(prompt)) problems.push("vague_prompt");
  if (d.options.length !== 4) problems.push("option_count");
  if (d.options.some((o) => o.trim().length === 0 || o.trim().length > MAX_OPTION)) {
    problems.push("option_empty_or_long");
  }
  const norm = d.options.map((o) => normalizeForMatch(o));
  if (new Set(norm).size !== norm.length) problems.push("duplicate_options");
  if (d.options.some((o) => COMPOUND_OPTION.test(o))) problems.push("compound_option");
  if (!Number.isInteger(d.correctIndex) || d.correctIndex < 0 || d.correctIndex > 3) {
    problems.push("answer_out_of_range");
  }
  if (d.explanation.trim().length < 10) problems.push("missing_explanation");
  return problems;
}

/** The independent solve must name the same option as the generator did. */
export function solveAgrees(draftIndex: number, solvedIndex: number | null | undefined): boolean {
  return typeof solvedIndex === "number" && solvedIndex === draftIndex;
}

/** Stable text key for de-duplication (hashed by the caller). */
export function questionContentKey(prompt: string, options: string[]): string {
  return [prompt, ...[...options].sort()].map((s) => normalizeForMatch(s)).join("|");
}

/** Fisher-Yates with an injectable random source; moves correctIndex with its option. */
export function shuffleOptions(
  d: QuestionDraft,
  random: () => number = Math.random,
): QuestionDraft {
  const order = d.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return {
    ...d,
    options: order.map((i) => d.options[i]!),
    correctIndex: order.indexOf(d.correctIndex),
  };
}

export type Topic = { subject: string; topic: string };

/**
 * The leaf of every branch of a syllabus tree, with its subject. A subject
 * with no children is its own topic. Time-sensitive topics are dropped.
 */
export function leafTopics(tree: SyllabusNode[]): Topic[] {
  const out: Topic[] = [];
  const walk = (node: SyllabusNode, subject: string) => {
    const kids = node.children ?? [];
    if (kids.length === 0) out.push({ subject, topic: node.name });
    else kids.forEach((k) => walk(k, subject));
  };
  tree.forEach((s) => walk(s, s.name));
  return out.filter((t) => !isTimeSensitiveTopic(t.topic) && !isTimeSensitiveTopic(t.subject));
}

/** Topics with the fewest questions first, skipping those at target. */
export function pickTopicsToGenerate(
  topics: Topic[],
  existingCounts: Map<string, number>,
  max: number,
): Topic[] {
  const key = (t: Topic) => normalizeForMatch(t.topic);
  return topics
    .map((t) => ({ t, n: existingCounts.get(key(t)) ?? 0 }))
    .filter((x) => x.n < TARGET_QUESTIONS_PER_TOPIC)
    .sort((a, b) => a.n - b.n)
    .slice(0, max)
    .map((x) => x.t);
}
export const topicKey = (topic: string) => normalizeForMatch(topic);

// ---- Official papers ------------------------------------------------------

/** An official paper is only usable when it actually states answers. */
export function hasAnswerKey(text: string): boolean {
  return /\b(answer\s*key|answers?\s*[:\-]|correct\s*answer|key\s*to\s*the\s*questions)\b/i.test(
    text,
  );
}

/**
 * Anti-invention guard for questions read from an official paper: the question
 * text and every option must literally appear in the source (tolerant of
 * punctuation, case and spacing).
 */
export function appearsVerbatim(
  d: Pick<QuestionDraft, "prompt" | "options">,
  source: string,
): boolean {
  const hay = normalizeForMatch(source);
  const has = (s: string) => {
    const n = normalizeForMatch(s);
    return n.length > 0 && hay.includes(n);
  };
  return has(d.prompt) && d.options.every(has);
}

/** Structural checks for a question read from an official paper (compound options are legitimate there). */
export function checkOfficialDraft(d: QuestionDraft): DraftProblem[] {
  return checkGeneratedDraft({ ...d, explanation: d.explanation || "Official answer key." }).filter(
    (p) => p !== "compound_option" && p !== "missing_explanation" && p !== "vague_prompt",
  );
}
