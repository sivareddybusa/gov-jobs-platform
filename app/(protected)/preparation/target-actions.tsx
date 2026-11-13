"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/auth/action-state";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { manageTargetAction } from "./actions";

type Action = "make_primary" | "pause" | "resume" | "remove";

const LABELS: Record<Action, string> = {
  make_primary: "Make primary",
  pause: "Pause",
  resume: "Resume",
  remove: "Remove",
};

/** One small form per action so each is a plain, accessible button. */
export function TargetActions({ targetId, actions }: { targetId: string; actions: Action[] }) {
  const [state, formAction, pending] = useActionState(manageTargetAction, initialActionState);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <form key={action} action={formAction}>
            <input type="hidden" name="targetId" value={targetId} />
            <input type="hidden" name="action" value={action} />
            <Button
              type="submit"
              variant={action === "remove" ? "ghost" : "secondary"}
              fullWidth={false}
              disabled={pending}
              className={
                action === "remove" ? "px-3 py-1.5 text-xs text-red-600" : "px-3 py-1.5 text-xs"
              }
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
