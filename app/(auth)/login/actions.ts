"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";
import { mapAuthError } from "@/lib/auth/error-messages";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/auth/action-state";

const RATE_LIMITED_MESSAGE = "Too many login attempts. Please wait a while before trying again.";

export async function loginAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the errors below.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // SECURITY.md §16: strict per-IP AND per-account limiting — directly
  // mitigates credential stuffing/brute force (§2). Both checked (not just
  // one) so a distributed attack across many IPs against one account is
  // still caught by the per-account bucket, and a single-IP attack across
  // many accounts is still caught by the per-IP bucket. The per-IP number
  // is higher than the per-account one (50 vs. 5) for the same local-dev
  // "every test shares one IP bucket" reason as register's limit — the
  // per-account bucket, keyed by a unique email per test, doesn't have
  // this problem and stays at a genuinely strict "handful of attempts".
  const ip = await getClientIp();
  const [ipLimit, accountLimit] = await Promise.all([
    checkRateLimit(`login:ip:${ip}`, 50, 900),
    checkRateLimit(`login:account:${parsed.data.email.toLowerCase()}`, 5, 900),
  ]);
  if (ipLimit.limited || accountLimit.limited) {
    return { status: "error", message: RATE_LIMITED_MESSAGE };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // "Invalid login credentials" is returned for both a wrong password and
    // a non-existent account — deliberately not distinguished any further
    // here (SECURITY.md §4: login must not become an enumeration oracle).
    return { status: "error", message: mapAuthError(error) };
  }

  const redirectTo = formData.get("redirectTo");
  redirect(safeRedirectPath(typeof redirectTo === "string" ? redirectTo : null, "/dashboard"));
}
