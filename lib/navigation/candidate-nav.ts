/**
 * Candidate navigation structure. Pure data + a pure active-state helper so it
 * can be unit-tested without React. Every href here must be a real route.
 */
export type NavItem = { label: string; href: string };
export type NavGroup = { heading: string; items: NavItem[] };

export const CANDIDATE_NAV: NavGroup[] = [
  {
    heading: "Main menu",
    items: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Search Government Jobs", href: "/jobs" },
      { label: "Eligible Jobs", href: "/eligible-jobs" },
      { label: "Latest Notifications", href: "/latest-notifications" },
      { label: "Saved Jobs", href: "/saved-jobs" },
      { label: "Application Tracker", href: "/applications" },
    ],
  },
  {
    heading: "My Preparation",
    items: [
      { label: "My Preparation", href: "/preparation" },
      { label: "Find an Exam", href: "/preparation/exams" },
      { label: "My Study Plan", href: "/study-plan" },
      { label: "Study Materials", href: "/study-materials" },
      { label: "Practice Questions", href: "/practice" },
      { label: "Mock Tests", href: "/mock-tests" },
      { label: "Previous Year Papers", href: "/previous-papers" },
      { label: "Performance Analytics", href: "/performance" },
    ],
  },
  {
    heading: "Account",
    items: [
      { label: "My Profile", href: "/profile" },
      { label: "Settings", href: "/settings" },
    ],
  },
];

/** Admin destinations shown in the sidebar to signed-in admins, filtered by role tier. */
export type AdminTier = "reviewer" | "editor" | "admin" | "super_admin";
const TIER_RANK: Record<AdminTier, number> = { reviewer: 1, editor: 2, admin: 3, super_admin: 4 };

const ADMIN_ITEMS: Array<NavItem & { minTier: AdminTier }> = [
  { label: "Admin overview", href: "/admin", minTier: "reviewer" },
  { label: "Organizations", href: "/admin/organizations", minTier: "reviewer" },
  { label: "Sources", href: "/admin/sources", minTier: "reviewer" },
  { label: "Jobs", href: "/admin/jobs", minTier: "reviewer" },
  { label: "Exams", href: "/admin/exams", minTier: "reviewer" },
  { label: "AI imports", href: "/admin/imports", minTier: "reviewer" },
  { label: "AI providers", href: "/admin/ai-providers", minTier: "super_admin" },
  { label: "Roles", href: "/admin/roles", minTier: "super_admin" },
];

/** The "Admin" sidebar group for a user's highest tier, or none for non-admins. */
export function adminNavFor(tier: AdminTier | null): NavGroup[] {
  if (!tier) return [];
  const items = ADMIN_ITEMS.filter((i) => TIER_RANK[i.minTier] <= TIER_RANK[tier]).map(
    ({ label, href }) => ({ label, href }),
  );
  return [{ heading: "Admin", items }];
}

const ALL_HREFS = [...CANDIDATE_NAV, ...adminNavFor("super_admin")].flatMap((g) =>
  g.items.map((i) => i.href),
);

/**
 * An item is active when the path equals it or is nested under it, unless a
 * more specific nav item also matches (so /preparation/exams highlights
 * "Find an Exam", not "My Preparation").
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  const matches = (h: string) => pathname === h || pathname.startsWith(`${h}/`);
  if (!matches(href)) return false;
  return !ALL_HREFS.some((other) => other.length > href.length && matches(other));
}
