// Question bank against the real local database with fake LLM/page providers (no network).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  generateForTopic,
  importOfficialPaper,
  runQuestionSync,
  type QuestionDeps,
} from "@/services/questions/sync";
import type { QuestionDraft } from "@/domain/questions";

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

const ok = (n: number): QuestionDraft => ({
  prompt: `What is ${n} plus ${n}, written as a number?`,
  options: [String(n * 2), String(n * 2 + 1), String(n * 2 + 2), String(n * 2 + 3)],
  correctIndex: 0,
  explanation: `${n} plus ${n} equals ${n * 2}.`,
});

/** A solver that always knows the right answer, wherever its option sits (order-independent). */
const knowing =
  (drafts: QuestionDraft[]) => async (qs: Array<{ prompt: string; options: string[] }>) =>
    qs.map((q) => {
      const d = drafts.find((x) => x.prompt === q.prompt);
      return d ? q.options.indexOf(d.options[d.correctIndex]!) : null;
    });

describe.skipIf(!up)("question bank (real DB, fake providers)", () => {
  const db = createClient<Database>(API_URL, SERVICE_ROLE_KEY, opts);
  const anon = createClient<Database>(API_URL, ANON_KEY, opts);
  const stamp = Date.now();
  const password = "correct horse battery staple 7";
  let examId = "";
  let hiddenExamId = "";
  let userA: SupabaseClient<Database>;
  let userB: SupabaseClient<Database>;
  const userIds: string[] = [];

  async function mkUser(name: string) {
    const { data, error } = await db.auth.admin.createUser({
      email: `q-${name}-${stamp}@example.test`,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("createUser");
    userIds.push(data.user.id);
    const c = createClient<Database>(API_URL, ANON_KEY, {
      auth: { storageKey: `q-${name}`, persistSession: true, autoRefreshToken: false },
    });
    const { error: e2 } = await c.auth.signInWithPassword({ email: data.user.email!, password });
    if (e2) throw e2;
    return c;
  }
  async function mkExam(slug: string, published: boolean) {
    const { data, error } = await db
      .from("exams")
      .insert({
        slug: `${slug}-${stamp}`,
        name: `Question Test Exam ${stamp}`,
        category: "ssc",
        official_website_url: "https://ssc.gov.in",
        source_url: "https://ssc.gov.in",
        verification_status: published ? "auto_verified" : "pending_verification",
        status: published ? "published" : "draft",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  const base = (over: Partial<QuestionDeps> = {}): QuestionDeps => ({
    db,
    generate: async () => [],
    solve: async (qs) => qs.map(() => 0),
    extractOfficial: async () => [],
    readPage: async (url) => ({ text: "", finalUrl: url }),
    random: () => 0.5,
    ...over,
  });

  beforeAll(async () => {
    examId = await mkExam("q-pub", true);
    hiddenExamId = await mkExam("q-draft", false);
    userA = await mkUser("a");
    userB = await mkUser("b");
    await db.rpc("replace_exam_syllabus", {
      p_exam_id: examId,
      p_source_url: "https://ssc.gov.in/syllabus",
      p_tree: [
        {
          name: "Quantitative Aptitude",
          children: [{ name: "Algebra", children: [{ name: "Linear equations" }] }],
        },
        {
          name: "General English",
          children: [{ name: "Grammar", children: [{ name: "Tenses" }] }],
        },
      ],
    });
  });
  afterAll(async () => {
    await db.from("exams").delete().like("slug", `%-${stamp}`); // cascades questions, answers, attempts
    await db.from("audit_logs").delete().eq("entity_id", examId);
    for (const id of userIds) await db.auth.admin.deleteUser(id);
  });

  const exam = () => ({ id: examId, name: `Question Test Exam ${stamp}` });
  const topic = { subject: "Quantitative Aptitude", topic: "Linear equations" };

  it("publishes only questions that pass the checks AND the independent solve", async () => {
    const drafts: QuestionDraft[] = [
      ok(3), // both solves agree -> published
      ok(4), // first solve disagrees
      { ...ok(5), options: ["10", "10", "11", "12"] }, // duplicate options -> structural failure
      ok(6), // solver undecided
      ok(7), // agrees as written but not when the options are reversed (position bias)
    ];
    let call = 0;
    const r = await generateForTopic(
      base({
        generate: async () => drafts,
        // Called twice with the structurally valid ones (3, 4, 6, 7): as written, then with the
        // options reversed (so the right answer, index 0, appears at index 3).
        solve: async (qs) => {
          expect(qs).toHaveLength(4);
          return call++ === 0 ? [0, 2, null, 0] : [3, 1, null, 0];
        },
      }),
      exam(),
      topic,
    );
    expect(r).toEqual({ proposed: 5, published: 1 });
    const { data } = await db
      .from("questions")
      .select("*, question_answers(correct_index, explanation)")
      .eq("exam_id", examId);
    expect(data).toHaveLength(1);
    const q = data![0]!;
    expect(q).toMatchObject({
      origin: "ai_generated",
      verification: "ai_cross_checked",
      status: "published",
      subject: "Quantitative Aptitude",
      topic: "Linear equations",
      source_url: null,
    });
    const answer = Array.isArray(q.question_answers) ? q.question_answers[0] : q.question_answers;
    expect((q.options as string[])[answer!.correct_index]).toBe("6"); // ok(3): options 6,7,8,9; answer 6 // answer followed its option through the shuffle
    expect(answer!.explanation).toContain("equals");
  });

  it("is idempotent: the same question is not stored twice", async () => {
    const r = await generateForTopic(
      base({ generate: async () => [ok(3)], solve: knowing([ok(3)]) }),
      exam(),
      topic,
    );
    expect(r.published).toBe(0);
    const { count } = await db
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", examId);
    expect(count).toBe(1);
  });

  it("run picks syllabus topics, records the check and failures, and only touches given exams", async () => {
    let seen: string[] = [];
    const summary = await runQuestionSync(
      base({
        generate: async (input) => {
          seen.push(input.topic);
          if (input.topic === "Tenses") throw new Error("model down");
          return [ok(10 + seen.length)];
        },
        solve: async (qs) => knowing([ok(11), ok(12)])(qs),
      }),
      [examId],
    );
    expect(seen.sort()).toEqual(["Linear equations", "Tenses"]);
    expect(summary).toMatchObject({ topics: 2, published: 1, failed: 1 });
    const { data } = await db
      .from("exams")
      .select("questions_synced_at, questions_error")
      .eq("id", examId)
      .single();
    expect(data?.questions_synced_at).toBeTruthy();
    expect(data?.questions_error).toBe("model down");
    // A draft exam is never processed.
    seen = [];
    await runQuestionSync(
      base({
        generate: async (i) => {
          seen.push(i.topic);
          return [];
        },
      }),
      [hiddenExamId],
    );
    expect(seen).toEqual([]);
  });

  describe("official papers", () => {
    const paper =
      "Sample Paper\n1. Which city is the capital of India?\n(a) Mumbai (b) Delhi (c) Kolkata (d) Chennai\n2. Which gas do plants absorb?\n(a) Oxygen (b) Carbon dioxide (c) Helium (d) Neon\nAnswer Key: 1-b, 2-b";
    const valid = {
      prompt: "Which city is the capital of India?",
      options: ["Mumbai", "Delhi", "Kolkata", "Chennai"],
      correctIndex: 1,
    };
    it("stores only questions that appear verbatim and carry a stated answer", async () => {
      const r = await importOfficialPaper(
        base({
          readPage: async (url) => ({ text: paper, finalUrl: url }),
          extractOfficial: async () => [
            valid,
            { ...valid, prompt: "Which city is the capital of Mars?", correctIndex: 1 }, // not in the paper
            {
              ...valid,
              prompt: "Which gas do plants absorb?",
              options: ["Oxygen", "Carbon dioxide", "Helium", "Neon"],
              correctIndex: null,
            }, // no key
          ],
        }),
        { examId, url: "https://ssc.gov.in/sample.pdf" },
      );
      expect(r).toEqual({ proposed: 3, published: 1 });
      const { data } = await db
        .from("questions")
        .select("origin, verification, source_url")
        .eq("origin", "official_paper")
        .eq("exam_id", examId);
      expect(data).toEqual([
        {
          origin: "official_paper",
          verification: "source_verbatim",
          source_url: "https://ssc.gov.in/sample.pdf",
        },
      ]);
    });
    it("imports nothing from a paper that states no answers", async () => {
      let extracted = false;
      const r = await importOfficialPaper(
        base({
          readPage: async (url) => ({
            text: "1. What is 2+2? (a) 3 (b) 4 (c) 5 (d) 6",
            finalUrl: url,
          }),
          extractOfficial: async () => {
            extracted = true;
            return [];
          },
        }),
        { examId, url: "https://ssc.gov.in/nokey.pdf" },
      );
      expect(r).toEqual({ proposed: 0, published: 0 });
      expect(extracted).toBe(false);
    });
    it("marks a processed paper as read, retries a failed one", async () => {
      const { data: mats } = await db
        .from("exam_materials")
        .insert([
          {
            exam_id: examId,
            kind: "sample_paper",
            title: "ok",
            url: "https://ssc.gov.in/p1.pdf",
            host: "ssc.gov.in",
          },
          {
            exam_id: examId,
            kind: "sample_paper",
            title: "bad",
            url: "https://ssc.gov.in/p2.pdf",
            host: "ssc.gov.in",
          },
        ])
        .select("id, url");
      const summary = await runQuestionSync(
        base({
          readPage: async (url) => {
            if (url.endsWith("p2.pdf")) throw new Error("unreadable");
            return { text: "no key here", finalUrl: url };
          },
        }),
        [examId],
      );
      expect(summary).toMatchObject({ papers: 2, failed: 1 });
      const { data } = await db
        .from("exam_materials")
        .select("url, questions_extracted_at")
        .in(
          "id",
          mats!.map((m) => m.id),
        );
      const byUrl = Object.fromEntries(data!.map((d) => [d.url, d.questions_extracted_at]));
      expect(byUrl["https://ssc.gov.in/p1.pdf"]).toBeTruthy();
      expect(byUrl["https://ssc.gov.in/p2.pdf"]).toBeNull();
    });
  });

  describe("privacy and RLS", () => {
    let questionId = "";
    let correct = 0;
    beforeAll(async () => {
      const { data } = await db
        .from("questions")
        .select("id, question_answers(correct_index)")
        .eq("exam_id", examId)
        .eq("origin", "ai_generated")
        .limit(1)
        .single();
      questionId = data!.id;
      const a = Array.isArray(data!.question_answers)
        ? data!.question_answers[0]
        : data!.question_answers;
      correct = a!.correct_index;
    });

    it("candidates can read questions but never the answers table", async () => {
      const qs = await userA.from("questions").select("*").eq("exam_id", examId);
      expect(qs.data!.length).toBeGreaterThan(0);
      expect(Object.keys(qs.data![0]!)).not.toContain("correct_index");
      const ans = await userA.from("question_answers").select("*");
      expect(ans.data).toEqual([]);
      const anonQs = await anon.from("questions").select("id");
      expect(anonQs.data).toEqual([]); // anonymous visitors get nothing
    });

    it("answering reveals the answer and records the attempt; attempts are private", async () => {
      const wrong = (correct + 1) % 4;
      const r = await userA.rpc("answer_practice_question", {
        p_question_id: questionId,
        p_selected: wrong,
      });
      expect(r.data).toEqual([
        { correct_index: correct, is_correct: false, explanation: expect.any(String) },
      ]);
      const right = await userB.rpc("answer_practice_question", {
        p_question_id: questionId,
        p_selected: correct,
      });
      expect(right.data?.[0]?.is_correct).toBe(true);
      const mine = await userA.from("practice_attempts").select("user_id, is_correct");
      expect(mine.data).toHaveLength(1);
      expect(mine.data![0]).toMatchObject({ is_correct: false });
      const direct = await userA.from("practice_attempts").insert({
        user_id: userIds[0]!,
        question_id: questionId,
        selected_index: 0,
        is_correct: true,
      });
      expect(direct.error).toBeTruthy(); // cannot forge attempts
    });

    it("refuses anonymous callers, bad options, hidden questions and unpublished exams", async () => {
      const a = await anon.rpc("answer_practice_question", {
        p_question_id: questionId,
        p_selected: 0,
      });
      expect(a.error).toBeTruthy();
      const bad = await userA.rpc("answer_practice_question", {
        p_question_id: questionId,
        p_selected: 7,
      });
      expect(bad.error?.message).toMatch(/Invalid option/);
      await db.from("questions").update({ status: "hidden" }).eq("id", questionId);
      const hidden = await userA.rpc("answer_practice_question", {
        p_question_id: questionId,
        p_selected: 0,
      });
      expect(hidden.error?.message).toMatch(/not available/);
      const hiddenList = await userA.from("questions").select("id").eq("id", questionId);
      expect(hiddenList.data).toEqual([]);
      await db.from("questions").update({ status: "published" }).eq("id", questionId);
    });

    it("candidates cannot write questions or call the insert function", async () => {
      const ins = await userA.from("questions").insert({
        exam_id: examId,
        origin: "ai_generated",
        prompt: "Forged question text",
        options: ["a", "b", "c", "d"],
        verification: "ai_cross_checked",
        content_hash: "x",
      });
      expect(ins.error).toBeTruthy();
      const rpc = await userA.rpc("add_question", {
        p_exam_id: examId,
        p_origin: "ai_generated",
        p_prompt: "Forged question text",
        p_options: ["a", "b", "c", "d"],
        p_verification: "ai_cross_checked",
        p_content_hash: "y",
        p_correct: 0,
      });
      expect(rpc.error).toBeTruthy();
    });

    it("the database enforces the trust rules itself", async () => {
      const noSource = await db.from("questions").insert({
        exam_id: examId,
        origin: "official_paper",
        prompt: "Official without a source",
        options: ["a", "b", "c", "d"],
        verification: "source_verbatim",
        content_hash: "z1",
      });
      expect(noSource.error?.message).toMatch(/questions_official_needs_source/);
      const mismatch = await db.from("questions").insert({
        exam_id: examId,
        origin: "ai_generated",
        prompt: "AI claiming a source check",
        options: ["a", "b", "c", "d"],
        verification: "source_verbatim",
        content_hash: "z2",
      });
      expect(mismatch.error?.message).toMatch(/questions_origin_verification/);
      const offHost = await db.from("questions").insert({
        exam_id: examId,
        origin: "official_paper",
        prompt: "Official from a blog host",
        options: ["a", "b", "c", "d"],
        verification: "source_verbatim",
        source_url: "https://blog.example.com/p.pdf",
        content_hash: "z3",
      });
      expect(offHost.error).toBeTruthy();
      const threeOptions = await db.from("questions").insert({
        exam_id: examId,
        origin: "ai_generated",
        prompt: "Only three options here",
        options: ["a", "b", "c"],
        verification: "ai_cross_checked",
        content_hash: "z4",
      });
      expect(threeOptions.error).toBeTruthy();
    });
  });
});
