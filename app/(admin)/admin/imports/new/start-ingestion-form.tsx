"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/auth/action-state";
import { InputField, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { startIngestionAction } from "../actions";

export function StartIngestionForm({ sources }: { sources: Array<{ id: string; name: string }> }) {
  const [state, formAction] = useActionState(startIngestionAction, initialActionState);
  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <SelectField
        id="jobSourceId"
        name="jobSourceId"
        label="Source"
        placeholder="Select a source"
        options={sources.map((s) => ({ value: s.id, label: s.name }))}
        error={fieldError("jobSourceId")}
        required
      />
      <InputField
        id="documentUrl"
        name="documentUrl"
        label="Document URL"
        type="url"
        placeholder="https://…"
        required
        error={fieldError("documentUrl")}
      />
      <p className="text-xs text-gray-500">
        The document is fetched, its text extracted, and sent to the AI for structured extraction.
        Nothing is published — the result goes to review.
      </p>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Something went wrong."} />
      ) : null}
      <SubmitButton pendingLabel="Starting…">Start ingestion</SubmitButton>
    </form>
  );
}
