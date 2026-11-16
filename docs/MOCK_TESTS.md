# Mock tests (Phase 6)

Timed tests built from an exam's published practice questions (Phase 5), **scored by the server**. The browser is only a display: it cannot extend the clock, see answers early, or send a score.

## What a candidate does
`/mock-tests` lists the exams they are preparing for (with how many questions a test would have), a **Start mock test** / **Resume test** button, and their past attempts. A test shows one question at a time with a navigator, a countdown, change/clear answer, and a confirm-before-submit step. After submitting (or when time runs out) the result page shows score, correct/wrong/unanswered, time used, a per-subject table, and a full review with the correct answers and explanations.

## Rules (all enforced in the database; `20261117090000_phase6_mock_tests.sql`)
- **Start** (`start_mock_attempt`): a random snapshot of the exam's published questions: up to 20, at least 5 (otherwise "not enough questions yet"), **one minute per question**. The deadline `expires_at` is set by the server. Starting again while a test is running resumes it; an overdue one is closed first. At most one running attempt per user and exam (partial unique index).
- **While running**: `get_mock_questions` returns prompts and options only; `correct_index` and `explanation` are `null`. Answers are saved one at a time with `save_mock_answer` (change or clear freely). A save after the deadline is **not stored**: the attempt is closed and scored from what was saved in time.
- **Submit** (`submit_mock_attempt`): idempotent. The score is computed from `question_answers` inside the database (`finalize_mock_attempt`, not callable by clients): `correct x marks_correct − wrong x marks_wrong`; unanswered scores 0. Status is `submitted`, or `expired` if the deadline had passed.
- **After it ends**: only then does `get_mock_questions` include the correct answers and explanations. Nothing can be changed after submitting.
- **Ownership**: every function checks `auth.uid()`; another user's attempt is "not found". Attempts and their question rows have owner-only SELECT policies and **no** INSERT/UPDATE/DELETE policies, so a score or an answer cannot be written from a client.
- The attempt keeps its question snapshot: an admin hiding a question later does not change an attempt that already contains it.
- An overdue test with nobody watching is closed lazily the next time the attempt is opened, saved to, or a new test is started (no background job needed; the score does not depend on when it is closed).

## Practice marking (product default, not an official scheme)
**+1 correct, −0.25 wrong, 0 unanswered, 1 minute per question.** These are *not* any real exam's rules (exams differ and the platform has no verified source for them), so the UI says so on the hub and on every result. The marks are stored on each attempt (`marks_correct`, `marks_wrong`), so changing the scheme later, or making it per exam once official schemes are sourced, does not rewrite history.

## Client behaviour worth knowing
- The countdown uses the server's clock (offset measured when the page loads), so a wrong device clock does not matter. At zero the page submits itself.
- Next.js runs server actions one at a time, so quick clicks queue. The page shows **Saving… / All answers saved** and warns before leaving while a save is pending. If a save is rejected the choice reverts and an error shows.

## Limits
- Question quality depends on the question bank (see `QUESTIONS.md`): AI-generated questions are cross-checked but not guaranteed. Tests are random across subjects; there are no sectional timers, section cut-offs or per-exam patterns yet.
- A test needs at least 5 questions for that exam, and the bank is thin until generation has run.
- No pause/resume of the clock, no review-marking ("mark for review"), and no admin view of attempts. Per-topic analytics from attempts come in Phase 10.

## Tests
`tests/mock-tests/domain.test.ts` (scoring formula, subject breakdown, clock helpers, planned size), `tests/mock-tests/attempts.test.ts` (real DB: too-few/unpublished/anonymous refused, server-set deadline and snapshot, resume, no answers while running, owner-only access, save/change/clear and bad input, server score equals the documented formula and is idempotent, nothing changes after submit, hidden question mid-test, late save refused and scored from saved answers, stale attempts closed, clients cannot forge scores or call the internal function, one running attempt per user), `tests/e2e/mock-tests.spec.ts` (full test with nothing leaked while running, saved answers survive a reload, score and review, overdue test closed by the server, auto-submit at zero, login required).
