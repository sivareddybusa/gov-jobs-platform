"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/auth/action-state";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { startPreparingAction } from "./actions";

export function StartPreparingForm({ examId }: { examId: string }) {
  const [state, formAction] = useActionState(startPreparingAction, initialActionState);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="examId" value={examId} />
      <SubmitButton pendingLabel="Adding…" fullWidth={false} className="px-4 py-2">
        Start preparing
      </SubmitButton>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Something went wrong."} />
      ) : null}
    </form>
  );
}
