"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/auth/action-state";
import { initialActionState } from "@/lib/auth/action-state";
import { InputField, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { RECRUITMENT_TYPE_VALUES } from "@/lib/validation/admin";

const RECRUITMENT_TYPE_LABELS: Record<(typeof RECRUITMENT_TYPE_VALUES)[number], string> = {
  direct: "Direct recruitment",
  promotion: "Promotion",
  contract: "Contract",
  deputation: "Deputation",
  other: "Other",
};

export function JobNotificationForm({
  action,
  organizations,
  departments,
  sources,
  defaultValues,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  organizations: Array<{ id: string; name: string }>;
  departments: Array<{ id: string; name: string }>;
  sources: Array<{ id: string; name: string }>;
  defaultValues?: {
    organizationId: string;
    departmentId: string;
    sourceId: string;
    title: string;
    description: string;
    recruitmentType: string;
    officialAdvertisementUrl: string;
    officialApplicationUrl: string;
    notificationDate: string;
    applicationStartDate: string;
    applicationEndDate: string;
  };
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <SelectField
        id="organizationId"
        name="organizationId"
        label="Organization"
        placeholder="Select an organization"
        options={organizations.map((o) => ({ value: o.id, label: o.name }))}
        defaultValue={defaultValues?.organizationId}
        error={fieldError("organizationId")}
        required
      />
      <SelectField
        id="departmentId"
        name="departmentId"
        label="Department (optional)"
        placeholder="Not applicable"
        options={departments.map((d) => ({ value: d.id, label: d.name }))}
        defaultValue={defaultValues?.departmentId}
        error={fieldError("departmentId")}
      />
      <SelectField
        id="sourceId"
        name="sourceId"
        label="Source"
        placeholder="Select a source"
        options={sources.map((s) => ({ value: s.id, label: s.name }))}
        defaultValue={defaultValues?.sourceId}
        error={fieldError("sourceId")}
        required
      />
      <InputField
        id="title"
        name="title"
        label="Title"
        required
        defaultValue={defaultValues?.title}
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
        defaultValue={defaultValues?.recruitmentType}
        error={fieldError("recruitmentType")}
        required
      />
      <InputField
        id="officialAdvertisementUrl"
        name="officialAdvertisementUrl"
        label="Official advertisement URL"
        type="url"
        required
        defaultValue={defaultValues?.officialAdvertisementUrl}
        error={fieldError("officialAdvertisementUrl")}
      />
      <InputField
        id="officialApplicationUrl"
        name="officialApplicationUrl"
        label="Official application URL (optional)"
        type="url"
        defaultValue={defaultValues?.officialApplicationUrl}
        error={fieldError("officialApplicationUrl")}
      />
      <InputField
        id="notificationDate"
        name="notificationDate"
        label="Notification date"
        type="date"
        required
        defaultValue={defaultValues?.notificationDate}
        error={fieldError("notificationDate")}
      />
      <InputField
        id="applicationStartDate"
        name="applicationStartDate"
        label="Application start date (optional)"
        type="date"
        defaultValue={defaultValues?.applicationStartDate}
        error={fieldError("applicationStartDate")}
      />
      <InputField
        id="applicationEndDate"
        name="applicationEndDate"
        label="Application end date (optional)"
        type="date"
        defaultValue={defaultValues?.applicationEndDate}
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
          defaultValue={defaultValues?.description}
          className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-brand-500 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/40"
        />
      </div>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Something went wrong."} />
      ) : null}
      {state.status === "success" ? (
        <FormMessage status="success" message={state.message ?? "Saved."} />
      ) : null}
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
    </form>
  );
}
