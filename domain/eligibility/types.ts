// Pure domain types for the eligibility engine (docs/ELIGIBILITY_ENGINE.md,
// CLAUDE.md's eligibility rules). This module has no dependency on React,
// Next.js, Supabase, or any I/O — it is a pure function of plain data,
// shaped by the caller (services/eligibility) from database rows.

export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

export type RelaxationCombinationMode =
  "additive" | "max_of" | "mutually_exclusive" | "unsupported";

export type StateScopeType = "all_india" | "specific_states" | "domicile_required";

export type StatusRequirementType = "required" | "optional" | "preference";

export type QualificationVerificationStatus =
  "verified" | "ai_extracted" | "ambiguous" | "unsupported";

/** ISO "YYYY-MM-DD" date strings only — never a Date object (timezone-free by construction). */
export type IsoDate = string;

export type EligibilityProfile = {
  dateOfBirth: IsoDate | null;
  categoryId: string | null;
  /** Zero or more independently-held special statuses (DATABASE.md §5A) — never merged into categoryId. */
  statusIds: string[];
  stateId: string | null;
  domicileStateId: string | null;
  gender: Gender | null;
  experienceYears: number | null;
  /** The user's own qualification rows, each carrying its qualification's education-level rank for generic matching. */
  qualifications: Array<{ qualificationId: string; educationLevelRank: number }>;
  /** The user's own highest education level rank, if set independent of a specific qualification row. */
  educationLevelRank: number | null;
};

export type AgeRule = {
  minAge: number | null;
  maxAge: number | null;
  ageCutoffDate: IsoDate;
  relaxationCombinationMode: RelaxationCombinationMode;
  isConfident: boolean;
};

export type Relaxation = {
  /** Exactly one of categoryId/statusId is set (mirrors the job_relaxations CHECK constraint). */
  categoryId: string | null;
  statusId: string | null;
  ageRelaxationYears: number;
  isConfident: boolean;
};

export type StatusRequirement = {
  statusId: string;
  requirementType: StatusRequirementType;
  isConfident: boolean;
};

export type StateScope = {
  scopeType: StateScopeType;
  /** Only meaningful for specific_states/domicile_required. */
  stateIds: string[];
};

export type GenderRule = {
  allowedGender: "all" | "male" | "female" | "other";
};

export type ExperienceRule = {
  minYears: number | null;
  maxYears: number | null;
  domainNote: string | null;
  isConfident: boolean;
};

export type QualificationRequirement = {
  groupId: number;
  /** A specific qualification row, or null for a bare education-level-only group member. */
  qualificationId: string | null;
  isGeneric: boolean;
  /** Required for a bare education-level requirement (qualificationId null) or a generic qualification's minimum rank. */
  requiredEducationLevelRank: number | null;
  verificationStatus: QualificationVerificationStatus;
};

export type JobEligibilityRules = {
  ageRule: AgeRule | null;
  relaxations: Relaxation[];
  statusRequirements: StatusRequirement[];
  stateScope: StateScope | null;
  genderRule: GenderRule | null;
  experienceRule: ExperienceRule | null;
  qualificationRequirements: QualificationRequirement[];
};

export type DimensionKey =
  "age" | "status" | "state_domicile" | "gender" | "experience" | "qualification";

export type DimensionOutcome = "pass" | "fail" | "unknown";

export type DimensionResult = {
  dimension: DimensionKey;
  outcome: DimensionOutcome;
  reasons: string[];
};

export type EligibilityStatus = "eligible" | "not_eligible" | "needs_verification";

export type EligibilityResult = {
  status: EligibilityStatus;
  dimensions: DimensionResult[];
};
