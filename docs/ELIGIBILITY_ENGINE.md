# Eligibility Engine Specification

**Project:** Government Jobs Eligibility and Discovery Platform
**Status:** Draft v1.0 — eligibility business-logic source of truth
**Related documents:** [PRD.md](./PRD.md) (product requirements), [ARCHITECTURE.md](./ARCHITECTURE.md) (system architecture), [DATABASE.md](./DATABASE.md) (schema this engine reads from), [SECURITY.md](./SECURITY.md) (not yet authored)

This document defines the complete business logic for determining whether a user appears eligible for a government job post. It is a domain specification, not an implementation — no code, no migrations. Where this document resolves an open question left in DATABASE.md §36, that resolution is called out explicitly and DATABASE.md should be treated as superseded on that point until it is updated to match.

---

## 1. Core Principle

Eligibility is **deterministic, explainable, testable, and independent of AI**. The engine is a pure function of structured input:

```
User Profile
  +
Structured Job Rules
  +
Cutoff Dates
  ↓
Deterministic Eligibility Engine
  ↓
eligible | not_eligible | needs_verification
  +
Detailed, per-dimension reasons
```

The system never asks an LLM "is this user eligible?" and never routes a final eligibility decision through a model call of any kind. AI may assist upstream — extracting structured rules from a government advertisement into the tables defined in DATABASE.md §12–§18 — but once those rules exist as structured data, evaluation against a user's profile is ordinary deterministic application logic: comparisons, arithmetic, and table lookups. AI output that has not yet passed through the extraction → validation → normalization → review pipeline (PRD.md §17, ARCHITECTURE.md §5) is not visible to this engine at all — the engine only ever reads `approved`/`published` job rule data.

This principle is non-negotiable per CLAUDE.md and is the reason every section below insists on a conservative default: when the engine cannot determine an answer with confidence, it says so (`needs_verification`) rather than guessing.

---

## 2. Eligibility Result

Exactly three top-level states exist. No other value is a valid engine output.

### `eligible`
Returned when **every mandatory dimension** evaluated for the job post passes, and no dimension returned `needs_verification`. "Mandatory" means: every dimension for which the job post has a rule (per DATABASE.md §12, an absent rule row means that dimension is unrestricted and trivially passes — see §3).

### `not_eligible`
Returned when **at least one mandatory dimension definitively fails** — the engine was able to evaluate the rule with confidence and the user's profile does not satisfy it. A single definite failure is sufficient regardless of how many other dimensions pass; eligibility is not a score or a percentage.

### `needs_verification`
Returned when the engine **cannot safely determine** eligible/not_eligible, because at least one dimension could not be evaluated with confidence and no other dimension has already produced a definite `not_eligible`. Triggers include, but are not limited to:
- Required profile data is missing (e.g. `date_of_birth`, `category_id`, `state_id`, or `education_level_id` is null and the job has a rule on that dimension).
- A job rule row exists but is marked low-confidence by extraction (`is_confident = false` / a non-null `parse_note`, per DATABASE.md §13–§17).
- A qualification cannot be confidently matched (the user's `user_qualifications` don't clearly satisfy or clearly fail a `job_qualification_requirements` group).
- A rule shape the engine doesn't model is encountered (see §14, unsupported conditions).
- A stacking/relaxation combination is ambiguous (§7).

**Precedence rule:** `not_eligible` takes priority over `needs_verification` when both would otherwise apply — i.e. if the engine can definitively fail the user on one dimension, it reports `not_eligible` even if a separate, unrelated dimension is also ambiguous, because the definite failure is itself a sufficient, honest answer and doesn't require inventing certainty elsewhere. This is the one deliberate exception to "never assume when ambiguous" — it doesn't assume anything; it reports the one thing it *does* know for certain. See §4 and §9 for exactly how this interacts with the aggregation step.

The engine never returns `eligible` unless *every* dimension is either passing-with-confidence or trivially unrestricted. There is no "probably eligible" state — ambiguity always routes to `needs_verification`, never to a hopeful `eligible`.

---

## 3. Evaluation Model

```
Job Post
  |
  +-- Age                 (job_age_rules, job_category_relaxations)
  +-- Category / Status   (composable — see §8)
  +-- State / Domicile    (job_state_scope, job_state_scope_states)
  +-- Gender              (job_gender_rules)
  +-- Experience          (job_experience_rules)
  +-- Qualification       (job_qualification_requirements)
  |
  ↓
All mandatory dimensions must pass (AND across dimensions)
```

