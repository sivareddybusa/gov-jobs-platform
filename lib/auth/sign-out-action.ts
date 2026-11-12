"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Signs out through the server session mechanism (not just discarding a
 * client-side token) so the session is actually invalidated and proxy.ts's
 * session refresh stops treating the request as authenticated on the very
 * next request — Phase 3 §6: logout must be a real server/session
 * operation, not a client-only state reset that could leave stale
 * private UI cached.
 */
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
