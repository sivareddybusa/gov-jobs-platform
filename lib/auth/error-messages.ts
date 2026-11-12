import "server-only";

/**
 * Maps Supabase Auth errors to safe, generic user-facing messages.
 *
 * SECURITY.md §17/§25: authentication failures must be useful without
 * exposing database internals, stack traces, or Supabase's raw error text.
 * The default case never echoes `error.message` back to the client — only
 * a small, deliberately-chosen allowlist of known, safe messages is ever
 * shown; anything else falls back to a single generic message.
 */
export function mapAuthError(error: { message?: string } | null | undefined): string {
  const raw = error?.message?.toLowerCase() ?? "";

  if (raw.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }
  if (raw.includes("email not confirmed")) {
    return "Please confirm your email address before logging in.";
  }
  if (
    raw.includes("email rate limit") ||
    raw.includes("rate limit") ||
    raw.includes("too many requests")
  ) {
    return "Too many attempts. Please wait a moment and try again.";
  }
  if (
    raw.includes("password should be at least") ||
    (raw.includes("password") && raw.includes("weak"))
  ) {
    return "Please choose a stronger password.";
  }
  if (raw.includes("same password") || raw.includes("different from the old")) {
    return "Your new password must be different from your current password.";
  }
  if (
    raw.includes("auth session missing") ||
    (raw.includes("session") && raw.includes("expired"))
  ) {
    return "Your session has expired. Please request a new link and try again.";
  }

  return "Something went wrong. Please try again.";
}

/**
 * Whether a signUp error actually indicates a duplicate account, as opposed
 * to some other failure. Treated as a success path by the caller (Phase 3
 * §5/§17: registration/login must never reveal whether an email is already
 * registered) — the caller shows the exact same "check your email" response
 * either way, rather than branching into a distinct "email already in use"
 * message.
 */
export function isDuplicateAccountError(error: { message?: string } | null | undefined): boolean {
  const raw = error?.message?.toLowerCase() ?? "";
  return (
    raw.includes("already registered") ||
    raw.includes("already exists") ||
    raw.includes("user already")
  );
}
