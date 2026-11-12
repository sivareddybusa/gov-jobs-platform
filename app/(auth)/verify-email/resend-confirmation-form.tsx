"use client";

import { useActionState } from "react";
import { resendConfirmationAction } from "./actions";
import { initialActionState } from "@/lib/auth/action-state";
import { InputField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";

export function ResendConfirmationForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, formAction] = useActionState(resendConfirmationAction, initialActionState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <InputField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        defaultValue={defaultEmail}
        error={state.fieldErrors?.["email"]?.[0]}
        required
      />
      {state.status !== "idle" && state.message ? (
        <FormMessage
          status={state.status === "success" ? "success" : "error"}
          message={state.message}
        />
      ) : null}
      <SubmitButton pendingLabel="Sending…">Resend confirmation email</SubmitButton>
    </form>
  );
}
