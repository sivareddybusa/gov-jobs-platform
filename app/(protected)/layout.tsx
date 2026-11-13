import { requireUser } from "@/lib/auth/require-user";
import { SignOutButton } from "@/components/sign-out-button";
import { CandidateShell } from "@/components/layout/candidate-shell";
import { adminNavFor, type AdminTier } from "@/lib/navigation/candidate-nav";

const TIERS_HIGH_TO_LOW: AdminTier[] = ["super_admin", "admin", "editor", "reviewer"];

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // Defense-in-depth re-check (SECURITY.md §5): proxy.ts already redirects
  // unauthenticated requests away from these paths, but this layout never
  // assumes that ran correctly.
  const { supabase, user } = await requireUser();

  // The Admin menu is a convenience only: every /admin page re-checks its own
  // role server-side (requireAdminRole), and RLS sits under that.
  const checks = await Promise.all(
    TIERS_HIGH_TO_LOW.map((tier) =>
      supabase.rpc("is_admin", { check_user_id: user.id, min_role: tier }),
    ),
  );
  const tier = TIERS_HIGH_TO_LOW.find((_, i) => checks[i]?.data === true) ?? null;

  return (
    <CandidateShell signOut={<SignOutButton />} adminGroups={adminNavFor(tier)}>
      {children}
    </CandidateShell>
  );
}
