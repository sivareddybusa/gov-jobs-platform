"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { saveJobAction, unsaveJobAction } from "./actions";
import { initialActionState } from "@/lib/auth/action-state";

export function SaveButton({
  jobPostId,
  initiallySaved,
}: {
  jobPostId: string;
  initiallySaved: boolean;
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      fullWidth={false}
      disabled={pending}
      aria-busy={pending}
      className="px-3 py-1.5 text-xs"
      onClick={() => {
        startTransition(async () => {
          const formData = new FormData();
          formData.set("jobPostId", jobPostId);
          const action = saved ? unsaveJobAction : saveJobAction;
          const result = await action(initialActionState, formData);
          if (result.status === "success") setSaved((s) => !s);
        });
      }}
    >
      {pending ? "…" : saved ? "Unsave" : "Save"}
    </Button>
  );
}
