"use client";

import { useActionState, useState } from "react";
import { initialActionState } from "@/lib/auth/action-state";
import { InputField, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { RECRUITMENT_TYPE_VALUES, RELAXATION_MODE_VALUES } from "@/lib/validation/admin";
import type { JobExtraction } from "@/lib/validation/ingestion";
import { approveImportAction, rejectImportAction } from "../actions";

const RECRUITMENT_TYPE_LABELS: Record<(typeof RECRUITMENT_TYPE_VALUES)[number], string> = {
  direct: "Direct recruitment",
  promotion: "Promotion",
  contract: "Contract",
  deputation: "Deputation",
  other: "Other",
};

const RELAXATION_MODE_LABELS: Record<(typeof RELAXATION_MODE_VALUES)[number], string> = {
  additive: "Additive",
  max_of: "Max of applicable",
  mutually_exclusive: "Mutually exclusive",
  unsupported: "Unsupported / needs review",
};

export function ReviewForm({
  importId,
  extraction,
  organizations,
  departments,
  sources,
}: {
  importId: string;
  extraction: JobExtraction;
  organizations: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  sources: Array<{ id: string; name: string }>;
}) {
  const boundApprove = approveImportAction.bind(null, importId);
  const boundReject = rejectImportAction.bind(null, importId);
  const [approveState, approveAction] = useActionState(boundApprove, initialActionState);
  const [rejectState, rejectAction] = useActionState(boundReject, initialActionState);
  const [includeAgeRule, setIncludeAgeRule] = useState(extraction.ageRule !== null);
  const fieldError = (name: string) => approveState.fieldErrors?.[name]?.[0];

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
          <span className="inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-xs">
            AI-extracted
          </span>
          Unverified — confirm every field below
        </h2>
        <dl className="grid grid-cols-1 gap-2 text-xs text-amber-900 sm:grid-cols-2">
          <div>
            <dt className="font-medium">Organization (as read)</dt>
            <dd>{extraction.organizationNameText}</dd>
          </div>
          <div>
            <dt className="font-medium">Department (as read)</dt>
            <dd>{extraction.departmentNameText ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium">State scope (as read)</dt>
            <dd>{extraction.stateScopeText ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium">Gender guess</dt>
            <dd>{extraction.genderGuess ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-medium">Experience (as read)</dt>
            <dd>
              {extraction.experienceMinYears ?? "?"}–{extraction.experienceMaxYears ?? "?"} yrs
              {extraction.experienceDomainNoteText
                ? ` — ${extraction.experienceDomainNoteText}`
                : ""}
            </dd>
          </div>
          <div>
            <dt className="font-medium">Advertisement URL (as read, unverified)</dt>
            <dd className="break-all">{extraction.officialAdvertisementUrlText ?? "—"}</dd>
          </div>
        </dl>
        {extraction.relaxations.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-medium text-amber-900">Relaxations (as read)</p>
            <ul className="text-xs text-amber-900">
              {extraction.relaxations.map((r, idx) => (
                <li key={idx}>
                  {r.labelText}: +{r.ageRelaxationYears} yrs
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {extraction.qualificationGroups.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs font-medium text-amber-900">Qualification groups (as read)</p>
            <ul className="text-xs text-amber-900">
              {extraction.qualificationGroups.map((q, idx) => (
                <li key={idx}>{q.descriptionText}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {extraction.extractionNotes ? (
          <p className="mt-3 text-xs text-amber-900">
            <span className="font-medium">Model notes: </span>
            {extraction.extractionNotes}
          </p>
        ) : null}
        <p className="mt-3 text-xs text-amber-800">
          Relaxations, qualification groups, state scope, gender, and experience rules are not
          created automatically — after approving, finish them on the job post&apos;s own rules
          editor using this text as reference.
        </p>
      </div>

      <form
        action={approveAction}
        className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-card)]"
      >
        <h2 className="text-sm font-semibold text-gray-900">Confirm and approve</h2>
        <SelectField
          id="organizationId"
          name="organizationId"
          label="Organization"
          placeholder="Select an organization"
          options={organizations.map((o) => ({ value: o.id, label: o.name }))}
          error={fieldError("organizationId")}
          required
        />
        <SelectField
          id="departmentId"
          name="departmentId"
          label="Department (optional)"
          placeholder="Not applicable"
          options={departments.map((d) => ({ value: d.id, label: d.name }))}
          error={fieldError("departmentId")}
        />
        <SelectField
          id="sourceId"
          name="sourceId"
          label="Source"
          placeholder="Select a source"
          options={sources.map((s) => ({ value: s.id, label: s.name }))}
          error={fieldError("sourceId")}
          required
        />
        <InputField
          id="title"
          name="title"
          label="Title"
          required
          defaultValue={extraction.title}
          error={fieldError("title")}
        />
        <SelectField
          id="recruitmentType"
          name="recruitmentType"
          label="Recruitment type"
          placeholder="Select a type"
          options={RECRUITMENT_TYPE_VALUES.map((v) => ({
            value: v,
            label: RECRUITMENT_TYPE_LABELS[v],
          }))}
          defaultValue={extraction.recruitmentTypeGuess ?? undefined}
          error={fieldError("recruitmentType")}
          required
        />
        <InputField
          id="officialAdvertisementUrl"
          name="officialAdvertisementUrl"
          label="Official advertisement URL (verify — never trust the AI-read text)"
          type="url"
          required
          error={fieldError("officialAdvertisementUrl")}
        />
        <InputField
          id="officialApplicationUrl"
          name="officialApplicationUrl"
          label="Official application URL (optional, verify)"
          type="url"
          error={fieldError("officialApplicationUrl")}
        />
        <InputField
          id="notificationDate"
          name="notificationDate"
          label="Notification date"
          type="date"
          required
          defaultValue={extraction.notificationDate ?? undefined}
          error={fieldError("notificationDate")}
        />
        <InputField
          id="applicationStartDate"
          name="applicationStartDate"
          label="Application start date (optional)"
          type="date"
          defaultValue={extraction.applicationStartDate ?? undefined}
          error={fieldError("applicationStartDate")}
        />
        <InputField
          id="applicationEndDate"
          name="applicationEndDate"
          label="Application end date (optional)"
          type="date"
          defaultValue={extraction.applicationEndDate ?? undefined}
          error={fieldError("applicationEndDate")}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="description" className="text-sm font-medium text-gray-700">
            Description (optional)
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            defaultValue={extraction.description ?? undefined}
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/40"
          />
        </div>

        <h3 className="mt-2 text-sm font-semibold text-gray-900">Primary post</h3>
        <InputField
          id="postTitle"
          name="postTitle"
          label="Post title"
          required
          defaultValue={extraction.posts[0]?.title ?? extraction.title}
          error={fieldError("postTitle")}
        />
        <InputField
          id="vacancyCount"
          name="vacancyCount"
          label="Vacancy count (optional)"
          type="number"
          min={0}
          defaultValue={extraction.posts[0]?.vacancyCount ?? undefined}
          error={fieldError("vacancyCount")}
        />
        <InputField
          id="payScaleMin"
          name="payScaleMin"
          label="Pay scale minimum (optional)"
          type="number"
          min={0}
          error={fieldError("payScaleMin")}
        />
        <InputField
          id="payScaleMax"
          name="payScaleMax"
          label="Pay scale maximum (optional)"
          type="number"
          min={0}
          error={fieldError("payScaleMax")}
        />

        <label className="flex items-center gap-2 text-sm font-medium text-gray-900">
          <input
            type="checkbox"
            name="includeAgeRule"
            checked={includeAgeRule}
            onChange={(e) => setIncludeAgeRule(e.target.checked)}
          />
          Create an age rule now
        </label>
        {includeAgeRule ? (
          <div className="flex flex-col gap-4 rounded-lg border border-gray-200 p-4">
            <InputField
              id="minAge"
              name="minAge"
              label="Minimum age (optional)"
              type="number"
              min={0}
              max={100}
              defaultValue={extraction.ageRule?.minAge ?? undefined}
              error={fieldError("minAge")}
            />
            <InputField
              id="maxAge"
              name="maxAge"
              label="Maximum age (optional)"
              type="number"
              min={0}
              max={100}
              defaultValue={extraction.ageRule?.maxAge ?? undefined}
              error={fieldError("maxAge")}
            />
            <InputField
              id="ageCutoffDate"
              name="ageCutoffDate"
              label="Age cutoff date"
              type="date"
              required={includeAgeRule}
              defaultValue={extraction.ageRule?.ageCutoffDate ?? undefined}
              error={fieldError("ageCutoffDate")}
            />
            <SelectField
              id="relaxationCombinationMode"
              name="relaxationCombinationMode"
              label="Relaxation combination mode"
              placeholder="Select a mode"
              options={RELAXATION_MODE_VALUES.map((v) => ({
                value: v,
                label: RELAXATION_MODE_LABELS[v],
              }))}
              error={fieldError("relaxationCombinationMode")}
              required={includeAgeRule}
            />
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reviewNotes" className="text-sm font-medium text-gray-700">
            Review notes (optional)
          </label>
          <textarea
            id="reviewNotes"
            name="reviewNotes"
            rows={2}
            className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/40"
          />
        </div>

        {approveState.status === "error" ? (
          <FormMessage status="error" message={approveState.message ?? "Something went wrong."} />
        ) : null}
        <SubmitButton pendingLabel="Approving…">Approve and create notification</SubmitButton>
      </form>

      <form
        action={rejectAction}
        className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-card)]"
      >
        <h2 className="text-sm font-semibold text-gray-900">Reject this import</h2>
        <textarea
          id="rejectReviewNotes"
          name="reviewNotes"
          rows={2}
          placeholder="Why is this being rejected? (optional)"
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/40"
        />
        {rejectState.status === "error" ? (
          <FormMessage status="error" message={rejectState.message ?? "Something went wrong."} />
        ) : null}
        <SubmitButton pendingLabel="Rejecting…" variant="secondary">
          Reject
        </SubmitButton>
      </form>
    </div>
  );
}
