"use server";

import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema } from "@/lib/validation/auth";
import { mapAuthError } from "@/lib/auth/error-messages";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/auth/action-state";

const GENERIC_SUCCESS = "If an account exists for that email, we've sent a password reset link.";
const RATE_LIMITED_MESSAGE = "Too many requests. Please wait a while before trying again.";

export async function requestPasswordResetAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // SECURITY.md §16: strict per-account limiting, applied identically
  // whether or not the email actually belongs to an account — the bucket
  // key is the submitted email string itself, so this can never become an
  // enumeration oracle (a nonexistent email gets exactly the same
  // rate-limit behavior as a real one).
  const { limited } = await checkRateLimit(
    `password-reset:${parsed.data.email.toLowerCase()}`,
    5,
    3600,
  );
  if (limited) {
    return { status: "error", message: RATE_LIMITED_MESSAGE };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email);

  // Supabase's own API already never reveals whether the email exists; this
  // action preserves that by always returning the same generic response
  // except for a genuine rate-limit failure (SECURITY.md §4/§17).
  if (error?.message?.toLowerCase().includes("rate limit")) {
    return { status: "error", message: mapAuthError(error) };
  }

  return { status: "success", message: GENERIC_SUCCESS };
}
