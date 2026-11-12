"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/auth/action-state";
import { initialActionState } from "@/lib/auth/action-state";
import { InputField, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { Card } from "@/components/ui/card";
import {
  RELAXATION_MODE_VALUES,
  STATUS_REQUIREMENT_TYPE_VALUES,
  STATE_SCOPE_TYPE_VALUES,
  GENDER_RULE_VALUES,
  QUALIFICATION_VERIFICATION_STATUS_VALUES,
} from "@/lib/validation/admin";
import {
  saveAgeRuleAction,
  addRelaxationAction,
  removeRelaxationAction,
  addStatusRequirementAction,
  removeStatusRequirementAction,
  saveStateScopeAction,
  addStateScopeStateAction,
  removeStateScopeStateAction,
  saveGenderRuleAction,
  saveExperienceRuleAction,
  addQualificationRequirementAction,
  removeQualificationRequirementAction,
} from "./rules-actions";

type Option = { id: string; name: string };

function RemoveButton({
  action,
  id,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  id: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        pendingLabel="…"
        variant="secondary"
        fullWidth={false}
        className="px-2 py-0.5 text-xs"
      >
        Remove
      </SubmitButton>
      {state.status === "error" ? (
        <span className="ml-2 text-xs text-red-600">{state.message}</span>
      ) : null}
    </form>
  );
}

export function AgeRuleForm({
  jobNotificationId,
  postId,
  defaultValues,
}: {
  jobNotificationId: string;
  postId: string;
  defaultValues?:
    | { minAge: string; maxAge: string; ageCutoffDate: string; relaxationCombinationMode: string }
    | undefined;
}) {
  const boundAction = saveAgeRuleAction.bind(null, jobNotificationId, postId);
  const [state, formAction] = useActionState(boundAction, initialActionState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <div className="grid grid-cols-2 gap-3">
        <InputField
          id="minAge"
          name="minAge"
          label="Min age"
          type="number"
          min={0}
          defaultValue={defaultValues?.minAge}
        />
        <InputField
          id="maxAge"
          name="maxAge"
          label="Max age"
          type="number"
          min={0}
          defaultValue={defaultValues?.maxAge}
        />
      </div>
      <InputField
        id="ageCutoffDate"
        name="ageCutoffDate"
        label="Age cutoff date"
        type="date"
        required
        defaultValue={defaultValues?.ageCutoffDate}
      />
      <SelectField
        id="relaxationCombinationMode"
        name="relaxationCombinationMode"
        label="Relaxation combination mode"
        options={RELAXATION_MODE_VALUES.map((v) => ({ value: v, label: v }))}
        defaultValue={defaultValues?.relaxationCombinationMode ?? "unsupported"}
        required
      />
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Error"} />
      ) : null}
      {state.status === "success" ? (
        <FormMessage status="success" message={state.message ?? "Saved"} />
      ) : null}
      <SubmitButton pendingLabel="Saving…" fullWidth={false}>
        Save age rule
      </SubmitButton>
    </form>
  );
}

export function RelaxationsSection({
  jobNotificationId,
  postId,
  relaxations,
  categories,
  statuses,
}: {
  jobNotificationId: string;
  postId: string;
  relaxations: Array<{
    id: string;
    age_relaxation_years: number;
    categories: { name: string } | null;
    statuses: { name: string } | null;
  }>;
  categories: Option[];
  statuses: Option[];
}) {
  const boundAdd = addRelaxationAction.bind(null, jobNotificationId, postId);
  const boundRemove = removeRelaxationAction.bind(null, jobNotificationId, postId);
  const [state, formAction] = useActionState(boundAdd, initialActionState);

  return (
    <Card className="flex flex-col gap-3">
      {relaxations.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {relaxations.map((r) => (
            <li key={r.id} className="flex items-center justify-between">
              <span>
                {r.categories?.name ?? r.statuses?.name ?? "unknown"}: +{r.age_relaxation_years}{" "}
                years
              </span>
              <RemoveButton action={boundRemove} id={r.id} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">No relaxations yet.</p>
      )}
      <form action={formAction} className="grid grid-cols-3 items-end gap-2">
        <SelectField
          id="categoryId"
          name="categoryId"
          label="Category"
          placeholder="—"
          options={categories.map((c) => ({ value: c.id, label: c.name }))}
        />
        <SelectField
          id="statusId"
          name="statusId"
          label="Status"
          placeholder="—"
          options={statuses.map((s) => ({ value: s.id, label: s.name }))}
        />
        <InputField
          id="ageRelaxationYears"
          name="ageRelaxationYears"
          label="Years"
          type="number"
          min={0}
          required
        />
        <SubmitButton pendingLabel="Adding…" fullWidth={false} className="col-span-3">
          Add relaxation
        </SubmitButton>
      </form>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Error"} />
      ) : null}
    </Card>
  );
}

