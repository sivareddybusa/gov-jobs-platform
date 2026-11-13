import { requireUser } from "@/lib/auth/require-user";
import { SignOutButton } from "@/components/sign-out-button";
import { CandidateShell } from "@/components/layout/candidate-shell";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  // Defense-in-depth re-check (SECURITY.md §5): proxy.ts already redirects
  // unauthenticated requests away from these paths, but this layout never
  // assumes that ran correctly.
  await requireUser();

  return <CandidateShell signOut={<SignOutButton />}>{children}</CandidateShell>;
}
