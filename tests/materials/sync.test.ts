// Materials sync against the real local DB with a fake search provider.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  findMaterialsForExam,
  runMaterialsSync,
  syncMaterialsForExam,
} from "@/services/materials/sync";
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

type Hit = { title: string; url: string; snippet: string };
const fake = (hits: Hit[]): ExamSearchProvider => ({
  name: "fake",
  search: async () => hits.map((h) => ({ ...h, host: new URL(h.url).hostname })),
});

const HITS: Hit[] = [
  {
    title: "Combined Graduate Level Examination, 2026 Notification",
    url: "https://ssc.gov.in/uploads/cgl-notification.pdf",
    snippet: "",
  },
  {
    title: "Syllabus | Staff Selection Commission",
    url: "https://ssc.gov.in/for-candidates/cgl-syllabus",
    snippet: "Combined Graduate Level",
  },
  {
    title: "Combined Graduate Level sample paper",
    url: "https://ssc.gov.in/cgl-sample-paper.pdf",
    snippet: "",
  },
  {
    title: "Instructions to candidates - Combined Graduate Level",
    url: "https://ssc.gov.in/guidelines.pdf",
    snippet: "",
  },
  {
    title: "Combined Graduate Level syllabus",
    url: "https://blog.example.com/cgl-syllabus",
    snippet: "",
  }, // not official
  { title: "Railway Group D syllabus", url: "https://rrb.gov.in/syllabus.pdf", snippet: "" }, // other exam
  {
    title: "Combined Graduate Level previous year question papers",
    url: "https://ssc.gov.in/previous-year-question-papers.pdf",
    snippet: "",
  }, // later phase
  {
    title: "Combined Graduate Level practice paper",
    url: "https://www.ndl.gov.in/ssc-practice-paper.pdf",
    snippet: "",
  }, // government, but not the conducting body
  {
    title: "Combined Graduate Level notification 2024",
    url: "https://ssc.gov.in/Notice_of_adv_cgl_2024.pdf",
    snippet: "",
  }, // another year
  { title: "Combined Graduate Level results", url: "https://ssc.gov.in/results.pdf", snippet: "" }, // unclassified
];

describe("findMaterialsForExam (pure, fake search)", () => {
  it("keeps only official, relevant, classifiable links", async () => {
    const found = await findMaterialsForExam(
      { search: fake(HITS) },
      {
        name: "Combined Graduate Level Examination, 2026",
        official_website_url: "https://ssc.gov.in",
      },
    );
    expect(found.map((f) => [f.kind, f.url])).toEqual([
      ["notification", "https://ssc.gov.in/uploads/cgl-notification.pdf"],
      ["syllabus", "https://ssc.gov.in/for-candidates/cgl-syllabus"],
      ["sample_paper", "https://ssc.gov.in/cgl-sample-paper.pdf"],
      ["guidance", "https://ssc.gov.in/guidelines.pdf"],
    ]);
    expect(found[1]!.title).toBe("Syllabus");
  });
  it("survives failing queries", async () => {
    const failing: ExamSearchProvider = {
      name: "x",
      search: async () => {
        throw new Error("down");
      },
    };
    expect(
      await findMaterialsForExam(
        { search: failing },
        { name: "Anything Exam", official_website_url: "https://x.gov.in" },
      ),
    ).toEqual([]);
  });
});

describe.skipIf(!up)("materials sync (real DB)", () => {
  const db = createClient<Database>(API_URL, SERVICE_ROLE_KEY, opts);
  const anon = createClient<Database>(API_URL, ANON_KEY, opts);
  const stamp = Date.now();
  let published = "";
  let draft = "";

  async function mkExam(slug: string, status: "published" | "draft") {
    const { data, error } = await db
      .from("exams")
      .insert({
        slug: `${slug}-${stamp}`,
        name: "Combined Graduate Level Examination, 2026",
        category: "ssc",
        official_website_url: "https://ssc.gov.in",
        source_url: "https://ssc.gov.in",
        verification_status: status === "published" ? "auto_verified" : "pending_verification",
        status,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }
  beforeAll(async () => {
    published = await mkExam("mat-pub", "published");
    draft = await mkExam("mat-draft", "draft");
  });
  afterAll(async () => {
    await db.from("exams").delete().like("slug", `%-${stamp}`); // cascades materials
    await db.from("audit_logs").delete().eq("entity_id", published);
  });

  const exam = (id: string) => ({
    id,
    name: "Combined Graduate Level Examination, 2026",
    official_website_url: "https://ssc.gov.in",
    materials_synced_at: null,
  });

  it("stores links, is idempotent, and records the check time", async () => {
    expect(await syncMaterialsForExam({ db, search: fake(HITS) }, exam(published))).toBe(4);
    expect(await syncMaterialsForExam({ db, search: fake(HITS) }, exam(published))).toBe(4);
    const { data } = await db.from("exam_materials").select("kind, host").eq("exam_id", published);
    expect(data).toHaveLength(4); // upsert, not duplicates
    expect(new Set(data!.map((d) => d.host))).toEqual(new Set(["ssc.gov.in"]));
    const ex = await db
      .from("exams")
      .select("materials_synced_at, materials_error")
      .eq("id", published)
      .single();
    expect(ex.data?.materials_synced_at).toBeTruthy();
    expect(ex.data?.materials_error).toBeNull();
  });

  it("run only touches the given exams and records failures", async () => {
    await db.from("exams").update({ materials_synced_at: null }).eq("id", published);
    const bad = await runMaterialsSync(
      {
        db,
        search: {
          name: "x",
          search: async () => {
            throw new Error("boom");
          },
        },
      },
      50,
      [published, draft],
    );
    expect(bad).toEqual({ exams: 1, links: 0, failed: 0 }); // failing queries are skipped, run still completes
    const good = await runMaterialsSync({ db, search: fake(HITS) }, 50, [draft]);
    expect(good.exams).toBe(0); // draft exams are never processed
  });

  it("is visible to anonymous visitors only for published exams", async () => {
    const pub = await anon.from("exam_materials").select("id").eq("exam_id", published);
    expect(pub.data!.length).toBe(4);
    await db.from("exam_materials").insert({
      exam_id: draft,
      kind: "syllabus",
      title: "Hidden",
      url: "https://ssc.gov.in/hidden",
      host: "ssc.gov.in",
    });
    const hidden = await anon.from("exam_materials").select("id").eq("exam_id", draft);
    expect(hidden.data).toEqual([]);
  });

  it("nobody but the service role can write, and the DB enforces official https links", async () => {
    const w = await anon.from("exam_materials").insert({
      exam_id: published,
      kind: "syllabus",
      title: "x",
      url: "https://ssc.gov.in/x",
      host: "ssc.gov.in",
    });
    expect(w.error).not.toBeNull();
    const nonOfficial = await db.from("exam_materials").insert({
      exam_id: published,
      kind: "syllabus",
      title: "x",
      url: "https://example.com/x",
      host: "example.com",
    });
    expect(nonOfficial.error).not.toBeNull();
    const http = await db.from("exam_materials").insert({
      exam_id: published,
      kind: "syllabus",
      title: "x",
      url: "http://ssc.gov.in/x",
      host: "ssc.gov.in",
    });
    expect(http.error).not.toBeNull();
    const badKind = await db.from("exam_materials").insert({
      exam_id: published,
      kind: "ebook",
      title: "x",
      url: "https://ssc.gov.in/y",
      host: "ssc.gov.in",
    });
    expect(badKind.error).not.toBeNull();
  });
});
