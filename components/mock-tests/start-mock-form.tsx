"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/auth/action-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { startMockAction } from "@/app/(protected)/mock-tests/actions";

export function StartMockForm({ examId, label }: { examId: string; label: string }) {
  const [state, formAction] = useActionState(startMockAction, initialActionState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="examId" value={examId} />
      <SubmitButton pendingLabel="Starting…" fullWidth={false} className="px-4 py-2">
        {label}
      </SubmitButton>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Something went wrong."} />
      ) : null}
    </form>
  );
}
