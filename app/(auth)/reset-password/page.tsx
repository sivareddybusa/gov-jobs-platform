import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata = { title: "Reset password" };

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Choose a new password</h1>
      </div>
      {user ? (
        <ResetPasswordForm />
      ) : (
        <div className="flex flex-col gap-3">
          <p
            role="alert"
            className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700"
          >
            This link is invalid or has expired. Please request a new one.
          </p>
          <Link
            href="/forgot-password"
            className="text-center text-sm font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            Request a new reset link
          </Link>
        </div>
      )}
    </div>
  );
}
