import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type FieldWrapperProps = {
  id: string;
  label: string;
  error?: string | undefined;
  children: ReactNode;
};

/** Label + control + error message, wired together with the right aria attributes. */
function FieldWrapper({ id, label, error, children }: FieldWrapperProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const controlClassName =
  "rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition-colors " +
  "placeholder:text-gray-400 " +
  "focus:border-brand-500 focus:outline focus:outline-2 focus:outline-offset-1 focus:outline-brand-500/40 " +
  "disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 " +
  "aria-[invalid=true]:border-red-400 aria-[invalid=true]:outline-red-300";

type InputFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | undefined;
};

export function InputField({ id, label, error, className, name, ...props }: InputFieldProps) {
  return (
    <FieldWrapper id={id!} label={label} error={error}>
      <input
        id={id}
        // Defaults to `id` when the caller doesn't register a name itself
        // (react-hook-form's `register()` spread already provides one) —
        // without a `name`, a native <form> submission's FormData silently
        // omits this field entirely.
        name={name ?? id}
        className={cn(controlClassName, className)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
    </FieldWrapper>
  );
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string | undefined;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
};

export function SelectField({
  id,
  label,
  error,
  className,
  options,
  placeholder,
  name,
  ...props
}: SelectFieldProps) {
  return (
    <FieldWrapper id={id!} label={label} error={error}>
      <select
        id={id}
        name={name ?? id}
        className={cn(controlClassName, "bg-white", className)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      >
        {placeholder ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}
