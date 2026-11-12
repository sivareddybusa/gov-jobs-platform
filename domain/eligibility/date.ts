import type { IsoDate } from "./types";

export type ParsedDate = { year: number; month: number; day: number };

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a strict "YYYY-MM-DD" string into its numeric parts, without ever
 * constructing a `Date` object — avoids all timezone ambiguity and lets the
 * calendar-age comparison in `calculateAge` work on plain integer tuples
 * (ELIGIBILITY_ENGINE.md §5), including the Feb 29 case, with no risk of an
 * invalid-date construction.
 */
export function parseIsoDate(value: IsoDate): ParsedDate | null {
  const match = ISO_DATE_RE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  return { year, month, day };
}

/** True if `a` is strictly earlier than `b` as a calendar date. */
export function isBefore(a: ParsedDate, b: ParsedDate): boolean {
  if (a.year !== b.year) return a.year < b.year;
  if (a.month !== b.month) return a.month < b.month;
  return a.day < b.day;
}

/**
 * Calendar age at `cutoff`, per ELIGIBILITY_ENGINE.md §5's worked example:
 * a birthday that falls exactly on the cutoff date counts as having
 * occurred (inclusive). Never uses days/365 approximation. Returns null if
 * either date is missing/malformed, or if `dob` is not strictly before
 * `cutoff` (a future or invalid DOB relative to the cutoff) — callers must
 * treat a null return as `needs_verification`, never a fabricated age.
 */
export function calculateAge(dob: IsoDate | null, cutoff: IsoDate): number | null {
  if (!dob) return null;
  const dobParsed = parseIsoDate(dob);
  const cutoffParsed = parseIsoDate(cutoff);
  if (!dobParsed || !cutoffParsed) return null;
  if (!isBefore(dobParsed, cutoffParsed)) return null;

  let age = cutoffParsed.year - dobParsed.year;
  const birthdayOccurred =
    cutoffParsed.month > dobParsed.month ||
    (cutoffParsed.month === dobParsed.month && cutoffParsed.day >= dobParsed.day);
  if (!birthdayOccurred) age -= 1;
  return age;
}
