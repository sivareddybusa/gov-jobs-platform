// Mock tests against the real local database: ownership, the server-side deadline, hidden answers
// while running, and server-computed scoring.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { scoreAttempt } from "@/domain/mock-tests";

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

describe.skipIf(!up)("mock tests (real DB)", () => {
  const db = createClient<Database>(API_URL, SERVICE_ROLE_KEY, opts);
  const anon = createClient<Database>(API_URL, ANON_KEY, opts);
  const stamp = Date.now();
  const password = "correct horse battery staple 7";
  let examId = "";
  let draftExamId = "";
  let userA: SupabaseClient<Database>;
  let userB: SupabaseClient<Database>;
  const userIds: string[] = [];
  const questionIds: string[] = [];
  const correct: number[] = [];

  async function mkUser(name: string) {
    const { data, error } = await db.auth.admin.createUser({
      email: `m-${name}-${stamp}@example.test`,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error("createUser");
    userIds.push(data.user.id);
    const c = createClient<Database>(API_URL, ANON_KEY, {
      auth: { storageKey: `m-${name}`, persistSession: true, autoRefreshToken: false },
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
        name: `Mock Test Exam ${stamp}`,
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
  async function addQuestion(n: number, correctIndex: number) {
    const { data, error } = await db.rpc("add_question", {
      p_exam_id: examId,
      p_origin: "ai_generated",
      p_prompt: `Mock test question number ${n} for ${stamp}?`,
      p_options: ["A" + n, "B" + n, "C" + n, "D" + n],
      p_verification: "ai_cross_checked",
      p_content_hash: `mock-${stamp}-${n}`,
      p_correct: correctIndex,
      p_subject: n % 2 ? "Maths" : "English",
      p_explanation: `Because of ${n}.`,
    });
    if (error || !data) throw error ?? new Error("add_question");
    questionIds.push(data);
    correct.push(correctIndex);
  }
  const attemptOf = async (id: string) =>
    (await db.from("mock_attempts").select("*").eq("id", id).single()).data!;

  beforeAll(async () => {
    examId = await mkExam("mock-pub", true);
    draftExamId = await mkExam("mock-draft", false);
    userA = await mkUser("a");
    userB = await mkUser("b");
    for (let n = 1; n <= 4; n++) await addQuestion(n, n % 4);
  });
  afterAll(async () => {
    await db.from("exams").delete().like("slug", `%-${stamp}`); // cascades questions and attempts
    for (const id of userIds) await db.auth.admin.deleteUser(id);
  });

  let attemptId = "";

  it("refuses to start with too few questions, for anonymous callers and for unpublished exams", async () => {
    const few = await userA.rpc("start_mock_attempt", { p_exam_id: examId });
    expect(few.error?.message).toMatch(/Not enough questions/);
    for (let n = 5; n <= 9; n++) await addQuestion(n, n % 4);
    expect((await anon.rpc("start_mock_attempt", { p_exam_id: examId })).error).toBeTruthy();
    const draft = await userA.rpc("start_mock_attempt", { p_exam_id: draftExamId });
    expect(draft.error?.message).toMatch(/Exam not available/);
    const bad = await userA.rpc("start_mock_attempt", { p_exam_id: examId, p_count: 3 });
    expect(bad.error?.message).toMatch(/between 5 and 30/);
  });

  it("starts with a server-set deadline and a question snapshot, and resumes the running attempt", async () => {
    const started = await userA.rpc("start_mock_attempt", { p_exam_id: examId });
    expect(started.error).toBeNull();
    attemptId = started.data!;
    const a = await attemptOf(attemptId);
    expect(a).toMatchObject({ status: "in_progress", question_count: 9, duration_seconds: 540 });
    const msLeft = new Date(a.expires_at).getTime() - Date.now();
    expect(msLeft).toBeGreaterThan(530_000);
    expect(msLeft).toBeLessThanOrEqual(540_000);
    const again = await userA.rpc("start_mock_attempt", { p_exam_id: examId });
    expect(again.data).toBe(attemptId); // resumed, not a second attempt
    const { count } = await db
      .from("mock_attempt_questions")
      .select("question_id", { count: "exact", head: true })
      .eq("attempt_id", attemptId);
    expect(count).toBe(9);
  });

  it("shows no answers or explanations while the test is running", async () => {
    const qs = await userA.rpc("get_mock_questions", { p_attempt_id: attemptId });
    expect(qs.data).toHaveLength(9);
    for (const q of qs.data!) {
      expect(q.correct_index).toBeNull();
      expect(q.explanation).toBeNull();
      expect(q.selected_index).toBeNull();
    }
  });

  it("only the owner can read, save or submit", async () => {
    expect(
      (await userB.rpc("get_mock_questions", { p_attempt_id: attemptId })).error?.message,
    ).toMatch(/not found/);
    const save = await userB.rpc("save_mock_answer", {
      p_attempt_id: attemptId,
      p_question_id: questionIds[0]!,
      p_selected: 0,
    });
    expect(save.error?.message).toMatch(/not found/);
    expect(
      (await userB.rpc("submit_mock_attempt", { p_attempt_id: attemptId })).error?.message,
    ).toMatch(/not found/);
    expect((await userB.from("mock_attempts").select("id")).data).toEqual([]);
    expect((await userB.from("mock_attempt_questions").select("attempt_id")).data).toEqual([]);
  });

  it("saves, changes and clears answers; rejects bad input", async () => {
    const qs = (await userA.rpc("get_mock_questions", { p_attempt_id: attemptId })).data!;
    const byId = new Map(qs.map((q) => [q.question_id, q]));
    const save = (qid: string, sel: number | null) =>
      userA.rpc("save_mock_answer", {
        p_attempt_id: attemptId,
        p_question_id: qid,
        p_selected: sel as number,
      });
    const idx = (qid: string) => correct[questionIds.indexOf(qid)]!;
    const ids = qs.map((q) => q.question_id);
    // 0..2 correct, 3..4 wrong, 5 answered then cleared, 6..8 unanswered
    for (const qid of ids.slice(0, 3)) expect((await save(qid, idx(qid))).error).toBeNull();
    for (const qid of ids.slice(3, 5))
      expect((await save(qid, (idx(qid) + 1) % 4)).error).toBeNull();
    expect((await save(ids[5]!, 0)).error).toBeNull();
    expect((await save(ids[0]!, (idx(ids[0]!) + 1) % 4)).error).toBeNull(); // change mind...
    expect((await save(ids[0]!, idx(ids[0]!))).error).toBeNull(); // ...and back
    expect((await save(ids[5]!, null)).error).toBeNull(); // clear
    expect((await save(ids[0]!, 9)).error?.message).toMatch(/Invalid option/);
    expect((await save(crypto.randomUUID(), 0)).error?.message).toMatch(/not part of this attempt/);
    const after = (await userA.rpc("get_mock_questions", { p_attempt_id: attemptId })).data!;
    expect(after.filter((q) => q.selected_index !== null)).toHaveLength(5);
    expect(byId.size).toBe(9);
  });

  it("scores on the server when submitted, matching the documented formula; submit is idempotent", async () => {
    // An admin hiding a question mid-test must not change this attempt.
    await db.from("questions").update({ status: "hidden" }).eq("id", questionIds[0]!);
    const status = await userA.rpc("submit_mock_attempt", { p_attempt_id: attemptId });
    expect(status.data).toBe("submitted");
    const a = await attemptOf(attemptId);
    const review = (await userA.rpc("get_mock_questions", { p_attempt_id: attemptId })).data!;
    expect(review).toHaveLength(9); // snapshot survives the hide
    const expected = scoreAttempt(
      review.map((q) => ({
        subject: q.subject,
        selectedIndex: q.selected_index,
        correctIndex: q.correct_index,
      })),
    );
    expect(expected).toMatchObject({ correct: 3, wrong: 2, unanswered: 4 });
    expect(a).toMatchObject({
      status: "submitted",
      correct_count: 3,
      wrong_count: 2,
      unanswered_count: 4,
      score: expected.score,
    });
    expect(Number(a.score)).toBe(2.5);
    // Answers and explanations appear only now.
    for (const q of review) {
      expect(q.correct_index).not.toBeNull();
      expect(q.explanation).toMatch(/Because of/);
    }
    // Idempotent, and nothing can be changed after submitting.
    expect((await userA.rpc("submit_mock_attempt", { p_attempt_id: attemptId })).data).toBe(
      "submitted",
    );
    expect(Number((await attemptOf(attemptId)).score)).toBe(2.5);
    const late = await userA.rpc("save_mock_answer", {
      p_attempt_id: attemptId,
      p_question_id: questionIds[1]!,
      p_selected: 0,
    });
    expect(late.error?.message).toMatch(/already finished/);
    await db.from("questions").update({ status: "published" }).eq("id", questionIds[0]!);
  });

  it("refuses answers after the deadline and scores what was saved in time", async () => {
    const started = await userA.rpc("start_mock_attempt", { p_exam_id: examId, p_count: 5 });
    const id = started.data!;
    expect(id).not.toBe(attemptId); // a finished attempt does not block a new one
    const qs = (await userA.rpc("get_mock_questions", { p_attempt_id: id })).data!;
    const first = qs[0]!;
    const right = correct[questionIds.indexOf(first.question_id)]!;
    expect(
      (
        await userA.rpc("save_mock_answer", {
          p_attempt_id: id,
          p_question_id: first.question_id,
          p_selected: right,
        })
      ).error,
    ).toBeNull();
    // The clock runs out (moved by the service role to simulate it).
    await db
      .from("mock_attempts")
      .update({ expires_at: new Date(Date.now() - 5_000).toISOString() })
      .eq("id", id);
    const second = qs[1]!;
    const late = await userA.rpc("save_mock_answer", {
      p_attempt_id: id,
      p_question_id: second.question_id,
      p_selected: 0,
    });
    expect(late.error).toBeNull();
    expect(late.data).toBe("expired"); // closed and scored; the answer was not stored
    const a = await attemptOf(id);
    expect(a.status).toBe("expired");
    expect(a).toMatchObject({ correct_count: 1, unanswered_count: 4 });
    expect(Number(a.score)).toBe(1);
    // The late answer was not stored.
    const stored = await db
      .from("mock_attempt_questions")
      .select("selected_index")
      .eq("attempt_id", id)
      .eq("question_id", second.question_id)
      .single();
    expect(stored.data?.selected_index).toBeNull();
  });

  it("closes a stale running attempt when a new one is started, and when its questions are opened", async () => {
    const id1 = (await userB.rpc("start_mock_attempt", { p_exam_id: examId, p_count: 5 })).data!;
    await db
      .from("mock_attempts")
      .update({ expires_at: new Date(Date.now() - 1_000).toISOString() })
      .eq("id", id1);
    const id2 = (await userB.rpc("start_mock_attempt", { p_exam_id: examId, p_count: 5 })).data!;
    expect(id2).not.toBe(id1);
    expect((await attemptOf(id1)).status).toBe("expired");
    await db
      .from("mock_attempts")
      .update({ expires_at: new Date(Date.now() - 1_000).toISOString() })
      .eq("id", id2);
    const qs = (await userB.rpc("get_mock_questions", { p_attempt_id: id2 })).data!;
    expect(qs[0]!.correct_index).not.toBeNull(); // opening an overdue test ends it and reveals answers
    expect((await attemptOf(id2)).status).toBe("expired");
  });

  it("clients cannot write attempts, forge scores, or call the internal function", async () => {
    const forge = await userA
      .from("mock_attempts")
      .update({ score: 999 })
      .eq("id", attemptId)
      .select();
    expect(forge.data ?? []).toEqual([]);
    expect(Number((await attemptOf(attemptId)).score)).toBe(2.5);
    const ins = await userA.from("mock_attempts").insert({
      user_id: userIds[0]!,
      exam_id: examId,
      question_count: 5,
      duration_seconds: 300,
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    });
    expect(ins.error).toBeTruthy();
    const ans = await userA
      .from("mock_attempt_questions")
      .update({ selected_index: 0 })
      .eq("attempt_id", attemptId)
      .select();
    expect(ans.data ?? []).toEqual([]);
    expect(
      (await userA.rpc("finalize_mock_attempt", { p_attempt_id: attemptId })).error,
    ).toBeTruthy();
  });

  it("the database enforces one running attempt per user and exam", async () => {
    const id = (await userA.rpc("start_mock_attempt", { p_exam_id: examId, p_count: 5 })).data!;
    const dup = await db.from("mock_attempts").insert({
      user_id: userIds[0]!,
      exam_id: examId,
      question_count: 5,
      duration_seconds: 300,
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    });
    expect(dup.error?.message).toMatch(/mock_attempts_one_running/);
    await userA.rpc("submit_mock_attempt", { p_attempt_id: id });
  });
});
