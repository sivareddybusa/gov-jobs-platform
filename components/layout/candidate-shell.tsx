"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CandidateSidebar } from "@/components/layout/candidate-sidebar";
import type { NavGroup } from "@/lib/navigation/candidate-nav";

/**
 * App frame for signed-in candidates: top bar + sidebar + content. During
 * onboarding (profile not complete yet) the sidebar is hidden — every
 * destination would just redirect back to onboarding.
 */
export function CandidateShell({
  signOut,
  adminGroups = [],
  children,
}: {
  signOut: ReactNode;
  adminGroups?: NavGroup[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const showNav = !pathname.startsWith("/onboarding");

  return (
    <div className="min-h-screen bg-[#f7f8fb]">
      {/* No backdrop-filter here: it would make this header the containing block
          for the sidebar/drawer's `fixed` positioning and collapse them to the
          header's height. */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            {showNav ? <CandidateSidebar extraGroups={adminGroups} /> : null}
            <Link
              href={showNav ? "/dashboard" : "/onboarding"}
              className="text-sm font-semibold tracking-tight text-gray-900"
            >
              GetTheGovJob
            </Link>
          </div>
          {signOut}
        </div>
      </header>
      <div className={showNav ? "lg:pl-64" : undefined}>
        <main className="mx-auto max-w-6xl p-4 py-6">{children}</main>
      </div>
    </div>
  );
}
