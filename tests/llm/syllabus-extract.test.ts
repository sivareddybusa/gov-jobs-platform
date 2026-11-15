import { beforeEach, describe, expect, it, vi } from "vitest";

const generateJson = vi.fn();
vi.mock("@/lib/llm/resolve", () => ({
  requireActiveLlm: async () => ({ client: { generateJson }, provider: "x", model: "m" }),
}));

import { extractSyllabusFromText } from "@/lib/ingestion/syllabus-extract";

beforeEach(() => generateJson.mockReset());

describe("extractSyllabusFromText", () => {
  it("returns a validated extraction", async () => {
    generateJson.mockResolvedValue(
      JSON.stringify({
        hasSyllabus: true,
        subjects: [{ name: "Maths", chapters: [{ name: "Algebra", topics: [] }] }],
      }),
    );
    expect((await extractSyllabusFromText("page")).subjects[0]?.name).toBe("Maths");
  });
  it("treats omitted/false hasSyllabus as 'no syllabus here', not an error", async () => {
    generateJson.mockResolvedValue(JSON.stringify({ subjects: [] }));
    expect(await extractSyllabusFromText("p")).toEqual({ hasSyllabus: false, subjects: [] });
  });
  it("rejects invalid structure and non-JSON", async () => {
    generateJson.mockResolvedValue(
      JSON.stringify({ hasSyllabus: true, subjects: [{ chapters: [] }] }),
    );
    await expect(extractSyllabusFromText("p")).rejects.toThrow(/validation/);
    generateJson.mockResolvedValue("nope");
    await expect(extractSyllabusFromText("p")).rejects.toThrow(/invalid JSON/);
  });
});
