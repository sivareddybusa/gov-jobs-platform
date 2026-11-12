"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/auth/action-state";
import { initialActionState } from "@/lib/auth/action-state";
import { InputField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";

export function JobPostForm({
  action,
  defaultValues,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  defaultValues?: {
    title: string;
    vacancyCount: string;
    payScaleMin: string;
    payScaleMax: string;
    payScaleNote: string;
  };
}) {
  const [state, formAction] = useActionState(action, initialActionState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <InputField
        id="title"
        name="title"
        label="Post title"
        required
        defaultValue={defaultValues?.title}
      />
      <InputField
        id="vacancyCount"
        name="vacancyCount"
        label="Vacancy count (optional)"
        type="number"
        min={0}
        defaultValue={defaultValues?.vacancyCount}
      />
      <InputField
        id="payScaleMin"
        name="payScaleMin"
        label="Pay scale minimum (optional)"
        type="number"
        min={0}
        defaultValue={defaultValues?.payScaleMin}
      />
      <InputField
        id="payScaleMax"
        name="payScaleMax"
        label="Pay scale maximum (optional)"
        type="number"
        min={0}
        defaultValue={defaultValues?.payScaleMax}
      />
      <InputField
        id="payScaleNote"
        name="payScaleNote"
        label="Pay scale note (optional)"
        defaultValue={defaultValues?.payScaleNote}
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
