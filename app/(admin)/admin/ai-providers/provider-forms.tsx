"use client";

import { useActionState, useEffect, useRef } from "react";
import { initialActionState } from "@/lib/auth/action-state";
import { Button } from "@/components/ui/button";
import { InputField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { addLlmKeyAction, llmKeyAction } from "./actions";

export function AddKeyForm({
  provider,
  defaultModel,
  needsAccountId,
  disabled,
}: {
  provider: string;
  defaultModel: string;
  needsAccountId: boolean;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState(addLlmKeyAction, initialActionState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="provider" value={provider} />
      <InputField
        id={`label-${provider}`}
        name="label"
        label="Name for this key"
        placeholder="e.g. Production key"
        required
        error={state.fieldErrors?.["label"]?.[0]}
      />
      {needsAccountId ? (
        <InputField
          id={`accountId-${provider}`}
          name="accountId"
          label="Account ID"
          placeholder="32-character Cloudflare account ID"
          autoComplete="off"
          required
          error={state.fieldErrors?.["accountId"]?.[0]}
        />
      ) : null}
      <InputField
        id={`apiKey-${provider}`}
        name="apiKey"
        type="password"
        label="API key"
        autoComplete="off"
        required
        error={state.fieldErrors?.["apiKey"]?.[0]}
      />
      <InputField
        id={`model-${provider}`}
        name="model"
        label="Model (optional)"
        placeholder={defaultModel}
        autoComplete="off"
        error={state.fieldErrors?.["model"]?.[0]}
      />
      <Button type="submit" fullWidth={false} disabled={disabled || pending} className="self-start">
        {pending ? "Saving…" : "Add key"}
      </Button>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Could not save."} />
      ) : null}
      {state.status === "success" ? (
        <FormMessage status="success" message={state.message ?? "Saved."} />
      ) : null}
    </form>
  );
}

export function KeyActions({ id, isActive }: { id: string; isActive: boolean }) {
  const [state, formAction, pending] = useActionState(llmKeyAction, initialActionState);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {!isActive ? (
          <form action={formAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="action" value="use" />
            <Button
              type="submit"
              fullWidth={false}
              disabled={pending}
              className="px-3 py-1.5 text-xs"
            >
              Use
            </Button>
          </form>
        ) : null}
        <form action={formAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="action" value="remove" />
          <Button
            type="submit"
            variant="secondary"
            fullWidth={false}
            disabled={pending}
            className="px-3 py-1.5 text-xs"
          >
            Remove
          </Button>
        </form>
      </div>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Failed."} />
      ) : null}
    </div>
  );
}