**Across dimensions: strict AND.** A job post's overall eligibility requires age AND category-relaxed-age AND state/domicile AND gender AND experience AND qualification to each independently pass. There is no dimension that can compensate for another (e.g. exceptional qualifications do not offset a failed age check) — real government eligibility rules do not work that way, and the engine must not invent a trade-off that the source notification doesn't state.

**Within a dimension:**
- **Qualification** is the one dimension with an explicit OR/AND structure by design (DATABASE.md §7, §18): rows sharing a `group_id` are OR'd (any one satisfies that group), and distinct `group_id` values are AND'd (every group must have at least one satisfied row). This is the only dimension with internal alternation in the MVP data model.
- **State/domicile** has an implicit OR across `job_state_scope_states` rows for `specific_states`/`domicile_required` scope types — the user's state (or domicile state) matching *any one* listed state satisfies the dimension. This is OR by construction of "is the user's state in this set," not a general boolean feature.
- **Category relaxation** is not itself a pass/fail dimension — it's a modifier consumed by the age dimension (§6, §9). The category/status *dimension itself* (does the user hold a status the job restricts to) is evaluated separately from the *relaxation* that status grants (see §8).
- **Age, gender, experience** each have a single rule row per post (DATABASE.md: `UNIQUE (job_post_id)` on each) — there is no internal alternation to define; each is a single comparison (or small set of comparisons: min AND max for age/experience).

No dimension uses OR against another dimension. Every "OR" in this engine is strictly *within* a single dimension's own alternatives, never a shortcut for a whole dimension being skippable.

---

## 4. Evaluation Pipeline

Conceptual order (does not change the final logical result — see note below):

1. **Validate profile** — determine which of `date_of_birth`, `category_id`, `state_id`, `domicile_state_id`, `gender`, `education_level_id`/`user_qualifications`, `experience_years` are present. Absence is not an error; it's an input fact the later steps consume.
2. **Determine relevant cutoff dates** — read `job_age_rules.age_cutoff_date` for this post (and `job_experience_rules.as_of_date` if present); these are per-post, never "today," per DATABASE.md §13.
3. **Calculate age** — from `date_of_birth` and the cutoff date (§5). Age is computed once per evaluation and reused by both the base age check and any category relaxation check — it is not recomputed per rule.
4. **Evaluate age rules** — compare computed age against `min_age`/`max_age` (§6).
5. **Evaluate category/composable status** — determine the user's applicable category and additional statuses, resolve relaxation per §7–§9, and re-check the age dimension against the *effective* max age if a relaxation applies. (This step feeds back into step 4's result — see the note on step ordering below.)
6. **Evaluate state/domicile rules** (§10).
7. **Evaluate gender rules** (§11).
8. **Evaluate experience** (§12).
9. **Evaluate qualifications** (§13).
10. **Aggregate dimension results** (§9/§14) — combine all dimension outcomes into a single overall status per the precedence rule in §2.
11. **Produce final status.**
12. **Produce human-readable explanation** — a per-dimension breakdown (§15), generated from the same per-dimension results used for aggregation, not recomputed separately.

**Why age (step 4) and category (step 5) are listed as separate steps despite category feeding into the age check:** age is calculated and checked against the *base* `max_age` first only conceptually, to establish what "the base rule" means for the explanation (§15's requirement to show base vs. relaxed limits per DATABASE.md §6's explicit instruction not to conflate them); the dimension's *actual* pass/fail verdict used in aggregation is always computed against the effective (relaxed) limit once category is known. Implementations may compute both in a single pass — the pipeline order here describes conceptual dependency, not mandatory execution order. **The order in which independent dimensions (age+category, state, gender, experience, qualification) are evaluated must not change the final aggregate result**, because aggregation (§2, §9) is order-independent: it is "AND of all dimensions, with not_eligible dominating needs_verification, dominating eligible." Any evaluation order that computes all dimension results before aggregating produces the same final status. This is the sense in which "order must not change the final logical result" — it is a statement about aggregation being commutative, not a claim that age can be checked without knowing category-derived relaxation.

---

## 5. Age Calculation

**Inputs:** `profiles.date_of_birth` (a `date`), `job_age_rules.age_cutoff_date` (a `date`, per post — DATABASE.md §13).

**The current date (today) is never used for age calculation when a job post has an `age_cutoff_date`.** Every `job_age_rules` row has a required, non-null `age_cutoff_date` (DATABASE.md §13 marks it `NOT NULL`), so in practice this condition is always true once a post has an age rule at all; a post with no `job_age_rules` row has no age dimension to evaluate in the first place (§3 — absent rule row = unrestricted).

