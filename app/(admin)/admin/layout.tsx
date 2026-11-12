import Link from "next/link";
import { requireAdminRole } from "@/lib/auth/require-admin";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Lowest admin tier (reviewer) may enter the admin area at all — each page
  // underneath re-checks its own required tier for writes (defense in
  // depth, same pattern as app/(protected)/layout.tsx's requireUser()).
  await requireAdminRole("reviewer");

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-gray-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="rounded bg-brand-600 px-1.5 py-0.5 text-xs font-semibold text-white">
              Admin
            </span>
            <span className="text-sm font-medium text-gray-300">Government Jobs Platform</span>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
            <Link href="/admin" className="font-medium text-gray-300 hover:text-white">
              Overview
            </Link>
            <Link
              href="/admin/organizations"
              className="font-medium text-gray-300 hover:text-white"
            >
              Organizations
            </Link>
            <Link href="/admin/sources" className="font-medium text-gray-300 hover:text-white">
              Sources
            </Link>
            <Link href="/admin/jobs" className="font-medium text-gray-300 hover:text-white">
              Jobs
            </Link>
            <Link href="/admin/imports" className="font-medium text-gray-300 hover:text-white">
              AI imports
            </Link>
            <Link href="/admin/roles" className="font-medium text-gray-300 hover:text-white">
              Roles
            </Link>
            <Link href="/dashboard" className="font-medium text-gray-400 hover:text-white">
              Back to app
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 py-6">{children}</main>
    </div>
  );
}
