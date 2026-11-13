import { beforeEach, describe, expect, it, vi } from "vitest";

const generateJson = vi.fn();
vi.mock("@/lib/llm/resolve", () => ({
  requireActiveLlm: async () => ({ client: { generateJson }, provider: "x", model: "m" }),
}));

import { extractExamFromText } from "@/lib/ingestion/exam-extract";

beforeEach(() => generateJson.mockReset());

describe("extractExamFromText", () => {
  it("returns a validated extraction", async () => {
    generateJson.mockResolvedValue(
      JSON.stringify({
        isExamPage: true,
        name: "SSC CGL",
        shortName: null,
        category: "ssc",
        description: null,
      }),
    );
    const out = await extractExamFromText("page");
    expect(out).toMatchObject({ isExamPage: true, name: "SSC CGL", category: "ssc" });
  });
  it("treats an omitted/false isExamPage as a skip, not an error", async () => {
    generateJson.mockResolvedValue(JSON.stringify({ description: "No exam information here." }));
    expect((await extractExamFromText("page")).isExamPage).toBe(false);
    generateJson.mockResolvedValue(JSON.stringify({ isExamPage: false }));
    expect((await extractExamFromText("page")).isExamPage).toBe(false);
  });
  it("still rejects an exam page whose fields are invalid, and non-JSON output", async () => {
    generateJson.mockResolvedValue(
      JSON.stringify({ isExamPage: true, name: "X", category: "magic" }),
    );
    await expect(extractExamFromText("page")).rejects.toThrow(/validation/);
    generateJson.mockResolvedValue("not json");
    await expect(extractExamFromText("page")).rejects.toThrow(/invalid JSON/);
  });
});
