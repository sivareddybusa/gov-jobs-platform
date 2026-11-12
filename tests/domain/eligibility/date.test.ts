import { describe, expect, it } from "vitest";
import { calculateAge } from "@/domain/eligibility/date";

// Age-boundary table-driven tests (ELIGIBILITY_ENGINE.md §5, task Phase 5's
// required coverage: "age boundaries, cutoff dates").

describe("calculateAge", () => {
  it("matches the spec's worked example: DOB 2000-08-15, cutoff 2026-08-14 -> 25", () => {
    expect(calculateAge("2000-08-15", "2026-08-14")).toBe(25);
  });

  it("birthday exactly on the cutoff date counts as occurred (inclusive) -> 26", () => {
    expect(calculateAge("2000-08-15", "2026-08-15")).toBe(26);
  });

  it("day after the birthday -> 26", () => {
    expect(calculateAge("2000-08-15", "2026-08-16")).toBe(26);
  });

  it("day before the birthday -> 25", () => {
    expect(calculateAge("2000-08-15", "2026-08-14")).toBe(25);
  });

  it("Feb 29 birthday, non-leap cutoff year, cutoff on Feb 28 -> birthday not yet occurred", () => {
    // 2001 is not a leap year. Feb 29 birthday is treated as occurring on
    // March 1 in a non-leap cutoff year (ELIGIBILITY_ENGINE.md §5).
    expect(calculateAge("2000-02-29", "2001-02-28")).toBe(0);
  });

  it("Feb 29 birthday, non-leap cutoff year, cutoff on Mar 1 -> birthday occurred", () => {
    expect(calculateAge("2000-02-29", "2001-03-01")).toBe(1);
  });

  it("Feb 29 birthday, leap cutoff year, cutoff exactly on Feb 29 -> birthday occurred", () => {
    expect(calculateAge("2000-02-29", "2004-02-29")).toBe(4);
  });

  it("returns null when date_of_birth is null", () => {
    expect(calculateAge(null, "2026-01-01")).toBeNull();
  });

  it("returns null when date_of_birth is malformed", () => {
    expect(calculateAge("not-a-date", "2026-01-01")).toBeNull();
  });

  it("returns null when date_of_birth is in the future relative to the cutoff", () => {
    expect(calculateAge("2030-01-01", "2026-01-01")).toBeNull();
  });

  it("returns null when date_of_birth equals the cutoff date (zero/negative age, never fabricated)", () => {
    expect(calculateAge("2026-01-01", "2026-01-01")).toBeNull();
  });

  it("uses the post-specific cutoff date, never a wall-clock 'today'", () => {
    // Two different cutoff dates for the same DOB must produce different
    // ages — proving the function never falls back to system time.
    const dob = "1998-05-14";
    expect(calculateAge(dob, "2020-05-13")).toBe(21);
    expect(calculateAge(dob, "2020-05-14")).toBe(22);
  });
});
