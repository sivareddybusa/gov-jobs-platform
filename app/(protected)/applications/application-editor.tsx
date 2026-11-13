"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/auth/action-state";
import { InputField, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { APPLICATION_STATUSES, APPLICATION_STATUS_LABELS } from "@/domain/applications";
import { updateApplicationAction, removeApplicationAction } from "./actions";

export function ApplicationEditor({
  applicationId,
  status,
  appliedOn,
  applicationNumber,
  notes,
}: {
  applicationId: string;
  status: string;
  appliedOn: string | null;
  applicationNumber: string | null;
  notes: string | null;
}) {
  const [state, formAction] = useActionState(updateApplicationAction, initialActionState);
  const [removeState, removeAction] = useActionState(removeApplicationAction, initialActionState);

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <input type="hidden" name="applicationId" value={applicationId} />
        <SelectField
          id={`status-${applicationId}`}
          name="status"
          label="Status"
          defaultValue={status}
          options={APPLICATION_STATUSES.map((s) => ({
            value: s,
            label: APPLICATION_STATUS_LABELS[s],
          }))}
        />
        <InputField
          id={`appliedOn-${applicationId}`}
          name="appliedOn"
          type="date"
          label="Applied on"
          defaultValue={appliedOn ?? ""}
        />
        <InputField
          id={`applicationNumber-${applicationId}`}
          name="applicationNumber"
          label="Application / registration number"
          maxLength={100}
          defaultValue={applicationNumber ?? ""}
        />
        <InputField
          id={`notes-${applicationId}`}
          name="notes"
          label="Notes"
          maxLength={2000}
          defaultValue={notes ?? ""}
        />
        <div className="flex flex-col gap-2 sm:col-span-2">
          {state.status === "error" ? (
            <FormMessage status="error" message={state.message ?? "Something went wrong."} />
          ) : null}
          {state.status === "success" ? (
            <FormMessage status="success" message={state.message ?? "Saved."} />
          ) : null}
          <SubmitButton pendingLabel="Saving…" fullWidth={false} className="self-start px-5">
            Save changes
          </SubmitButton>
        </div>
      </form>
      <form action={removeAction}>
        <input type="hidden" name="applicationId" value={applicationId} />
        {removeState.status === "error" ? (
          <FormMessage status="error" message={removeState.message ?? "Could not remove."} />
        ) : null}
        <SubmitButton
          variant="ghost"
          pendingLabel="Removing…"
          fullWidth={false}
          className="px-3 py-1.5 text-xs text-red-600"
        >
          Stop tracking
        </SubmitButton>
      </form>
    </div>
  );
}
