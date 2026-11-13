import "server-only";

import { z } from "zod";

/**
 * External exam discovery, behind a provider interface so the search engine is
 * swappable and the feature degrades cleanly when unconfigured.
 *
 * Results are UNTRUSTED leads. services/exams/sync.ts only follows links on
 * official hosts (domain/exams isOfficialHost), reads the page itself, and
 * validates what is extracted before anything reaches the catalog.
 */
export type ExternalExamResult = {
  title: string;
  url: string;
  snippet: string;
  host: string;
};

export interface ExamSearchProvider {
  readonly name: string;
  search(query: string): Promise<ExternalExamResult[]>;
}

export class ExamSearchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExamSearchUnavailableError";
  }
}

const googleResponseSchema = z.object({
  items: z
    .array(
      z.object({
        title: z.string().default(""),
        link: z.string(),
        snippet: z.string().default(""),
      }),
    )
    .default([]),
});

/** Google Programmable Search (Custom Search JSON API). Credentials stay server-side. */
export class GoogleProgrammableSearchProvider implements ExamSearchProvider {
  readonly name = "google_programmable_search";
  constructor(
    private readonly apiKey: string,
    private readonly engineId: string,
  ) {}

  async search(query: string): Promise<ExternalExamResult[]> {
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.set("key", this.apiKey);
    url.searchParams.set("cx", this.engineId);
    url.searchParams.set("q", query);
    url.searchParams.set("num", "8");

    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    } catch {
      throw new ExamSearchUnavailableError("The search service did not respond.");
    }
    if (!res.ok) {
      // Never echo the provider body: it can contain the request URL (with the key).
      throw new ExamSearchUnavailableError(`The search service returned HTTP ${res.status}.`);
    }
    const parsed = googleResponseSchema.safeParse(await res.json());
    if (!parsed.success) throw new ExamSearchUnavailableError("Unexpected search response.");
    return normalizeResults(parsed.data.items.map((i) => ({ ...i, url: i.link })));
  }
}

const serperResponseSchema = z.object({
  organic: z
    .array(
      z.object({
        title: z.string().default(""),
        link: z.string(),
        snippet: z.string().default(""),
      }),
    )
    .default([]),
});

/** Serper.dev: returns Google results via a simple API. The key stays server-side. */
export class SerperSearchProvider implements ExamSearchProvider {
  readonly name = "serper";
  constructor(private readonly apiKey: string) {}

  async search(query: string): Promise<ExternalExamResult[]> {
    let res: Response;
    try {
      res = await fetch("https://google.serper.dev/search", {
        method: "POST",
        headers: { "X-API-KEY": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, gl: "in", num: 10 }),
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });
    } catch {
      throw new ExamSearchUnavailableError("The search service did not respond.");
    }
    if (!res.ok) {
      throw new ExamSearchUnavailableError(`The search service returned HTTP ${res.status}.`);
    }
    const parsed = serperResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new ExamSearchUnavailableError("Unexpected search response.");
    return normalizeResults(parsed.data.organic.map((i) => ({ ...i, url: i.link })));
  }
}

/** Keeps only https links, derives the host and trims text. Pure; unit-tested. */
export function normalizeResults(
  raw: Array<{ title: string; url: string; snippet: string }>,
): ExternalExamResult[] {
  const out: ExternalExamResult[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    let parsed: URL;
    try {
      parsed = new URL(r.url);
    } catch {
      continue;
    }
    if (parsed.protocol !== "https:" || seen.has(parsed.href)) continue;
    seen.add(parsed.href);
    out.push({
      title: r.title.trim().slice(0, 300),
      url: parsed.href,
      snippet: r.snippet.trim().slice(0, 500),
      host: parsed.hostname,
    });
  }
  return out;
}

/** The configured provider (Serper preferred, else Google Programmable Search), or null. */
export function getExamSearchProvider(): ExamSearchProvider | null {
  const serper = process.env["SERPER_API_KEY"];
  if (serper) return new SerperSearchProvider(serper);
  const key = process.env["GOOGLE_SEARCH_API_KEY"];
  const cx = process.env["GOOGLE_SEARCH_ENGINE_ID"];
  if (!key || !cx) return null;
  return new GoogleProgrammableSearchProvider(key, cx);
}
