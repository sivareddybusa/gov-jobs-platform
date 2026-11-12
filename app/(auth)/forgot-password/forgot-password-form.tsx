"use client";

import { useActionState } from "react";
import { requestPasswordResetAction } from "./actions";
import { initialActionState } from "@/lib/auth/action-state";
import { InputField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(requestPasswordResetAction, initialActionState);

  if (state.status === "success" && state.message) {
    return <FormMessage status="success" message={state.message} />;
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <InputField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        error={state.fieldErrors?.["email"]?.[0]}
        required
      />
      {state.status === "error" && state.message ? (
        <FormMessage status="error" message={state.message} />
      ) : null}
      <SubmitButton pendingLabel="Sending…">Send reset link</SubmitButton>
    </form>
  );
}
