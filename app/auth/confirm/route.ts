import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirectPath } from "@/lib/auth/safe-redirect";

/**
 * Email confirmation / password-recovery callback.
 *
 * supabase/templates/confirmation.html and recovery.html link here with
 * `token_hash` + `type` (never Supabase's default {{ .ConfirmationURL }},
 * which hits GoTrue's own /verify endpoint via implicit flow) so the
 * exchange happens through our own server Supabase client — the session
 * this establishes is written via the SSR cookie handler
 * (lib/supabase/server.ts), matching ARCHITECTURE.md's server-side session
 * handling rather than an implicit-flow URL-fragment token.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard");

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

    if (!error) {
      redirect(next);
    }
  }

  // Covers: missing/malformed params, an already-used token, and a genuinely
  // expired token — all treated identically and generically (SECURITY.md
  // §17: never expose which specific failure occurred).
  redirect("/login?error=confirmation_failed");
}
