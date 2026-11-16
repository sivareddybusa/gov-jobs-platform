"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/auth/action-state";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { runQuestionSyncAction, setQuestionStatusAction } from "./actions";

export function RunQuestionsButton({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = useActionState(
    () => runQuestionSyncAction(),
    initialActionState,
  );
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <Button type="submit" fullWidth={false} disabled={disabled || pending}>
        {pending ? "Generating questions…" : "Generate questions now"}
      </Button>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Failed."} />
      ) : null}
      {state.status === "success" ? (
        <FormMessage status="success" message={state.message ?? "Done."} />
      ) : null}
    </form>
  );
}

export function QuestionStatusButton({
  questionId,
  hidden,
}: {
  questionId: string;
  hidden: boolean;
}) {
  const [state, formAction, pending] = useActionState(setQuestionStatusAction, initialActionState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="status" value={hidden ? "published" : "hidden"} />
      <Button
        type="submit"
        variant="secondary"
        fullWidth={false}
        disabled={pending}
        className="px-3 py-1.5 text-xs"
      >
        {hidden ? "Restore" : "Hide"}
      </Button>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Failed."} />
      ) : null}
    </form>
  );
}
