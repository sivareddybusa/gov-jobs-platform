import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type BadgeTone = "gray" | "green" | "red" | "amber" | "brand";

const TONE_STYLES: Record<BadgeTone, string> = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-green-50 text-green-700",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
  brand: "bg-brand-50 text-brand-700",
};

export function Badge({
  tone = "gray",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE_STYLES[tone],
        className,
      )}
      {...props}
    />
  );
}
