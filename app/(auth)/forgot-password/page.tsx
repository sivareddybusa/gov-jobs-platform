import Link from "next/link";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Forgot your password?</h1>
        <p className="mt-1 text-sm text-gray-600">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>
      </div>
      <ForgotPasswordForm />
      <p className="text-center text-sm text-gray-600">
        <Link
          href="/login"
          className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
        >
          Back to log in
        </Link>
      </p>
    </div>
  );
}
