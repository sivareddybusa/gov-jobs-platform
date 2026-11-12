"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/auth/action-state";
import { initialActionState } from "@/lib/auth/action-state";
import { InputField, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { SOURCE_TYPE_VALUES } from "@/lib/validation/admin";

const SOURCE_TYPE_LABELS: Record<(typeof SOURCE_TYPE_VALUES)[number], string> = {
  official_website: "Official website",
  official_portal: "Official portal",
  official_pdf: "Official PDF",
  api: "API",
  manual_admin_entry: "Manual admin entry",
};

export function SourceForm({
  action,
  organizations,
  defaultValues,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  organizations: Array<{ id: string; name: string }>;
  defaultValues?: {
    organizationId: string;
    name: string;
    officialDomain: string;
    sourceType: string;
    sourceUrl: string;
  };
}) {
  const [state, formAction] = useActionState(action, initialActionState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <SelectField
        id="organizationId"
        name="organizationId"
        label="Organization (optional)"
        placeholder="Not tied to one organization"
        options={organizations.map((o) => ({ value: o.id, label: o.name }))}
        defaultValue={defaultValues?.organizationId}
      />
      <InputField id="name" name="name" label="Name" required defaultValue={defaultValues?.name} />
      <InputField
        id="officialDomain"
        name="officialDomain"
        label="Official domain (e.g. ssc.nic.in)"
        required
        defaultValue={defaultValues?.officialDomain}
      />
      <SelectField
        id="sourceType"
        name="sourceType"
        label="Source type"
        placeholder="Select a type"
        options={SOURCE_TYPE_VALUES.map((v) => ({ value: v, label: SOURCE_TYPE_LABELS[v] }))}
        defaultValue={defaultValues?.sourceType}
        required
      />
      <InputField
        id="sourceUrl"
        name="sourceUrl"
        label="Source URL"
        type="url"
        required
        defaultValue={defaultValues?.sourceUrl}
      />
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
