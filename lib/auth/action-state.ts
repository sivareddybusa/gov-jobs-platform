/**
 * Shared shape for every auth-related Server Action, used with React's
 * useActionState so forms get consistent pending/error/success handling
 * without a form library reimplementing it per page.
 */
export type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

export const initialActionState: ActionState = { status: "idle" };
