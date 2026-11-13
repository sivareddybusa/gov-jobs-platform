import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ExamSearchUnavailableError,
  GoogleProgrammableSearchProvider,
  SerperSearchProvider,
  getExamSearchProvider,
  normalizeResults,
} from "@/lib/search/exam-search";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("normalizeResults", () => {
  it("keeps only https links, dedupes and derives the host", () => {
    const out = normalizeResults([
      { title: " A ", url: "https://www.ibps.in/x", snippet: " s " },
      { title: "dup", url: "https://www.ibps.in/x", snippet: "" },
      { title: "http", url: "http://example.com", snippet: "" },
      { title: "js", url: "javascript:alert(1)", snippet: "" },
      { title: "bad", url: "not a url", snippet: "" },
    ]);
    expect(out).toEqual([
      { title: "A", url: "https://www.ibps.in/x", snippet: "s", host: "www.ibps.in" },
    ]);
  });
});

describe("getExamSearchProvider", () => {
  it("is null when credentials are missing (fallback to the internal catalog)", () => {
    vi.stubEnv("GOOGLE_SEARCH_API_KEY", "");
    vi.stubEnv("GOOGLE_SEARCH_ENGINE_ID", "");
    expect(getExamSearchProvider()).toBeNull();
  });
  it("is a Google provider when both are set", () => {
    vi.stubEnv("GOOGLE_SEARCH_API_KEY", "k");
    vi.stubEnv("GOOGLE_SEARCH_ENGINE_ID", "cx");
    expect(getExamSearchProvider()?.name).toBe("google_programmable_search");
  });
});

describe("GoogleProgrammableSearchProvider", () => {
  const provider = new GoogleProgrammableSearchProvider("secret-key", "cx");

  it("parses results and sends the query server-side", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ items: [{ title: "T", link: "https://ssc.gov.in", snippet: "S" }] }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const results = await provider.search("ssc cgl");
    expect(results[0]?.host).toBe("ssc.gov.in");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("q=ssc+cgl");
  });

  it("returns an empty list when the API has no items", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    expect(await provider.search("x")).toEqual([]);
  });

  it("throws a safe error that never leaks the API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("key=secret-key", { status: 403 })),
    );
    const err = await provider.search("x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExamSearchUnavailableError);
    expect((err as Error).message).not.toContain("secret-key");
    expect((err as Error).message).toContain("403");
  });

  it("maps network failures to the unavailable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom secret-key")));
    const err = await provider.search("x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ExamSearchUnavailableError);
    expect((err as Error).message).not.toContain("secret-key");
  });
});

describe("SerperSearchProvider", () => {
  it("posts the query with the key header and normalizes organic results", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        organic: [
          { title: "SSC CGL", link: "https://ssc.gov.in/x", snippet: "s" },
          { title: "http", link: "http://ssc.gov.in/y", snippet: "" },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await new SerperSearchProvider("serper-secret").search("q");
    expect(out.map((r) => r.url)).toEqual(["https://ssc.gov.in/x"]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://google.serper.dev/search");
    expect((init.headers as Record<string, string>)["X-API-KEY"]).toBe("serper-secret");
  });
  it("reports only the status on failure, never the key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 403, json: async () => ({}) })),
    );
    const err = await new SerperSearchProvider("serper-secret").search("q").catch((e: Error) => e);
    expect((err as Error).message).toBe("The search service returned HTTP 403.");
  });
  it("is preferred by getExamSearchProvider when its key is set", () => {
    vi.stubEnv("SERPER_API_KEY", "k");
    vi.stubEnv("GOOGLE_SEARCH_API_KEY", "g");
    vi.stubEnv("GOOGLE_SEARCH_ENGINE_ID", "cx");
    expect(getExamSearchProvider()?.name).toBe("serper");
    vi.stubEnv("SERPER_API_KEY", "");
    expect(getExamSearchProvider()?.name).toBe("google_programmable_search");
  });
});
