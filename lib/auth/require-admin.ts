import "server-only";

import { redirect } from "next/navigation";
import { requireUser } from "./require-user";

export type AdminRole = "reviewer" | "editor" | "admin" | "super_admin";

/**
 * Server-side admin-role gate for admin Server Components/Server Actions.
 * Never trusts a client-supplied role claim (CLAUDE.md, SECURITY.md §5) —
 * role is resolved via the `is_admin` security-definer RPC (DATABASE.md
 * §26), which reads `admin_role_assignments` server-side against the
 * caller's own session. RLS's own `*_write_editor`/`*_write_admin` policies
 * are the independent second layer under every admin write this gate
 * protects — this function existing does not make those policies optional.
 *
 * A signed-in user without the required role is redirected to /dashboard
 * (not a 403 page) — the existence of the admin area is not something to
 * confirm/deny to an unauthorized but authenticated user any more than
 * necessary.
 */
export async function requireAdminRole(minRole: AdminRole) {
  const { supabase, user } = await requireUser("/admin");

  const { data: isAdmin, error } = await supabase.rpc("is_admin", {
    check_user_id: user.id,
    min_role: minRole,
  });

  if (error || !isAdmin) {
    redirect("/dashboard");
  }

  return { supabase, user };
}
