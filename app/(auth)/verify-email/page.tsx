import { ResendConfirmationForm } from "./resend-confirmation-form";

export const metadata = { title: "Check your email" };

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-900 sm:text-xl">Check your email</h1>
        <p className="mt-1 text-sm text-gray-600">
          If an account can be created with that email address, we&apos;ve sent a confirmation link
          {email ? ` to ${email}` : ""}. Follow it to finish setting up your account.
        </p>
      </div>
      <ResendConfirmationForm defaultEmail={email ?? ""} />
    </div>
  );
}
