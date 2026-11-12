import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { SignOutButton } from "@/components/sign-out-button";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // Defense-in-depth re-check (SECURITY.md §5): proxy.ts already redirects
  // unauthenticated requests away from these paths, but this layout never
  // assumes that ran correctly.
  await requireUser();

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <Link href="/dashboard" className="text-sm font-semibold tracking-tight text-gray-900">
            Government Jobs Eligibility Platform
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/dashboard" className="font-medium text-gray-600 hover:text-brand-700">
              Dashboard
            </Link>
            <Link href="/jobs" className="font-medium text-gray-600 hover:text-brand-700">
              Browse jobs
            </Link>
            <Link href="/profile" className="font-medium text-gray-600 hover:text-brand-700">
              Profile
            </Link>
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 py-6">{children}</main>
    </div>
  );
}
