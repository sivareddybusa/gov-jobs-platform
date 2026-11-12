"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/auth/action-state";
import { initialActionState } from "@/lib/auth/action-state";
import { InputField, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { ORG_TYPE_VALUES } from "@/lib/validation/admin";

const ORG_TYPE_LABELS: Record<(typeof ORG_TYPE_VALUES)[number], string> = {
  central: "Central government",
  state: "State government",
  psu: "Public sector undertaking",
  autonomous_body: "Autonomous body",
  other: "Other",
};

export function OrganizationForm({
  action,
  states,
  defaultValues,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  states: Array<{ id: string; name: string }>;
  defaultValues?: {
    name: string;
    shortCode: string;
    orgType: string;
    stateId: string;
    websiteUrl: string;
  };
}) {
  const [state, formAction] = useActionState(action, initialActionState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <InputField id="name" name="name" label="Name" required defaultValue={defaultValues?.name} />
      <InputField
        id="shortCode"
        name="shortCode"
        label="Short code (optional)"
        defaultValue={defaultValues?.shortCode}
      />
      <SelectField
        id="orgType"
        name="orgType"
        label="Organization type"
        placeholder="Select a type"
        options={ORG_TYPE_VALUES.map((v) => ({ value: v, label: ORG_TYPE_LABELS[v] }))}
        defaultValue={defaultValues?.orgType}
        required
      />
      <SelectField
        id="stateId"
        name="stateId"
        label="State (for state-level bodies)"
        placeholder="Not applicable / central"
        options={states.map((s) => ({ value: s.id, label: s.name }))}
        defaultValue={defaultValues?.stateId}
      />
      <InputField
        id="websiteUrl"
        name="websiteUrl"
        label="Website URL (optional)"
        type="url"
        defaultValue={defaultValues?.websiteUrl}
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
