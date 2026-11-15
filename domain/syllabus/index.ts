export type SyllabusNode = { name: string; children?: SyllabusNode[] };

export const SYLLABUS_LEVEL_LABELS = ["Subject", "Chapter", "Topic"] as const;
/** Fewer nodes than this is not a syllabus (probably a stray list); treated as "not found". */
export const MIN_SYLLABUS_NODES = 5;
const MAX_NODES = 600;
const MAX_NAME = 300;

/** Lowercase letters/digits only, single spaces: tolerant matching of names against page text. */
export function normalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** True when the name literally occurs in the (already normalized) source text. */
export function nameAppearsInText(name: string, normalizedText: string): boolean {
  const n = normalizeForMatch(name);
  return n.length > 0 && normalizedText.includes(n);
}

export function countNodes(tree: SyllabusNode[]): number {
  return tree.reduce((sum, n) => sum + 1 + countNodes(n.children ?? []), 0);
}

/**
 * Cleans an extracted tree. Guards against invention: every node's name must
 * appear in the source text, otherwise the node and its subtree are dropped.
 * Also trims, de-duplicates per parent, and caps size. Pure.
 */
export function pruneTreeToSource(tree: SyllabusNode[], sourceText: string): SyllabusNode[] {
  const hay = normalizeForMatch(sourceText);
  let budget = MAX_NODES;

  const walk = (nodes: SyllabusNode[], depth: number): SyllabusNode[] => {
    if (depth > 3) return [];
    const seen = new Set<string>();
    const out: SyllabusNode[] = [];
    for (const raw of nodes) {
      if (budget <= 0) break;
      const name = raw.name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
      const key = name.toLowerCase();
      if (!name || seen.has(key) || !nameAppearsInText(name, hay)) continue;
      seen.add(key);
      budget--;
      const children = walk(raw.children ?? [], depth + 1);
      out.push(children.length > 0 ? { name, children } : { name });
    }
    return out;
  };
  return walk(tree, 1);
}

/**
 * A syllabus is usually a small part of a long notification. Returns a window
 * of at most `max` characters starting just before the first "syllabus"-like
 * heading, or the start of the text when there is none.
 */
export function pickSyllabusWindow(text: string, max = 40_000): string {
  const m = /syllabus|scheme of examination|exam(ination)? pattern/i.exec(text);
  const start = m ? Math.max(0, m.index - 500) : 0;
  return text.slice(start, start + max);
}

/**
 * Exam names are often one edition's notice title ("CRP PO/MT-XVI", "Combined
 * Graduate Level Examination, 2026"). The syllabus lives under the recurring
 * exam's general name, so also search without years, edition numerals and
 * parenthetical notes. Pure.
 */
export function baseExamName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(19|20)\d{2}(-\d{2,4})?\b/g, " ")
    .replace(/[-\s]+(?=[IVXL]{1,6}\b)[IVXL]{1,6}\b/gi, " ")
    .replace(/[,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Distinct, non-empty search names for an exam: the full name first, then the base name. */
export function syllabusSearchNames(name: string): string[] {
  const base = baseExamName(name);
  return [...new Set([name.trim(), base].filter((n) => n.length >= 3))];
}

/** Search hits that look like a syllabus document/page come first (stable otherwise). */
export function rankSyllabusHits<T extends { url: string; title?: string }>(hits: T[]): T[] {
  const score = (h: T) =>
    /syllab|scheme[-_ ]of[-_ ]exam|exam[-_ ]pattern/i.test(`${h.url} ${h.title ?? ""}`) ? 0 : 1;
  return hits
    .map((h, i) => ({ h, i }))
    .sort((a, b) => score(a.h) - score(b.h) || a.i - b.i)
    .map((x) => x.h);
}

const GENERIC_WORDS = new Set([
  "exam",
  "examination",
  "recruitment",
  "common",
  "process",
  "the",
  "of",
  "for",
  "and",
  "in",
  "to",
  "test",
]);

/**
 * Guards against attaching another exam's syllabus: most of the exam's
 * distinctive name words must appear near the top of the page (its title area).
 * Pure; the page's own edition may differ from the exam's (shown via the source link).
 */
export function pageIsAboutExam(examName: string, pageText: string, headChars = 5000): boolean {
  const words = normalizeForMatch(baseExamName(examName))
    .split(" ")
    .filter((w) => w.length >= 2 && !GENERIC_WORDS.has(w));
  if (words.length === 0) return false;
  const head = normalizeForMatch(pageText.slice(0, headChars));
  const hits = words.filter((w) => head.split(" ").includes(w)).length;
  return hits / words.length >= 0.75;
}
