export const MATERIAL_KINDS = ["notification", "syllabus", "sample_paper", "guidance"] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];

/** Previous-year question papers and answer keys (shown on Previous Papers, not Study Materials). */
export const PAPER_KINDS = ["previous_paper", "answer_key"] as const;
export type PaperKind = (typeof PAPER_KINDS)[number];

export type AnyMaterialKind = MaterialKind | PaperKind;

export const PAPER_KIND_LABELS: Record<PaperKind, string> = {
  previous_paper: "Question papers",
  answer_key: "Answer keys",
};

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  notification: "Notifications & advertisements",
  syllabus: "Syllabus & exam pattern",
  sample_paper: "Official sample / model papers",
  guidance: "Instructions & guidance",
};

const CLASSIFIERS: Array<[AnyMaterialKind, RegExp]> = [
  // Order matters: more specific kinds first.
  [
    "sample_paper",
    /sample[-_ ]?(question[-_ ]?)?paper|model[-_ ]?(question[-_ ]?)?paper|mock[-_ ]?(test|paper)|practice[-_ ]?(set|paper)/i,
  ],
  ["answer_key", /answer[-_ ]?keys?|final[-_ ]?keys?|provisional[-_ ]?keys?|answer[-_ ]?sheet/i],
  [
    "previous_paper",
    /previous[-_ ]?(year|years)|past[-_ ]?(year[-_ ]?)?(question[-_ ]?)?papers?|question[-_ ]?papers?\b|old[-_ ]?(question[-_ ]?)?papers?|\bpyqs?\b/i,
  ],
  ["syllabus", /syllab|scheme[-_ ]of[-_ ](the[-_ ])?exam|exam(ination)?[-_ ]pattern/i],
  [
    "notification",
    /notification|advertis|advt\b|notice[-_ ]of[-_ ](the[-_ ])?exam|detailed[-_ ]?notice/i,
  ],
  [
    "guidance",
    /instruction|guideline|\bfaq|user[-_ ]?(manual|guide)|information[-_ ]?(brochure|bulletin)|candidate[-_ ]?guide|how[-_ ]to[-_ ]apply/i,
  ],
];

/**
 * Classifies a document from its URL and title with fixed rules (no AI, so no
 * invention). Returns null when unsure.
 */
export function classifyMaterial(input: { url: string; title: string }): AnyMaterialKind | null {
  const text = `${input.url} ${input.title}`;
  for (const [kind, re] of CLASSIFIERS) if (re.test(text)) return kind;
  return null;
}

/**
 * The exam year a paper or answer key names in its own title/URL. Null when none is stated
 * or when several different years appear (a collection, e.g. "2019-2023"): never guessed.
 */
export function extractPaperYear(
  input: { url: string; title: string },
  latestYear = new Date().getFullYear(),
): number | null {
  const years = new Set(
    [...`${input.title} ${input.url}`.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)]
      .map((m) => Number(m[1]))
      .filter((y) => y >= 2000 && y <= latestYear),
  );
  return years.size === 1 ? [...years][0]! : null;
}

/** Tidies a search-result title for display: collapses whitespace, strips site suffixes, caps length. */
export function cleanMaterialTitle(title: string, fallback: string): string {
  let t = title.replace(/\s+/g, " ").trim();
  // Strip trailing "| Site name" fragments, repeatedly ("A | Staff Selection Commission | GoI").
  const suffix = /\s*[|–—-]\s*(Staff Selection Commission|GoI|Government of India|UPSC|IBPS)\s*$/i;
  while (suffix.test(t)) t = t.replace(suffix, "").trim();
  t = t.slice(0, 300);
  return t.length >= 3 ? t : fallback.slice(0, 300);
}

/** Site part of a host without a leading "www." ("www.ibps.in" -> "ibps.in"). */
function siteOf(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

/**
 * True when the link is on the exam's own official site or one of its
 * subdomains (ibps.in covers ibpsreg.ibps.in). Keeps "official" honest:
 * a government portal that merely hosts practice sets is not the conducting body.
 */
export function isOnExamSite(linkUrl: string, officialWebsiteUrl: string | null): boolean {
  if (!officialWebsiteUrl) return false;
  try {
    const site = siteOf(new URL(officialWebsiteUrl).hostname);
    const host = siteOf(new URL(linkUrl).hostname);
    return host === site || host.endsWith(`.${site}`);
  } catch {
    return false;
  }
}

const ROMAN = /(?<![A-Za-z])([IVXL]{2,6})(?![A-Za-z])/g;
const YEAR = /(?<!\d)(20\d{2})(?!\d)/g;

function tokens(re: RegExp, text: string): string[] {
  return [...text.toUpperCase().matchAll(re)].map((m) => m[1]!);
}

/**
 * A notification belongs to ONE edition (CRP SPL-XIV, CGL 2026). When the exam
 * name carries an edition numeral or year, a notification link that names only
 * other editions/years is dropped; links that name no edition pass. Pure.
 */
export function notificationMatchesEdition(examName: string, linkText: string): boolean {
  for (const re of [ROMAN, YEAR]) {
    const wanted = tokens(re, examName);
    const present = tokens(re, linkText);
    if (wanted.length > 0 && present.length > 0 && !present.some((t) => wanted.includes(t))) {
      return false;
    }
  }
  return true;
}
