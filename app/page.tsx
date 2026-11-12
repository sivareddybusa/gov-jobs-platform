import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b from-brand-50 via-white to-white p-8 text-center">
      <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
        Not a government website — always verify against the official notification
      </span>
      <h1 className="max-w-xl text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
        Government Jobs Eligibility Platform
      </h1>
      <p className="max-w-md text-sm text-gray-600">
        Discover government jobs across India and understand exactly which ones you&apos;re eligible
        for, based on your profile.
      </p>
      <div className="flex gap-3">
        <Link href="/login">
          <Button variant="secondary" fullWidth={false} className="px-5">
            Log in
          </Button>
        </Link>
        <Link href="/register">
          <Button fullWidth={false} className="px-5">
            Create an account
          </Button>
        </Link>
      </div>
    </main>
  );
}
