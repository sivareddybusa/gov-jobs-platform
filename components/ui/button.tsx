import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  fullWidth?: boolean;
};

export function Button({
  className,
  variant = "primary",
  fullWidth = true,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium",
        "transition-colors duration-150",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600",
        "disabled:cursor-not-allowed disabled:opacity-60",
        fullWidth && "w-full",
        variant === "primary" &&
          "bg-brand-600 text-white shadow-sm hover:bg-brand-700 active:bg-brand-800",
        variant === "secondary" &&
          "border border-gray-200 bg-white text-gray-900 shadow-sm hover:bg-gray-50 active:bg-gray-100",
        variant === "danger" &&
          "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800",
        variant === "ghost" && "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
        className,
      )}
      disabled={disabled}
      {...props}
    />
  );
}
