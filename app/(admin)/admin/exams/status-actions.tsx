"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/auth/action-state";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { runSyncAction, transitionExamAction } from "./actions";

type Action = "publish" | "unpublish" | "archive";
const LABELS: Record<Action, string> = {
  publish: "Restore",
  unpublish: "Unpublish",
  archive: "Block",
};

export function StatusActions({ examId, actions }: { examId: string; actions: Action[] }) {
  const [state, formAction, pending] = useActionState(transitionExamAction, initialActionState);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {actions.map((action) => (
          <form key={action} action={formAction}>
            <input type="hidden" name="examId" value={examId} />
            <input type="hidden" name="action" value={action} />
            <Button
              type="submit"
              variant="secondary"
              fullWidth={false}
              disabled={pending}
              className="px-3 py-1.5 text-xs"
            >
              {LABELS[action]}
            </Button>
          </form>
        ))}
      </div>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Something went wrong."} />
      ) : null}
    </div>
  );
}

export function RunSyncButton({ disabled }: { disabled: boolean }) {
  const [state, formAction, pending] = useActionState(() => runSyncAction(), initialActionState);
  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <Button type="submit" fullWidth={false} disabled={disabled || pending}>
        {pending ? "Syncing…" : "Sync from Google now"}
      </Button>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Sync failed."} />
      ) : null}
      {state.status === "success" ? (
        <FormMessage status="success" message={state.message ?? "Done."} />
      ) : null}
    </form>
  );
}
