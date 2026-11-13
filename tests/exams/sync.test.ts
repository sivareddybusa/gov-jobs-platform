// The Google-fed exam sync, run against the real local database with fake
// search/extractor/page-reader (no network, no Gemini). Skips if the local
// stack is down.
import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  nameAppearsOnPage,
  refreshStaleExams,
  runExamSync,
  type SyncDeps,
} from "@/services/exams/sync";
import type { ExamSearchProvider } from "@/lib/search/exam-search";

const API_URL = process.env["TEST_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env["TEST_SUPABASE_SERVICE_ROLE_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/rest/v1/`, { headers: { apikey: SERVICE_ROLE_KEY } });
    return res.status < 500;
  } catch {
    return false;
  }
}
const up = await reachable();

describe("nameAppearsOnPage", () => {
  it("requires the extracted name (or short name) to be on the page", () => {
    expect(
      nameAppearsOnPage({ name: "Combined Graduate  Level" }, "The combined graduate level exam"),
    ).toBe(true);
    expect(nameAppearsOnPage({ name: "Invented Exam", shortName: "IE" }, "Nothing here")).toBe(
      false,
    );
    expect(nameAppearsOnPage({ name: "Invented Exam", shortName: "CGL" }, "SSC CGL notice")).toBe(
      true,
    );
  });
});

describe.skipIf(!up)("exam sync (real DB, fake providers)", () => {
  const db = createClient<Database>(API_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const stamp = Date.now();
  const host = `https://sync-${stamp}.gov.in`;
  const createdSlugs: string[] = [];

  const search = (urls: string[]): ExamSearchProvider => ({
    name: "fake",
    search: async () =>
      urls.map((url) => ({ title: "t", url, snippet: "s", host: new URL(url).hostname })),
  });

  function deps(over: Partial<SyncDeps> & { urls: string[]; pageName?: string }): SyncDeps {
    const name = over.pageName ?? `Sync Test Exam ${stamp}`;
    createdSlugs.push(
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    );
    return {
      db,
      search: over.search ?? search(over.urls),
      extract:
        over.extract ??
        (async () => ({ isExamPage: true, name, category: "ssc", description: "From the page." })),
      readPage:
        over.readPage ??
        (async (url) => ({ text: `Welcome. ${name} is conducted yearly.`, finalUrl: url })),
    };
  }

  afterAll(async () => {
    await db.from("exams").delete().like("source_url", `https://sync-${stamp}.gov.in%`);
    await db
      .from("audit_logs")
      .delete()
      .like("metadata->>source_url", `https://sync-${stamp}.gov.in%`);
  });

  it("auto-publishes an exam read from an official page, deriving the website itself", async () => {
    const summary = await runExamSync(deps({ urls: [`${host}/exam`] }), ["q"]);
    expect(summary).toMatchObject({ created: 1, failed: 0 });
    const { data } = await db.from("exams").select("*").eq("source_url", `${host}/exam`).single();
    expect(data).toMatchObject({
      status: "published",
      verification_status: "auto_verified",
      discovered_via: "google_sync",
      official_website_url: host,
      sync_status: "ok",
    });
    expect(data?.last_synced_at).toBeTruthy();
  });

  it("ignores non-official search results without reading them", async () => {
    let read = 0;
    const summary = await runExamSync(
      deps({
        urls: ["https://examtips.com/ssc", "https://evilgov.in/x", "http://ssc.gov.in/plain"],
        readPage: async (url) => {
          read++;
          return { text: "x", finalUrl: url };
        },
      }),
      ["q"],
    );
    expect(read).toBe(0);
    expect(summary).toMatchObject({ pagesRead: 0, created: 0 });
  });

  it("skips a page whose extracted name is not actually on the page (hallucination guard)", async () => {
    const url = `${host}/halluc`;
    const summary = await runExamSync(
      deps({
        urls: [url],
        pageName: `Halluc ${stamp}`,
        readPage: async (u) => ({ text: "A page about something else entirely.", finalUrl: u }),
      }),
      ["q"],
    );
    expect(summary).toMatchObject({ skipped: 1, created: 0 });
    const { data } = await db.from("exams").select("id").eq("source_url", url);
    expect(data).toEqual([]);
  });

  it("skips non-exam pages and pages that redirect off an official host", async () => {
    const a = await runExamSync(
      deps({
        urls: [`${host}/news`],
        pageName: `News ${stamp}`,
        extract: async () => ({ isExamPage: false, name: `News ${stamp}`, category: "other" }),
      }),
      ["q"],
    );
    expect(a.skipped).toBe(1);
    const b = await runExamSync(
      deps({
        urls: [`${host}/redir`],
        pageName: `Redir ${stamp}`,
        readPage: async () => ({ text: `Redir ${stamp}`, finalUrl: "https://evil.example.com/x" }),
      }),
      ["q"],
    );
    expect(b.skipped).toBe(1);
  });

  it("refreshes facts on re-sync but never re-publishes an admin takedown", async () => {
    const url = `${host}/exam`;
    await db.from("exams").update({ status: "draft", published_at: null }).eq("source_url", url);
    const summary = await runExamSync(
      deps({
        urls: [url],
        extract: async () => ({
          isExamPage: true,
          name: `Sync Test Exam ${stamp}`,
          category: "ssc",
          description: "Updated from the page.",
        }),
      }),
      ["q"],
    );
    expect(summary).toMatchObject({ refreshed: 1, created: 0 });
    const { data } = await db
      .from("exams")
      .select("status, description")
      .eq("source_url", url)
      .single();
    expect(data).toEqual({ status: "draft", description: "Updated from the page." });
  });

  it("records a failure on the exam instead of crashing the run", async () => {
    const url = `${host}/exam`;
    const summary = await refreshStaleExams(
      deps({
        urls: [],
        readPage: async (u) => {
          if (u === url) throw new Error("boom");
          return { text: "x", finalUrl: u };
        },
      }),
      50,
    );
    expect(summary.failed).toBeGreaterThanOrEqual(1);
    const { data } = await db
      .from("exams")
      .select("sync_status, sync_error")
      .eq("source_url", url)
      .single();
    expect(data).toEqual({ sync_status: "failed", sync_error: "boom" });
  });

  it("survives a failing search query", async () => {
    const failing: ExamSearchProvider = {
      name: "down",
      search: async () => {
        throw new Error("down");
      },
    };
    const summary = await runExamSync(deps({ urls: [], search: failing }), ["a", "b"]);
    expect(summary).toMatchObject({ queries: 2, failed: 2, created: 0 });
  });

  it("the database itself refuses auto_verified on a non-official host", async () => {
    const { error } = await db.from("exams").insert({
      slug: `bad-auto-${stamp}`,
      name: "Bad",
      category: "other",
      official_website_url: "https://example.com",
      source_url: "https://example.com/x",
      verification_status: "auto_verified",
      status: "published",
    });
    expect(error?.message).toMatch(/exams_auto_verified_requires_official_host/);
  });
});
