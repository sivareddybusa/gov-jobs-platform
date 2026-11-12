import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Create your account</h1>
        <p className="mt-1 text-sm text-gray-600">
          Discover government jobs you may be eligible for. This is not a government website —
          always verify details against the official notification.
        </p>
      </div>
      <RegisterForm />
      <p className="text-center text-sm text-gray-600">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
