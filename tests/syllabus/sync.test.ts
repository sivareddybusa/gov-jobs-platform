// Syllabus sync against the real local DB with fake search/extractor/reader.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { runSyllabusSync, syncSyllabusForExam, type SyllabusDeps } from "@/services/syllabus/sync";
import type { ExamSearchProvider } from "@/lib/search/exam-search";

const API_URL = process.env["TEST_SUPABASE_URL"] ?? "http://127.0.0.1:54321";
const ANON_KEY =
  process.env["TEST_SUPABASE_ANON_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env["TEST_SUPABASE_SERVICE_ROLE_KEY"] ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

async function reachable() {
  try {
    return (await fetch(`${API_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } })).status < 500;
  } catch {
    return false;
  }
}
const up = await reachable();
const opts = { auth: { autoRefreshToken: false, persistSession: false } };

const PAGE =
  "Combined Graduate Level Examination. Syllabus. General Awareness: History, Geography, Polity. Quantitative Aptitude: Percentages, Ratio, Algebra. English: Grammar, Vocabulary.";

describe.skipIf(!up)("syllabus (real DB, fake providers)", () => {
  const db = createClient<Database>(API_URL, SERVICE_ROLE_KEY, opts);
  const anon = createClient<Database>(API_URL, ANON_KEY, opts);
  const stamp = Date.now();
  const host = `https://syl-${stamp}.gov.in`;
  let published = "";
  let draft = "";

  const search = (urls: string[]): ExamSearchProvider => ({
    name: "fake",
    search: async () =>
      urls.map((url) => ({ title: "t", url, snippet: "", host: new URL(url).hostname })),
  });
  const deps = (over: Partial<SyllabusDeps> = {}): SyllabusDeps => ({
    db,
    search: search([`${host}/syllabus`, "https://blog.example.com/syllabus"]),
    readPage: async (url) => ({ text: PAGE, finalUrl: url }),
    extract: async () => ({
      hasSyllabus: true,
      subjects: [
        {
          name: "General Awareness",
          chapters: [
            { name: "History", topics: [] },
            { name: "Geography", topics: [] },
            { name: "Polity", topics: [] },
          ],
        },
        {
          name: "Quantitative Aptitude",
          chapters: [
            { name: "Percentages", topics: [] },
            { name: "Ratio", topics: [] },
          ],
        },
        { name: "Made Up Subject", chapters: [{ name: "Nothing", topics: [] }] },
      ],
    }),
    ...over,
  });

  async function mkExam(slug: string, status: "published" | "draft") {
    const { data, error } = await db
      .from("exams")
      .insert({
        slug: `${slug}-${stamp}`,
        name: `Syl ${slug} ${stamp}`,
        category: "ssc",
        official_website_url: host,
        source_url: `${host}/${slug}`,
        verification_status: status === "published" ? "auto_verified" : "pending_verification",
        status,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  beforeAll(async () => {
    published = await mkExam("pub", "published");
    draft = await mkExam("draft", "draft");
  });
  afterAll(async () => {
    await db.from("exams").delete().like("slug", `%-${stamp}`); // cascades syllabus_nodes
    await db.from("audit_logs").delete().like("metadata->>source_url", `${host}%`);
  });

  const exam = (id: string) => ({
    id,
    name: "Combined Graduate Level",
    source_url: `${host}/pub`,
    syllabus_synced_at: null,
  });

  it("stores only nodes present on the page, in a 3-level tree, with the official source", async () => {
    expect(await syncSyllabusForExam(deps(), exam(published))).toBe("stored");
    const { data } = await db
      .from("syllabus_nodes")
      .select("name, depth, source_url")
      .eq("exam_id", published);
    const names = data!.map((n) => n.name).sort();
    expect(names).toEqual([
      "General Awareness",
      "Geography",
      "History",
      "Percentages",
      "Polity",
      "Quantitative Aptitude",
      "Ratio",
    ]);
    expect(data!.every((n) => n.source_url.startsWith(host))).toBe(true);
    const ex = await db
      .from("exams")
      .select("syllabus_status, syllabus_source_url")
      .eq("id", published)
      .single();
    expect(ex.data?.syllabus_status).toBe("ok");
  });

  it("replaces the previous syllabus atomically on re-sync", async () => {
    await syncSyllabusForExam(deps(), exam(published));
    const { data } = await db.from("syllabus_nodes").select("id").eq("exam_id", published);
    expect(data).toHaveLength(7); // not 14
  });

  it("reports not_found when no official page has a usable syllabus", async () => {
    const out = await syncSyllabusForExam(
      deps({ extract: async () => ({ hasSyllabus: false, subjects: [] }) }),
      exam(published),
    );
    expect(out).toBe("not_found");
    // ...and keeps the old syllabus rather than wiping it.
    const { data } = await db.from("syllabus_nodes").select("id").eq("exam_id", published);
    expect(data).toHaveLength(7);
  });

  it("refuses a page about a different exam (no cross-exam syllabus)", async () => {
    await db.from("syllabus_nodes").delete().eq("exam_id", draft);
    const out = await syncSyllabusForExam(deps(), {
      ...exam(draft),
      name: "Railway Group D Recruitment",
    });
    expect(out).toBe("not_found");
    const { data } = await db.from("syllabus_nodes").select("id").eq("exam_id", draft);
    expect(data).toEqual([]);
  });

  it("does not read non-official results and skips pages that redirect off-domain", async () => {
    const read: string[] = [];
    const out = await syncSyllabusForExam(
      deps({
        search: search(["https://blog.example.com/s", "https://evilgov.in/s"]),
        readPage: async (url) => {
          read.push(url);
          return { text: PAGE, finalUrl: "https://evil.example.com/x" };
        },
      }),
      { ...exam(published), source_url: null },
    );
    expect(read).toEqual([]);
    expect(out).toBe("not_found");
  });

  it("throws when no page can be read at all (recorded as failed by the run)", async () => {
    await expect(
      syncSyllabusForExam(
        deps({
          readPage: async () => {
            throw new Error("fetch failed");
          },
        }),
        exam(published),
      ),
    ).rejects.toThrow("fetch failed");
  });

  it("the run only touches published verified exams and records failures", async () => {
    await db.from("exams").update({ syllabus_synced_at: null }).eq("id", published);
    const s = await runSyllabusSync(
      deps({
        readPage: async () => {
          throw new Error("boom");
        },
      }),
      50,
      [published, draft], // only this test's exams: never touch real catalog rows
    );
    expect(s.failed).toBe(1);
    const ex = await db
      .from("exams")
      .select("syllabus_status, syllabus_error")
      .eq("id", published)
      .single();
    expect(ex.data).toEqual({ syllabus_status: "failed", syllabus_error: "boom" });
    const d = await db.from("exams").select("syllabus_status").eq("id", draft).single();
    expect(d.data?.syllabus_status).toBeNull(); // draft exam never processed
  });

  it("is visible to anonymous visitors only for published exams", async () => {
    const pubRows = await anon.from("syllabus_nodes").select("id").eq("exam_id", published);
    expect(pubRows.data!.length).toBe(7);
    await db.rpc("replace_exam_syllabus", {
      p_exam_id: draft,
      p_source_url: `${host}/draft`,
      p_tree: [{ name: "Hidden", children: [] }],
    });
    const draftRows = await anon.from("syllabus_nodes").select("id").eq("exam_id", draft);
    expect(draftRows.data).toEqual([]);
  });

  it("nobody but the service role can write, and the DB enforces structure + official host", async () => {
    const w = await anon.from("syllabus_nodes").insert({
      exam_id: published,
      depth: 1,
      name: "x",
      position: 0,
      source_url: `${host}/x`,
    });
    expect(w.error).not.toBeNull();
    expect(
      (
        await anon.rpc("replace_exam_syllabus", {
          p_exam_id: published,
          p_source_url: `${host}/x`,
          p_tree: [],
        })
      ).error,
    ).not.toBeNull();

    const nonOfficial = await db.from("syllabus_nodes").insert({
      exam_id: published,
      depth: 1,
      name: "Bad",
      position: 9,
      source_url: "https://example.com/x",
    });
    expect(nonOfficial.error).not.toBeNull();
    const rootWithParentDepth = await db.from("syllabus_nodes").insert({
      exam_id: published,
      depth: 2,
      name: "Orphan",
      position: 9,
      source_url: `${host}/x`,
    });
    expect(rootWithParentDepth.error).not.toBeNull(); // depth 2 needs a parent
  });
});