export function StatusRequirementsSection({
  jobNotificationId,
  postId,
  requirements,
  statuses,
}: {
  jobNotificationId: string;
  postId: string;
  requirements: Array<{ id: string; requirement_type: string; statuses: { name: string } | null }>;
  statuses: Option[];
}) {
  const boundAdd = addStatusRequirementAction.bind(null, jobNotificationId, postId);
  const boundRemove = removeStatusRequirementAction.bind(null, jobNotificationId, postId);
  const [state, formAction] = useActionState(boundAdd, initialActionState);

  return (
    <Card className="flex flex-col gap-3">
      {requirements.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {requirements.map((r) => (
            <li key={r.id} className="flex items-center justify-between">
              <span>
                {r.statuses?.name ?? "unknown"} — {r.requirement_type}
              </span>
              <RemoveButton action={boundRemove} id={r.id} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">No status requirements yet.</p>
      )}
      <form action={formAction} className="grid grid-cols-2 items-end gap-2">
        <SelectField
          id="statusId"
          name="statusId"
          label="Status"
          placeholder="Select"
          options={statuses.map((s) => ({ value: s.id, label: s.name }))}
          required
        />
        <SelectField
          id="requirementType"
          name="requirementType"
          label="Requirement type"
          options={STATUS_REQUIREMENT_TYPE_VALUES.map((v) => ({ value: v, label: v }))}
          required
        />
        <SubmitButton pendingLabel="Adding…" fullWidth={false} className="col-span-2">
          Add status requirement
        </SubmitButton>
      </form>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Error"} />
      ) : null}
    </Card>
  );
}

export function StateScopeSection({
  jobNotificationId,
  postId,
  stateScope,
  scopeStates,
  states,
}: {
  jobNotificationId: string;
  postId: string;
  stateScope: { id: string; scope_type: string } | null;
  scopeStates: Array<{ id: string; states: { name: string } | null }>;
  states: Option[];
}) {
  const boundSave = saveStateScopeAction.bind(null, jobNotificationId, postId);
  const boundAddState = addStateScopeStateAction.bind(null, jobNotificationId, postId);
  const boundRemoveState = removeStateScopeStateAction.bind(null, jobNotificationId, postId);
  const [saveState, saveFormAction] = useActionState(boundSave, initialActionState);
  const [addState, addFormAction] = useActionState(boundAddState, initialActionState);

  return (
    <Card className="flex flex-col gap-3">
      <form action={saveFormAction} className="flex items-end gap-2">
        <div className="flex-1">
          <SelectField
            id="scopeType"
            name="scopeType"
            label="Scope type"
            options={STATE_SCOPE_TYPE_VALUES.map((v) => ({ value: v, label: v }))}
            defaultValue={stateScope?.scope_type ?? "all_india"}
            required
          />
        </div>
        <SubmitButton pendingLabel="Saving…" fullWidth={false}>
          Save scope
        </SubmitButton>
      </form>
      {saveState.status === "error" ? (
        <FormMessage status="error" message={saveState.message ?? "Error"} />
      ) : null}

      {stateScope && stateScope.scope_type !== "all_india" ? (
        <>
          {scopeStates.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm">
              {scopeStates.map((s) => (
                <li key={s.id} className="flex items-center justify-between">
                  <span>{s.states?.name}</span>
                  <RemoveButton action={boundRemoveState} id={s.id} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No states listed yet.</p>
          )}
          <form action={addFormAction} className="flex items-end gap-2">
            <input type="hidden" name="jobStateScopeId" value={stateScope.id} />
            <div className="flex-1">
              <SelectField
                id="stateId"
                name="stateId"
                label="Add state"
                placeholder="Select a state"
                options={states.map((s) => ({ value: s.id, label: s.name }))}
                required
              />
            </div>
            <SubmitButton pendingLabel="Adding…" fullWidth={false}>
              Add
            </SubmitButton>
          </form>
          {addState.status === "error" ? (
            <FormMessage status="error" message={addState.message ?? "Error"} />
          ) : null}
        </>
      ) : null}
    </Card>
  );
}

export function GenderRuleForm({
  jobNotificationId,
  postId,
  defaultValue,
}: {
  jobNotificationId: string;
  postId: string;
  defaultValue?: string | undefined;
}) {
  const boundAction = saveGenderRuleAction.bind(null, jobNotificationId, postId);
  const [state, formAction] = useActionState(boundAction, initialActionState);

  return (
    <form
      action={formAction}
      className="flex items-end gap-2 rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <div className="flex-1">
        <SelectField
          id="allowedGender"
          name="allowedGender"
          label="Allowed gender"
          options={GENDER_RULE_VALUES.map((v) => ({ value: v, label: v }))}
          defaultValue={defaultValue ?? "all"}
          required
        />
      </div>
      <SubmitButton pendingLabel="Saving…" fullWidth={false}>
        Save
      </SubmitButton>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Error"} />
      ) : null}
    </form>
  );
}

