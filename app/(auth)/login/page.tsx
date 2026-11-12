import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; error?: string }>;
}) {
  const { redirectTo, error } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Log in</h1>
      </div>
      {error === "confirmation_failed" ? (
        <p
          role="alert"
          className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          That confirmation or reset link is invalid or has expired. Please try again below, or
          request a new one.
        </p>
      ) : null}
      <LoginForm redirectTo={redirectTo} />
      <div className="flex flex-col items-center gap-2 text-sm text-gray-600">
        <Link
          href="/forgot-password"
          className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
        >
          Forgot your password?
        </Link>
        <p>
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
