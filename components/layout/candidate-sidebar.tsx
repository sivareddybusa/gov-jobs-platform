"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CANDIDATE_NAV, isNavItemActive, type NavGroup } from "@/lib/navigation/candidate-nav";
import { cn } from "@/lib/cn";

function NavList({
  pathname,
  groups,
  onNavigate,
}: {
  pathname: string;
  groups: NavGroup[];
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Main" className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.heading}>
          <p className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {group.heading}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isNavItemActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    {...(onNavigate ? { onClick: onNavigate } : {})}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand-50 text-brand-700"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Persistent sidebar on large screens; slide-in drawer (opened from the top
 * bar button) below the `lg` breakpoint. Navigation items are plain links, so
 * the menu works as ordinary server-rendered navigation.
 */
export function CandidateSidebar({
  footer,
  extraGroups = [],
}: {
  footer?: React.ReactNode;
  /** Extra groups (e.g. "Admin") appended below the candidate menu. */
  extraGroups?: NavGroup[];
}) {
  const pathname = usePathname();
  const groups = [...CANDIDATE_NAV, ...extraGroups];
  // The drawer is "open" only for the path it was opened on, so navigating
  // closes it without a setState-in-effect.
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const open = openedOn === pathname;
  const setOpen = (value: boolean) => setOpenedOn(value ? pathname : null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white p-2 text-gray-700 shadow-sm hover:bg-gray-50 lg:hidden"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M4 6h16M4 12h16M4 18h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <aside className="fixed bottom-0 left-0 top-[57px] z-10 hidden w-64 overflow-y-auto border-r border-gray-200 bg-white px-3 py-5 lg:block">
        <NavList pathname={pathname} groups={groups} />
        {footer ? <div className="mt-6 border-t border-gray-100 pt-4">{footer}</div> : null}
      </aside>

      {open ? (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          id="mobile-nav"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-gray-900/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] overflow-y-auto bg-white px-3 py-5 shadow-xl">
            <NavList pathname={pathname} groups={groups} onNavigate={() => setOpen(false)} />
            {footer ? <div className="mt-6 border-t border-gray-100 pt-4">{footer}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