**Method: calendar age**, not `(cutoff_date − date_of_birth) / 365`. Calendar age is computed as:

```
age = cutoff_date.year - date_of_birth.year
if (cutoff_date.month, cutoff_date.day) < (date_of_birth.month, date_of_birth.day):
    age -= 1
```

This is the standard "has the birthday occurred yet, relative to the cutoff date" rule — a birthday that falls exactly on the cutoff date counts as having occurred (age increments on the birthday itself, inclusive).

**Worked example (matches the task's example):**
```
DOB:    15-08-2000
Cutoff: 14-08-2026

Naive year subtraction: 2026 - 2000 = 26
Birthday (08-15) has NOT occurred by cutoff (08-14) → subtract 1
Age = 25
```
Age is 25, not 26 — the cutoff date is one day *before* the birthday that year, so the user has not yet turned 26 as of the cutoff.

**Contrast:** if the cutoff were `15-08-2026` (the birthday itself), age would be 26 (birthday has occurred, inclusive).

**Defined behaviors:**

| Case | Behavior |
|---|---|
| Exact birthday on cutoff date | Birthday counts as occurred; age increments (inclusive, as in the worked example above) |
| Day/month/year comparison | Full calendar comparison as shown above — never a floating-point days/365 approximation, which drifts by up to a day around leap years and produces off-by-one errors near birthdays |
| Leap-year birthday (Feb 29) | The calendar-age algorithm above handles this correctly without a special case in a *non-leap* cutoff year: comparing `(month, day)` tuples, `(2, 29)` vs. e.g. `(3, 1)` or `(2, 28)` on the cutoff side works using ordinary date-library date arithmetic (constructing "this year's birthday" as Feb 29 in a non-leap year is invalid, so the standard, documented convention is: the birthday is treated as occurring on **March 1** in a non-leap cutoff year, consistent with DATABASE.md §13's note). This must be implemented using the platform's date library's calendar-aware comparison, not manual date construction that could throw on an invalid Feb 29. |
| `date_of_birth` is null | Age cannot be computed → the age dimension returns `needs_verification` ("date of birth not provided") |
| `date_of_birth` is invalid (fails validation at write time) | Should be prevented at the data layer (DATABASE.md profile validation); if nonetheless encountered, treat identically to null — `needs_verification`, never a computed garbage age |
| `date_of_birth` is in the future, or later than `age_cutoff_date` | Not a valid age — treat as `needs_verification` ("date of birth appears invalid relative to cutoff date"), never a negative age silently compared against rules |

Age is **never** stored (DATABASE.md §4, §13) — every evaluation recomputes it from `date_of_birth` and the specific post's `age_cutoff_date`, since different posts (even within the same notification) may have different cutoff dates.

---

## 6. Age Rules

Supported shapes, all read from a single `job_age_rules` row per post (DATABASE.md §13):

- **Minimum age** (`min_age`): if set, computed age must be `>= min_age`.
- **Maximum age** (`max_age`): if set, computed age must be `<= effective_max_age` (base `max_age` plus any applicable relaxation — see below).
- **No minimum** (`min_age IS NULL`): dimension is unrestricted on the low end; any age passes the minimum check.
- **No maximum** (`max_age IS NULL`): unrestricted on the high end.
- **Category relaxation**: additive adjustment to `max_age` only (per DATABASE.md §14 and real-world government convention — relaxation is virtually always applied to the upper bound, extending how old a candidate may be, not the lower bound). If a real-world notification ever relaxed a *minimum* age instead, that is an unsupported condition (§14) and routes to `needs_verification` rather than being silently mapped onto the same mechanism as maximum-age relaxation.
- **Additional relaxation dimensions**: gender-based or "special" (e.g. departmental candidate, widow/divorced-women-specific relaxation in some state notifications) relaxations are represented the same way category relaxation is — as named, stackable relaxation sources feeding the same effective-max-age calculation (§7). The MVP schema (DATABASE.md) only explicitly models category-based relaxation (`job_category_relaxations`); gender- or special-status-based age relaxation is an **unsupported condition** until the schema is extended — see §14 and the open item in §16.

**Critical separation, per the task's explicit instruction:** the **base rule** (`job_age_rules.max_age`) is never modified in the database when a relaxation applies. The **effective limit** is always computed at evaluation time:

```
effective_max_age = base_max_age + applicable_relaxation_years
```

Example:
```
Base maximum age = 30
SC/ST relaxation = 5
Effective maximum = 35
```

The `job_age_rules` row for this post continues to read `max_age = 30` permanently; `35` exists only as a runtime evaluation result, never written back to the database. This preserves the base rule as the auditable source of truth and lets the explanation (§15) show both the base rule and the applied relaxation, matching PRD.md §10.3's example format.

---

## 7. Stacked / Composable Relaxations

**This section resolves the open question flagged in DATABASE.md §36.**

Government notifications sometimes grant relaxation from more than one applicable status simultaneously (OBC + PwBD, SC/ST + PwBD, Ex-Servicemen + category, departmental candidate + category). The engine must not assume only one status can ever apply to a user, and must not assume all applicable relaxations simply add together — both are real patterns in actual notifications, and which one applies is a fact stated (or left unstated) by the specific notification, not a universal rule.

**Combination modes the engine must be able to represent:**

- **`additive`** — relaxations from multiple applicable statuses are summed. E.g. "OBC candidates get +3; PwBD candidates get an additional +10" → a user who is both gets +13.
- **`max_of`** — only the single largest applicable relaxation applies, not the sum. E.g. "candidates get the relaxation for whichever one category applies to them, whichever is higher" → a user who is both OBC (+3) and PwBD (+10) gets +10, not +13.
- **`mutually_exclusive`** — the notification structures categories such that a candidate is only ever classified under one bucket at evaluation time (e.g. category and PwBD-within-category are modeled as a single combined category code, so there is no separate stacking decision to make — the "combination" was already resolved by the category taxonomy itself, per §8's composable model).
- **`unsupported` / ambiguous** — the notification's stacking behavior is not stated clearly enough, or the extraction could not confidently determine which mode applies.

**Data model requirement (extends DATABASE.md §14):** `job_category_relaxations` and any future status-relaxation tables (§16) must carry enough information to represent *which* combination mode governs a given post, not just a flat per-category relaxation number. Conceptually, a `job_post_id` needs a single `relaxation_combination_mode` value (`additive` | `max_of` | `mutually_exclusive` | `unsupported`) alongside its set of per-status relaxation rows, rather than the combination mode being implicit or hardcoded in application logic. This is a schema extension beyond what DATABASE.md §14 currently defines (which only has a flat `job_category_relaxations` table with no combination-mode column) — **DATABASE.md must be updated** to add this column (or an equivalent) before the engine can be correctly implemented; until then, this document's requirement is the specification the schema update must satisfy.

**Engine behavior:**
1. Determine the full set of statuses applicable to the user (primary category, plus any additional statuses per §8) that have a matching relaxation row for this job post.
2. If zero statuses apply, `applicable_relaxation_years = 0` (no ambiguity — nothing to stack).
3. If exactly one status applies, use its relaxation value directly (no stacking decision needed).
4. If two or more statuses apply:
   - If the post's `relaxation_combination_mode` is `additive`, sum the relaxation years across all applicable statuses.
   - If `max_of`, take the maximum relaxation value among applicable statuses.
   - If `mutually_exclusive`, this case should not arise under a correctly-modeled category taxonomy (§8) — if it does arise anyway (a data/extraction inconsistency), treat as `unsupported`.
   - If `unsupported`, or if `relaxation_combination_mode` itself is null/unset for a post that has multiple applicable relaxation rows, the age dimension returns `needs_verification` with a reason naming the specific statuses in conflict (e.g. "Multiple relaxations may apply (OBC, PwBD) but the notification's stacking rule could not be confidently determined").

**The engine never guesses between additive and max_of when the mode is unclear.** This is the direct application of PRD.md's "never assume eligibility when ambiguous" to the single case most likely to silently produce a wrong age boundary if mishandled.

---

## 8. Category Model

**This section resolves the second open question flagged in DATABASE.md §36.**

**Core distinction (per the task's explicit instruction): a reservation category and a special status are not the same concept, and the engine must not force every eligibility dimension into one category field.**

- **Reservation category** (`categories` in DATABASE.md §5: General/UR, OBC, SC, ST, EWS, and any state-specific aliases) — describes the caste-based reservation classification a candidate is certified under. A candidate holds **exactly one** primary reservation category.
- **Special status** — describes an additional, independently-held status that is *not* a reservation category but that notifications frequently grant separate relaxation or eligibility conditions for: PwBD/PwD (persons with benchmark disabilities), Ex-Servicemen, and similar. A candidate may hold **zero, one, or more** special statuses simultaneously, and holding one does not replace or override their reservation category — a candidate can be OBC *and* PwBD *and* Ex-Serviceman at once.

**Composable model (conceptual, matching the task's example):**

```
Profile:
  Primary category:     OBC
  Additional statuses:   [PwBD, Ex-Serviceman]

Job post:
  Category rules:       job_category_relaxations (per-category age relaxation, DATABASE.md §14)
  Status-specific rules: (new — see below) per-status age relaxation and/or per-status
                          eligibility gates (e.g. "post reserved for Ex-Servicemen only")
```

**What this requires beyond the current DATABASE.md schema:**

1. **Profile side:** `profiles` currently has a single `category_id` (DATABASE.md §4) and no field for additional statuses. This specification requires a new `profile_statuses` (or similarly named) join table — `profile_id` × a `statuses` reference table (analogous to `categories`, holding PwBD, Ex-Serviceman, and any future special statuses) — supporting zero-to-many rows per profile. This is a schema extension DATABASE.md must incorporate; it does not exist there today.
2. **Job side:** `job_category_relaxations` (DATABASE.md §14) already supports per-category relaxation keyed by `categories.id`. An analogous `job_status_relaxations` table (or a widened version of the same table keyed by either a `category_id` or a `status_id`) is needed to hold per-status relaxation (e.g. "PwBD: +10"), plus the `relaxation_combination_mode` from §7. Additionally, some posts *gate* eligibility on status rather than merely relaxing age (e.g. "this post is reserved for Ex-Servicemen only," or "open to all, but 4 vacancies reserved for PwBD" — the latter is a vacancy-allocation detail out of this product's scope per DATABASE.md §14's note, not an eligibility gate the engine needs to enforce). Where a post *does* gate eligibility on a required status (not just relaxation), that is a distinct rule type this document flags as a schema/engine gap for status-gated eligibility — not yet modeled, and any such post encountered by extraction routes to `needs_verification` until modeled (§14).

**Kept implementable for MVP:** the engine does not need a generic key-value status system. It needs exactly two extensions to what DATABASE.md already has — a `statuses` reference list + `profile_statuses` join, and a per-status relaxation table with a combination-mode flag — both of which follow the *exact same pattern* already established for `categories`/`profiles.category_id`/`job_category_relaxations`. This keeps the composable model implementable without inventing new architecture.

**Evaluation implication:** the "applicable statuses" set referenced throughout §7 is: `{profile.category_id}` (the single primary category) **∪** `{profile_statuses for this profile}` (zero or more), intersected against whichever of those have a matching relaxation row for the specific job post being evaluated. A status the user holds but that has no relaxation row for this particular post simply contributes nothing (not an error, not `needs_verification` on its own) — it only matters when it's actually referenced by the post's rules.

---

## 9. Category Relaxation

Restating and formalizing the worked example from the task, now precisely defined via §6–§8:

```
Base max age = 30
SC/ST = +5
OBC = +3

User: category = OBC, no additional applicable statuses for this post
Applicable relaxation = 3 (single status, no stacking decision needed — §7 step 3)
Effective max age = 33
```

**Precedence and conflict handling:**
- A user's category/status set is resolved once per evaluation (§8) and reused for every post being evaluated in a batch (e.g. across the dashboard's job list) — it does not vary per post; only *which relaxation rows exist* for a given post varies.
- If a post has a `job_category_relaxations` row for the user's category with an *explicit* `0` value (e.g. "EWS: +0"), that is a confident, definite "no relaxation for this status" — not `needs_verification`. A `0` is a real, extracted fact, distinct from "no row exists" (§3's "absent = unrestricted," which for relaxation specifically means "no relaxation, same as 0" — the two cases produce the same numeric outcome but differ in provenance/confidence, which matters for the explanation in §15: an explicit `0` row can be shown as "OBC relaxation: none per this notification," while an absent row is shown as "no relaxation specified for your category").
- Conflicting relaxation rows for the *same* category on the *same* post (a data-integrity situation that shouldn't occur given `UNIQUE (job_post_id, category_id)` in DATABASE.md §14) cannot arise by construction; no runtime conflict-resolution logic is needed for that case.
- The only real "conflict" the engine resolves is the stacking case already fully specified in §7.

Once `effective_max_age` is computed, the age dimension's final pass/fail is: `min_age <= computed_age <= effective_max_age` (each bound only enforced if non-null, per §6). This is the single check that produces the age dimension's contribution to aggregation (§4 step 10 / §2).

---

## 10. State and Domicile

**Current state and domicile state are distinct and never conflated** (DATABASE.md §4, §15) — `profiles.state_id` (where the user currently resides) and `profiles.domicile_state_id` (where the user holds domicile status, which may be a different state or unset) are separate fields, and the engine reads whichever one the job's rule type actually calls for.

**Rule types** (from `job_state_scope.scope_type`, DATABASE.md §15):

| `scope_type` | Evaluation |
|---|---|
| `all_india` | No restriction — dimension passes unconditionally, no profile field needed. |
| `specific_states` | User's **current** state (`profiles.state_id`) must match one of the states listed in `job_state_scope_states` (OR across the listed states, §3). This models "open to residents of state X (and Y, Z...)" without necessarily requiring formal domicile proof. |
| `domicile_required` | User's **domicile** state (`profiles.domicile_state_id`) must match one of the listed states. Current state is not consulted for this rule type — a user residing in Telangana but domiciled in Andhra Pradesh does not satisfy a Telangana-domicile-required post, even though they currently live there. |

**State-specific reservation** (a state PSC applying category-relaxation rules only to candidates domiciled/resident in that state) is not a distinct rule *type* in this model — it is the ordinary `specific_states`/`domicile_required` scope combined with the ordinary category-relaxation mechanism (§6–§9) both applying to the same post; no special-case logic is needed beyond evaluating both dimensions, since they already AND together per §3.

**State-specific qualification** (a state requiring, say, proficiency in a regional language as a qualification condition) is modeled as an ordinary `job_qualification_requirements` row (§13), not as part of the state/domicile dimension — qualification-shaped conditions belong in the qualification dimension regardless of *why* the notification imposes them.

**Missing domicile data:** if `scope_type = 'domicile_required'` and `profiles.domicile_state_id` is null, the dimension returns `needs_verification` — **the engine never assumes `domicile_state_id = state_id`** even as a fallback guess, per the task's explicit instruction and PRD.md's edge case documentation (§24: "Job is applicable only to a specific domicile"). This applies symmetrically: if `scope_type = 'specific_states'` and `profiles.state_id` is null, that also returns `needs_verification` (missing the specific field the rule actually needs).

---

## 11. Gender

Evaluation of `job_gender_rules.allowed_gender` (DATABASE.md §16) against `profiles.gender`:

| Job rule | Profile gender | Result |
|---|---|---|
| No `job_gender_rules` row for this post | (any, including null) | Pass automatically — unrestricted, per §3's absent-row convention. Profile gender is never required unless a specific post actually restricts on it, per PRD.md §7's "gender... where required by eligibility rules." |
| `allowed_gender = 'all'` | (any, including null) | Pass automatically — an explicit "all" row behaves identically to no row, but may exist if extraction wants to record that the notification explicitly stated "open to all genders" (a confidence signal, not a functional difference). |
| `allowed_gender = 'male' \| 'female' \| 'other'` | Matches | Pass |
| `allowed_gender = 'male' \| 'female' \| 'other'` | Does not match (and is non-null) | Fail — `not_eligible` contribution |
| `allowed_gender = 'male' \| 'female' \| 'other'` | null (not provided) | `needs_verification` — the restriction exists and cannot be evaluated without the profile field |

The engine never infers or defaults a user's gender, and never invents a gender-restriction rule not present in `job_gender_rules` — the absence of a row is always "unrestricted," never treated as "restricted, pending clarification."

---

## 12. Experience

Evaluation of `job_experience_rules` (DATABASE.md §17) against `profiles.experience_years`:

- **No experience requirement** (no `job_experience_rules` row): pass automatically, per §3.
- **Minimum experience** (`min_years` set): `profiles.experience_years >= min_years` required. If `profiles.experience_years` is null, → `needs_verification`.
- **Maximum experience** (`max_years` set — less common, but real for some posts capping experience, e.g. entry-level-only roles): `profiles.experience_years <= max_years` required, same null-handling.
- **Experience as of a cutoff date** (`as_of_date` set): this is a data-quality/currency concern, not something the engine recomputes — `profiles.experience_years` is a static scalar the user entered (DATABASE.md §7), not something the engine ages forward from a stored start date. If `as_of_date` is set, the engine treats the user-provided `experience_years` value as their answer to "experience as of that date" at face value; the engine does not attempt to project or adjust it. (This is a known simplification — seer §16 for the corresponding limitation.)
- **Specific experience domain** (`domain_note` free text, e.g. "in a teaching hospital"): per DATABASE.md §17's explicit design choice, this is **not** machine-matched against anything on the profile (there is no structured "domain" field on `profiles.experience_years` to compare against). Any post with a non-null `domain_note` **always** contributes `needs_verification` for the experience dimension, regardless of whether the numeric min/max would otherwise pass — the engine cannot confirm domain-specific experience and must not silently ignore that part of the requirement. This is a deliberate, conservative default: a numeric-only pass is not the same as satisfying "in a teaching hospital," and reporting `eligible` while ignoring the domain qualifier would be an unsafe assumption.
- **Ambiguous/unsupported experience requirements** (e.g. a notification phrasing experience in a way extraction could not confidently reduce to `min_years`/`max_years`, reflected by `is_confident = false` or a non-null `parse_note` on the row): → `needs_verification`, per the general low-confidence handling in §2/§14.

---

## 13. Qualification

Evaluation of `job_qualification_requirements` rows for the post (DATABASE.md §7/§18), against the user's `user_qualifications` and `profiles.education_level_id`:

1. Group the post's requirement rows by `group_id`.
2. For each group, the group is **satisfied** if the user has at least one `user_qualifications` row whose `qualification_id` matches a row in that group, OR the user's `profiles.education_level_id` meets/exceeds (by `education_levels.rank`, DATABASE.md §7) an `education_level_id`-only row in that group (for groups expressed as a bare education-level minimum rather than a specific qualification).
3. The qualification dimension **passes** only if **every** group is satisfied (AND across groups; OR within a group — §3).
4. If the user has **no** `user_qualifications` rows and **no** `education_level_id` set at all, and the post has any qualification requirement rows, → `needs_verification` (nothing to evaluate against).
5. If the user has *some* qualification/education data but it doesn't clearly satisfy a group, and there's no ambiguity in the *rule itself* (i.e. the requirement is a clear, specific qualification the user provably doesn't hold, matched via `is_generic` handling below) → `not_eligible` for that group, contributing to overall `not_eligible` per §3's AND-across-groups.
6. **Generic requirements** (`qualifications.is_generic = true`, e.g. "Any Bachelor's Degree"): satisfied by *any* `user_qualifications` row whose `education_level_id` (via its `qualifications.education_level_id`) is at the Graduate rank or above — matching against the specific field of study is not required for a generic row.
7. **Specific requirements** (`is_generic = false`, e.g. "B.Tech in Computer Science"): satisfied only by a `user_qualifications` row referencing that exact `qualification_id`, or one the engine can confidently treat as equivalent (out of MVP scope — no equivalence table exists yet; exact match only). A user holding a *related but not identical* qualification (e.g. B.Sc instead of required B.Tech) against a specific, non-generic requirement is a clear `not_eligible` for that group, not `needs_verification` — the rule and the user's data are both clear; they simply don't match.
8. **Low-confidence extraction** on the requirement row itself (a `job_qualification_requirements` row derived from an extraction the pipeline flagged as uncertain — tracked via `job_imports`/review status rather than a column on this table per the current schema, see §16 gap note) → `needs_verification` for that group, overriding steps 6–7's otherwise-clear-cut matching, since the rule itself isn't trustworthy yet.

---

## 14. Unsupported / Unmodeled Conditions

Any condition present in a real government notification that this engine has no structured representation for — because DATABASE.md's schema doesn't yet have a table/column for it, or because the extraction pipeline flagged it as unparseable — is **always** `needs_verification` for the affected dimension, never silently ignored and never guessed. Known current gaps (each cross-referenced to where a schema extension would be needed):

- Gender- or special-status-based age relaxation beyond category (§6) — no schema support today.
- Status-gated eligibility (a post *requiring* a specific status like Ex-Serviceman, not just relaxing age for it) (§8) — no schema support today.
- Qualification equivalence beyond exact match (§13 point 7) — no equivalence table exists.
- Any condition an admin/reviewer would recognize as "a real rule the notification states" but that doesn't fit any of the dimensions in §3 at all (e.g. a bond/service-commitment condition, a medical-fitness condition) — these are out of the eligibility engine's scope entirely for MVP (PRD.md doesn't list them among the modeled dimensions) and are surfaced to the user only as informational text on the job detail page, not evaluated. The engine does not report `needs_verification` for conditions it was never asked to model — only for conditions within its stated scope (§3's six dimensions) that it can't confidently resolve.

---

## 15. Explanation / Human-Readable Reasons

Every evaluation returns, alongside the top-level status, a per-dimension breakdown — generated directly from the same per-dimension results computed during aggregation (§4 step 12), never recomputed or re-derived separately (which would risk the explanation and the verdict drifting apart).

**Required shape per dimension:** dimension name, pass/fail/unknown sub-status, and a plain-language reason referencing the actual numbers/values compared — matching PRD.md §10.3's exact example format:

```
Eligible

Age:
  ✓ User age: 24
  ✓ Required age: 18–30

Education:
  ✓ Graduation required
  ✓ User has graduation

Category:
  ✓ Applicable category relaxation (OBC: +3 years)
```

```
Not eligible

Age:
  ✗ Maximum permitted age after applicable relaxation: 30
  ✗ User age: 34
```

**For `needs_verification`, the explanation names exactly which dimension(s) are unresolved and why**, e.g.:

```
Needs verification

State/Domicile:
  ? This post requires domicile in a specific state, but your domicile
    state is not set in your profile.

Age:
  ✓ User age: 26
  ✓ Required age: 21–30
```

The explanation always shows every dimension that was evaluated (not just the failing/unclear one), so a user can see the full picture — this matches the dashboard/job-detail requirements in PRD.md §11–§12. Dimensions that passed trivially because no rule existed for them (§3) are shown as passing with a reason like "No restriction for this post," so the explanation is complete and never silently omits a dimension.

---

## 16. Versioning and Testability

**Versionable:** every eligibility evaluation is reproducible given (a) the specific `job_post_id`'s rule rows *as they existed at evaluation time* and (b) the specific profile's field values at that time. Because job rules can change (DATABASE.md §21, `job_history`) and profiles can change, the engine itself does not need its own separate "rule version" concept for MVP (contrast with the *optional future* `eligibility_results.rules_version` cache field noted in DATABASE.md §19) — reproducibility comes from the fact that both inputs are already timestamped/audited at the data layer. If a persisted eligibility cache is introduced later, it is invalidated exactly on the triggers DATABASE.md §19 already lists (profile change, rule change, status change) — no new engine-side versioning scheme is required beyond that.

**Testable:** because this is pure, deterministic domain logic taking two structured inputs and returning a structured output, it must be developed with automated unit tests per dimension (age boundary cases including leap years and exact-birthday cases from §5; each stacking mode from §7; each state/domicile scope type from §10; each gender/experience/qualification branch from §11–§13) before any change to this logic ships, per CLAUDE.md's "write tests before changing complex eligibility logic." Test cases should be derived directly from the worked examples and tables in this document, and this document should be updated first if a new case is discovered that isn't already covered here — the spec and the tests should never diverge silently.

**Known schema gaps this document identifies** (for `docs/DATABASE.md` to incorporate before full implementation):
1. A `statuses` reference table + `profile_statuses` join table (§8).
2. A `relaxation_combination_mode` field on the per-post relaxation configuration, and a `job_status_relaxations` table (or widened `job_category_relaxations`) keyed by status as well as category (§7, §8).
3. A representation for status-*gated* (not just status-relaxed) eligibility, if/when a real notification requires it (§8, §14).
4. A confidence/review-status signal on `job_qualification_requirements` rows analogous to the `is_confident`/`parse_note` pattern already used on the age/category/state/experience rule tables (§13 point 8) — currently absent from that table in DATABASE.md §7.

These are documented as requirements on the schema, not implemented here, per this task's constraints.

---

## 17. Summary

**Core model:** the engine is a pure, deterministic function — profile + structured per-post rules + cutoff dates → one of `eligible` / `not_eligible` / `needs_verification`, plus a full per-dimension explanation. AI never participates in the final decision; it only ever produces the structured rules this engine reads, after passing through review.

**Six evaluated dimensions**, AND'd together: age (with category/status relaxation resolved via an explicit, non-guessed combination mode — additive, max-of, or unsupported), state/domicile (current vs. domicile state kept strictly distinct), gender, experience (numeric only — domain-specific experience always routes to `needs_verification`), and qualification (AND-of-OR groups, generic vs. specific requirement matching).

**Conservative-by-default:** any missing profile field a rule actually needs, any low-confidence extracted rule, any unmodeled condition, or any ambiguous relaxation-stacking situation produces `needs_verification` rather than a guessed answer — with the single deliberate exception that a definite failure on one dimension is reported as `not_eligible` even if another, unrelated dimension is separately ambiguous, since that doesn't require assuming anything.

**Two schema gaps identified and required, but not yet built:** a composable status model (`statuses`/`profile_statuses`, distinct from the single-valued reservation `category_id`) and a relaxation-combination-mode field, both needed before category+status stacking (OBC+PwBD, etc.) can be evaluated correctly — DATABASE.md must be revised to add these before this engine is implemented. Until that revision lands, any job post that actually needs multi-status stacking must be treated by the engine as `needs_verification`.
