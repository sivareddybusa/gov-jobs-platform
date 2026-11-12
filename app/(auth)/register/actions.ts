"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { registerSchema } from "@/lib/validation/auth";
import { mapAuthError, isDuplicateAccountError } from "@/lib/auth/error-messages";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/auth/action-state";

const RATE_LIMITED_MESSAGE =
  "Too many registration attempts. Please wait a while before trying again.";

export async function registerAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
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

  // SECURITY.md §16: moderate per-IP limiting on registration, to mitigate
  // automated mass account creation. 30/hour still throttles real abuse
  // (legitimate distinct users each have distinct public IPs in
  // production) while comfortably covering this project's local E2E
  // suite, which — with no `x-forwarded-for` in local dev — has every
  // test run share a single "local" IP bucket.
  const ip = await getClientIp();
  const { limited } = await checkRateLimit(`register:ip:${ip}`, 30, 3600);
  if (limited) {
    return { status: "error", message: RATE_LIMITED_MESSAGE };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  // A genuinely new account and an already-registered email both land here
  // with the same outcome — never reveal which one happened (SECURITY.md
  // §4/§17: registration must not become an account-enumeration oracle).
  if (error && !isDuplicateAccountError(error)) {
    return { status: "error", message: mapAuthError(error) };
  }

  redirect(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
}
