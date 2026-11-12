"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/auth/action-state";
import { InputField, SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { ADMIN_ROLE_VALUES } from "@/lib/validation/admin";
import { grantRoleAction, revokeRoleAction } from "./actions";

export function GrantRoleForm() {
  const [state, formAction] = useActionState(grantRoleAction, initialActionState);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-card)]"
    >
      <InputField id="userId" name="userId" label="User ID (UUID)" required />
      <SelectField
        id="roleCode"
        name="roleCode"
        label="Role"
        options={ADMIN_ROLE_VALUES.map((v) => ({ value: v, label: v }))}
        required
      />
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Error"} />
      ) : null}
      {state.status === "success" ? (
        <FormMessage status="success" message={state.message ?? "Granted"} />
      ) : null}
      <SubmitButton pendingLabel="Granting…" fullWidth={false}>
        Grant role
      </SubmitButton>
    </form>
  );
}

export function RevokeRoleButton({ id }: { id: string }) {
  const [state, formAction] = useActionState(revokeRoleAction, initialActionState);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        pendingLabel="…"
        variant="secondary"
        fullWidth={false}
        className="px-2 py-0.5 text-xs"
      >
        Revoke
      </SubmitButton>
      {state.status === "error" ? (
        <span className="ml-2 text-xs text-red-600">{state.message}</span>
      ) : null}
    </form>
  );
}