export function ExperienceRuleForm({
  jobNotificationId,
  postId,
  defaultValues,
}: {
  jobNotificationId: string;
  postId: string;
  defaultValues?:
    { minYears: string; maxYears: string; domainNote: string; asOfDate: string } | undefined;
}) {
  const boundAction = saveExperienceRuleAction.bind(null, jobNotificationId, postId);
  const [state, formAction] = useActionState(boundAction, initialActionState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <div className="grid grid-cols-2 gap-3">
        <InputField
          id="minYears"
          name="minYears"
          label="Min years"
          type="number"
          min={0}
          step="0.5"
          defaultValue={defaultValues?.minYears}
        />
        <InputField
          id="maxYears"
          name="maxYears"
          label="Max years"
          type="number"
          min={0}
          step="0.5"
          defaultValue={defaultValues?.maxYears}
        />
      </div>
      <InputField
        id="domainNote"
        name="domainNote"
        label="Domain-specific note (optional)"
        defaultValue={defaultValues?.domainNote}
      />
      <InputField
        id="asOfDate"
        name="asOfDate"
        label="As-of date (optional)"
        type="date"
        defaultValue={defaultValues?.asOfDate}
      />
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Error"} />
      ) : null}
      {state.status === "success" ? (
        <FormMessage status="success" message={state.message ?? "Saved"} />
      ) : null}
      <SubmitButton pendingLabel="Saving…" fullWidth={false}>
        Save experience rule
      </SubmitButton>
    </form>
  );
}

export function QualificationRequirementsSection({
  jobNotificationId,
  postId,
  requirements,
  qualifications,
  educationLevels,
}: {
  jobNotificationId: string;
  postId: string;
  requirements: Array<{
    id: string;
    group_id: number;
    verification_status: string;
    qualifications: { name: string } | null;
    education_levels: { name: string } | null;
  }>;
  qualifications: Option[];
  educationLevels: Option[];
}) {
  const boundAdd = addQualificationRequirementAction.bind(null, jobNotificationId, postId);
  const boundRemove = removeQualificationRequirementAction.bind(null, jobNotificationId, postId);
  const [state, formAction] = useActionState(boundAdd, initialActionState);

  return (
    <Card className="flex flex-col gap-3">
      {requirements.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {requirements.map((r) => (
            <li key={r.id} className="flex items-center justify-between">
              <span>
                Group {r.group_id}:{" "}
                {r.qualifications?.name ?? r.education_levels?.name ?? "unknown"} (
                {r.verification_status})
              </span>
              <RemoveButton action={boundRemove} id={r.id} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">No qualification requirements yet.</p>
      )}
      <form action={formAction} className="grid grid-cols-2 gap-2">
        <SelectField
          id="qualificationId"
          name="qualificationId"
          label="Qualification"
          placeholder="—"
          options={qualifications.map((q) => ({ value: q.id, label: q.name }))}
        />
        <SelectField
          id="educationLevelId"
          name="educationLevelId"
          label="Or bare education level"
          placeholder="—"
          options={educationLevels.map((e) => ({ value: e.id, label: e.name }))}
        />
        <InputField
          id="groupId"
          name="groupId"
          label="Group (AND across groups)"
          type="number"
          min={1}
          defaultValue="1"
          required
        />
        <SelectField
          id="verificationStatus"
          name="verificationStatus"
          label="Verification status"
          options={QUALIFICATION_VERIFICATION_STATUS_VALUES.map((v) => ({ value: v, label: v }))}
          defaultValue="verified"
          required
        />
        <SubmitButton pendingLabel="Adding…" fullWidth={false} className="col-span-2">
          Add qualification requirement
        </SubmitButton>
      </form>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Error"} />
      ) : null}
    </Card>
  );
}
