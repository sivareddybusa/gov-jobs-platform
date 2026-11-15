import { describe, expect, it } from "vitest";
import {
  countNodes,
  nameAppearsInText,
  normalizeForMatch,
  pickSyllabusWindow,
  pruneTreeToSource,
} from "@/domain/syllabus";
import { extractionToTree, syllabusExtractionSchema } from "@/lib/validation/syllabus";

describe("matching helpers", () => {
  it("normalizes case, accents and punctuation", () => {
    expect(normalizeForMatch("  Quantitative-Aptitude (Maths)!  ")).toBe(
      "quantitative aptitude maths",
    );
    expect(
      nameAppearsInText(
        "General  Awareness",
        normalizeForMatch("1. General awareness: current affairs"),
      ),
    ).toBe(true);
    expect(nameAppearsInText("Physics", normalizeForMatch("Chemistry only"))).toBe(false);
    expect(nameAppearsInText("!!!", "anything")).toBe(false);
  });
});

describe("pruneTreeToSource (hallucination guard)", () => {
  const text =
    "Syllabus. General Awareness: History, Geography. Quantitative Aptitude: Percentages, Ratio.";
  it("drops nodes whose names are not in the source text, with their subtrees", () => {
    const out = pruneTreeToSource(
      [
        { name: "General Awareness", children: [{ name: "History" }, { name: "Quantum Physics" }] },
        { name: "Invented Subject", children: [{ name: "History" }] },
        { name: "Quantitative Aptitude", children: [{ name: "Percentages" }, { name: "ratio" }] },
      ],
      text,
    );
    expect(out).toEqual([
      { name: "General Awareness", children: [{ name: "History" }] },
      { name: "Quantitative Aptitude", children: [{ name: "Percentages" }, { name: "ratio" }] },
    ]);
    expect(countNodes(out)).toBe(5);
  });
  it("de-duplicates per parent, trims and ignores a 4th level", () => {
    const out = pruneTreeToSource(
      [
        {
          name: " General Awareness ",
          children: [
            { name: "History", children: [{ name: "Geography", children: [{ name: "Ratio" }] }] },
            { name: "history" },
          ],
        },
        { name: "general awareness" },
      ],
      text,
    );
    expect(out).toEqual([
      {
        name: "General Awareness",
        children: [{ name: "History", children: [{ name: "Geography" }] }],
      },
    ]);
  });
});

describe("pickSyllabusWindow", () => {
  it("starts near the first syllabus heading and is bounded", () => {
    const text = "x".repeat(1000) + " SYLLABUS " + "y".repeat(100_000);
    const w = pickSyllabusWindow(text, 5000);
    expect(w.length).toBe(5000);
    expect(w).toContain("SYLLABUS");
    expect(pickSyllabusWindow("no heading here", 5000)).toBe("no heading here");
  });
});

describe("syllabusExtractionSchema", () => {
  it("converts subjects/chapters/topics into a tree", () => {
    const e = syllabusExtractionSchema.parse({
      hasSyllabus: true,
      subjects: [
        {
          name: "Maths",
          chapters: [{ name: "Algebra", topics: ["Linear equations"] }, { name: "Geometry" }],
        },
      ],
    });
    expect(extractionToTree(e)).toEqual([
      {
        name: "Maths",
        children: [
          { name: "Algebra", children: [{ name: "Linear equations" }] },
          { name: "Geometry", children: [] },
        ],
      },
    ]);
  });
  it("rejects bad shapes", () => {
    expect(syllabusExtractionSchema.safeParse({ hasSyllabus: "yes", subjects: [] }).success).toBe(
      false,
    );
    expect(
      syllabusExtractionSchema.safeParse({
        hasSyllabus: true,
        subjects: [{ name: "", chapters: [] }],
      }).success,
    ).toBe(false);
  });
});
