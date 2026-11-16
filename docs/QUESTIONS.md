# Practice question bank (Phase 5)

Candidates practise multiple-choice questions for the exams they are preparing for, with instant feedback. **Nobody types questions**: the sync (service role) creates them from two sources, and admins only monitor and hide wrong ones.

## Decisions (owner)
- Sources: **both** official sample/model papers and AI-generated practice questions.
- Publish gate for AI questions: **automatic checks, then publish** (no manual review per question, no candidate "report" button). Admins can hide/restore a question on `/admin/questions`.

## Sources and how each is verified
**Official paper** (`origin = official_paper`): read from `exam_materials` links of kind `sample_paper` (Phase 4).
1. The paper must state an answer key (`hasAnswerKey`), otherwise nothing is imported.
2. The LLM copies questions and options as written; `correctIndex` only if the document states it, otherwise `null` and the question is dropped. The answer is never worked out by the model.
3. The question and **all four options must literally appear** in the paper text (`appearsVerbatim`).
4. Stored with `verification = source_verbatim` and the paper's official URL (DB CHECK: official host, required).

**AI-generated practice** (`origin = ai_generated`): for the syllabus's leaf topics with the fewest questions (target 5 per topic; time-sensitive topics such as current affairs are skipped).
1. The active LLM writes 5 original questions (timeless fundamentals, text-only, one objectively checkable answer, no vague "purpose of…" questions).
2. Structural checks (`checkGeneratedDraft`): four distinct options, answer in range, explanation present, no "all of the above", no references to figures/passages, no vague meta questions.
3. **Two independent solves** must both pick the generator's answer: the solver never sees the answer, and the second solve gets the options in reverse order, so an ambiguous question or a position-biased pick makes the answer move and the question is dropped.
4. Options are shuffled, then stored with `verification = ai_cross_checked`. Candidates always see an "AI-generated practice" badge and a note that it is not a real exam question.

## Answers are never sent up front
`questions` holds no answers. Correct answers live in `question_answers`, which candidates cannot read (no policy). A candidate learns the answer only by answering: `answer_practice_question()` (security definer, authenticated only) records the attempt in `practice_attempts` and returns the correct option and explanation. Attempts cannot be forged (no INSERT policy) and are private to the user.

## Database (`20261116090000_phase5_questions.sql`)
`questions` (origin, subject/topic as text copied from the syllabus, prompt, 4 options, optional difficulty, source URL, verification, status published/hidden, unique `(exam_id, content_hash)`), `question_answers`, `practice_attempts`, `add_question()` (service role only, atomic, idempotent), plus `exams.questions_synced_at/questions_error` and `exam_materials.questions_extracted_at`. CHECK constraints: official needs an official source URL; origin ↔ verification pairing; exactly four options. RLS: candidates read published questions of published, verified exams; reviewers read all; nobody but the service role writes.

## Using it
- Candidate: **Practice Questions** (`/practice`) lists active targeted exams with counts and subject chips; `/practice/[slug]?subject=` serves a set of 10 (unanswered first), one question at a time.
- Admin → **Questions**: per-exam counts, latest questions, **Generate questions now** (admin role, needs an AI provider), Hide/Restore (audited). The cron route (`/api/cron/exam-sync`) also runs it.
- A run reads up to 2 unread official papers and generates for up to 3 topics (about two LLM calls each plus two solves).

## Known limits (honest)
- **Model quality matters.** With the Cloudflare Llama 3.3 70B model, live runs on SSC CGL reasoning topics produced a mix: arithmetic and geometry questions were fine, while analogy and "similarities and differences" questions were sometimes vague or debatable even after the cross-check (the second solve and the vague-question filter were added because of this). The cross-check reduces but does not remove wrong or ambiguous questions. A stronger model (Gemini, GPT, Claude via Admin → AI providers) is recommended for question generation, and wrong questions can be hidden.
- Official sample papers with a stated answer key are rare on the sites searched so far: none were collected yet for the local exams, so the official path is tested with fixtures only (real DB, fake page and extractor), not on a live paper. Scanned (image-only) PDFs cannot be read.
- Official-paper questions have no subject/topic (shown under "Official paper questions").
- Questions needing figures, tables or passages are excluded. Current-affairs topics are not generated.
- Practice sets are chosen in the app (random, unanswered first) from up to 2000 questions per exam; fine at this scale.
- Per-topic accuracy and weak-area analytics come in Phase 10; mock tests with server-side scoring in Phase 6.

## Tests
`tests/questions/domain.test.ts` (draft checks, vague/compound/external-material rejection, shuffle keeps the answer, topic selection, verbatim/answer-key rules), `tests/questions/sync.test.ts` (real DB + fake LLM/pages: both gates, idempotency, scoped runs, official import, privacy/RLS: no answers readable, attempts recorded and private, hidden questions refused, forged inserts and `add_question` denied, DB CHECKs), `tests/llm/question-extract.test.ts` (parsing, malformed drop, topic not in system prompt, solver never shown the answer), `tests/e2e/practice.spec.ts` (practice flow with instant feedback, nothing leaked before answering, attempts counted, admin hide/restore).
