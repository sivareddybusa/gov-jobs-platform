"use server";

import { createClient } from "@/lib/supabase/server";
import { resendConfirmationSchema } from "@/lib/validation/auth";
import { mapAuthError } from "@/lib/auth/error-messages";
import type { ActionState } from "@/lib/auth/action-state";

const GENERIC_SUCCESS = "If that email has a pending confirmation, we've sent another message.";

export async function resendConfirmationAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resendConfirmationSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: "signup", email: parsed.data.email });

  // Same response regardless of whether the account exists or is already
  // confirmed — resending must not become an enumeration oracle either
  // (SECURITY.md §4/§17), mirroring the registration action's approach.
  // A genuine, unexpected failure (rate limit, network) still surfaces a
  // safe generic error rather than silently pretending to succeed.
  if (error && !error.message?.toLowerCase().includes("already confirmed")) {
    const isRateLimited = error.message?.toLowerCase().includes("rate limit");
    if (isRateLimited) {
      return { status: "error", message: mapAuthError(error) };
    }
  }

  return { status: "success", message: GENERIC_SUCCESS };
}
