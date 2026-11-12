"use client";

import { useState, useTransition } from "react";
import { transitionStatusAction } from "../actions";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";

const LABELS: Record<string, string> = {
  approve: "Approve",
  publish: "Publish",
  unpublish: "Unpublish",
  expire: "Mark expired",
  archive: "Archive",
};

export function StatusActions({
  id,
  available,
}: {
  id: string;
  available: Array<keyof typeof LABELS>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (available.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {available.map((action) => (
          <Button
            key={action}
            type="button"
            variant="secondary"
            fullWidth={false}
            disabled={pending}
            className="px-3 py-1.5 text-xs"
            onClick={() => {
              setError(null);
              setSuccess(null);
              startTransition(async () => {
                const result = await transitionStatusAction(
                  id,
                  action as "publish" | "unpublish" | "expire" | "archive" | "approve",
                );
                if (result.status === "error") {
                  setError(result.message ?? "Something went wrong.");
                } else {
                  setSuccess(result.message ?? "Status updated.");
                }
              });
            }}
          >
            {LABELS[action]}
          </Button>
        ))}
      </div>
      {error ? <FormMessage status="error" message={error} /> : null}
      {success ? <FormMessage status="success" message={success} /> : null}
    </div>
  );
}
