"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/auth/action-state";
import { trackApplicationAction } from "./actions";

/** "Track application" on a job post; becomes a link to the tracker once added. */
export function TrackButton({
  jobPostId,
  initiallyTracked,
}: {
  jobPostId: string;
  initiallyTracked: boolean;
}) {
  const [tracked, setTracked] = useState(initiallyTracked);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (tracked) {
    return (
      <Link
        href="/applications"
        className="text-xs font-medium text-brand-600 hover:text-brand-700 hover:underline"
      >
        Tracking · view tracker
      </Link>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        fullWidth={false}
        disabled={pending}
        aria-busy={pending}
        className="px-3 py-1.5 text-xs"
        onClick={() =>
          startTransition(async () => {
            const formData = new FormData();
            formData.set("jobPostId", jobPostId);
            const result = await trackApplicationAction(initialActionState, formData);
            if (result.status === "success") setTracked(true);
            else setError(result.message ?? "Could not track.");
          })
        }
      >
        {pending ? "…" : "Track application"}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
