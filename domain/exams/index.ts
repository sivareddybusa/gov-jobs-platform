export const EXAM_CATEGORIES = [
  "banking",
  "ssc",
  "railways",
  "upsc",
  "defence",
  "teaching",
  "police",
  "state_psc",
  "insurance",
  "engineering",
  "other",
] as const;
export type ExamCategory = (typeof EXAM_CATEGORIES)[number];

export const EXAM_CATEGORY_LABELS: Record<ExamCategory, string> = {
  banking: "Banking",
  ssc: "SSC",
  railways: "Railways",
  upsc: "UPSC / Civil services",
  defence: "Defence",
  teaching: "Teaching",
  police: "Police",
  state_psc: "State PSC",
  insurance: "Insurance",
  engineering: "Engineering",
  other: "Other",
};

export const EXAM_STATUSES = ["draft", "published", "archived"] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];
export const EXAM_VERIFICATION_STATUSES = [
  "pending_verification",
  "admin_verified",
  "auto_verified",
  "rejected",
] as const;
export type ExamVerificationStatus = (typeof EXAM_VERIFICATION_STATUSES)[number];

/** Lowercase, hyphenated URL slug. "IBPS RRB (Officer)" -> "ibps-rrb-officer". */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

/**
 * Official hosts: government / NIC / academic-institution domains and IBPS.
 * Anchored so "evilgov.in" and "gov.in@evil.com" do not match. Mirrors the
 * database function `is_official_exam_url` (the authoritative check).
 */
const OFFICIAL_URL = /^https:\/\/([a-z0-9-]+\.)*(gov\.in|nic\.in|ac\.in|ibps\.in)(:[0-9]+)?(\/|$)/;

export function isOfficialExamUrl(url: string | null | undefined): boolean {
  return Boolean(url) && OFFICIAL_URL.test(url!.toLowerCase());
}

export function isOfficialHost(host: string): boolean {
  return isOfficialExamUrl(`https://${host}/`);
}

export type PublishCheck = { ok: true } | { ok: false; reason: string };

/**
 * An exam may be published only when it was verified (by an admin earlier, or
 * automatically from an official domain) and points at an official website.
 * Mirrors the database CHECK constraints so the UI can give a readable reason
 * before the database refuses.
 */
export function canPublishExam(exam: {
  verificationStatus: ExamVerificationStatus;
  officialWebsiteUrl: string | null;
  sourceUrl?: string | null;
}): PublishCheck {
  if (exam.verificationStatus !== "admin_verified" && exam.verificationStatus !== "auto_verified") {
    return { ok: false, reason: "Only verified exams can be published." };
  }
  if (!exam.officialWebsiteUrl) {
    return { ok: false, reason: "The exam has no official website URL." };
  }
  if (
    exam.verificationStatus === "auto_verified" &&
    (!isOfficialExamUrl(exam.officialWebsiteUrl) || !isOfficialExamUrl(exam.sourceUrl))
  ) {
    return { ok: false, reason: "Automatic verification requires an official domain." };
  }
  return { ok: true };
}

export const TARGET_STATUSES = ["active", "paused", "removed"] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

export const TARGET_STATUS_LABELS: Record<TargetStatus, string> = {
  active: "Active",
  paused: "Paused",
  removed: "Removed",
};
