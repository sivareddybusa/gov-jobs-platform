"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resetPasswordSchema } from "@/lib/validation/auth";
import { mapAuthError } from "@/lib/auth/error-messages";
import type { ActionState } from "@/lib/auth/action-state";

export async function resetPasswordAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();

  // updateUser requires an active session — established by the /auth/confirm
  // route's verifyOtp exchange for the recovery link the user clicked. If
  // that session is missing or expired, this fails safely rather than
  // silently no-op-ing.
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return { status: "error", message: mapAuthError(error) };
  }

  // updateUser() keeps the recovery session fully authenticated — it does
  // not sign the user out on its own. Redirecting straight to /login while
  // still authenticated would immediately get bounced back to /dashboard
  // by the middleware's auth-only-page redirect (Phase 3 §19), skipping
  // the "log in again with your new password" step the task's flow
  // requires. Signing out first makes /login actually reachable, and is
  // also the safer choice: the recovery session doesn't stay silently
  // valid after the password it was issued for has already been changed.
  await supabase.auth.signOut();
  redirect("/login");
}
