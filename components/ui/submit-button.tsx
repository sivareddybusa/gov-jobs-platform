"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

/** Submit button that disables itself and shows a loading label while its form is pending. */
export function SubmitButton({
  children,
  pendingLabel,
  variant,
  fullWidth,
  className,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "danger" | "ghost" | undefined;
  fullWidth?: boolean | undefined;
  className?: string | undefined;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      {...(variant ? { variant } : {})}
      {...(fullWidth !== undefined ? { fullWidth } : {})}
      {...(className ? { className } : {})}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}
