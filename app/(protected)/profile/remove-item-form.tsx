"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { ActionState } from "@/lib/auth/action-state";
import { initialActionState } from "@/lib/auth/action-state";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Small reusable "remove one row" form shared by the qualifications and
 * special-statuses lists — wraps a `(prevState, formData) => ActionState`
 * Server Action (removeQualificationAction/removeStatusAction) with
 * useActionState so it gets pending/error handling for free, and refreshes
 * the Server Component data on success so the removed row actually
 * disappears without a full page reload.
 */
export function RemoveItemForm({
  id,
  action,
  label,
}: {
  id: string;
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, initialActionState);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [state.status, router]);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <SubmitButton
        pendingLabel="Removing…"
        variant="secondary"
        className="w-auto px-3 py-1.5 text-xs"
      >
        {label}
      </SubmitButton>
      {state.status === "error" ? (
        <span role="alert" className="text-xs text-red-600">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
