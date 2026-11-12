"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/auth/action-state";
import { InputField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { addDepartmentAction } from "../actions";

export function DepartmentForm({ organizationId }: { organizationId: string }) {
  const [state, formAction] = useActionState(addDepartmentAction, initialActionState);

  return (
    <form action={formAction} className="flex items-end gap-2">
      <input type="hidden" name="organizationId" value={organizationId} />
      <div className="flex-1">
        <InputField id="name" name="name" label="Add department" required />
      </div>
      <SubmitButton pendingLabel="Adding…" fullWidth={false}>
        Add
      </SubmitButton>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Error"} />
      ) : null}
    </form>
  );
}
