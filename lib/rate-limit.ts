import "server-only";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Coarse, endpoint-category-based rate limiting (SECURITY.md §16) backed by
 * Postgres via the service-role client — the one store consistently shared
 * across every server instance/serverless invocation. `rate_limit_attempts`
 * has no RLS policy for any role (same posture as audit_logs/job_history),
 * so this module is the only read/write path into it.
 *
 * Fails open on a database error (never blocks a legitimate user because
 * the rate-limit check itself failed) — logged loudly enough to notice, but
 * availability of the underlying feature takes priority over an
 * infrastructure hiccup in a secondary defense layer.
 */
export async function checkRateLimit(
  bucketKey: string,
  maxAttempts: number,
  windowSeconds: number,
): Promise<{ limited: boolean }> {
  try {
    const admin = createAdminClient();
    const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString();

    const { count, error: countError } = await admin
      .from("rate_limit_attempts")
      .select("id", { count: "exact", head: true })
      .eq("bucket_key", bucketKey)
      .gte("attempted_at", windowStart);

    if (countError) {
      console.error("rate limit count check failed", countError);
      return { limited: false };
    }

    if ((count ?? 0) >= maxAttempts) {
      return { limited: true };
    }

    const { error: insertError } = await admin
      .from("rate_limit_attempts")
      .insert({ bucket_key: bucketKey });
    if (insertError) {
      console.error("rate limit attempt insert failed", insertError);
    }
    return { limited: false };
  } catch (err) {
    console.error("rate limit check threw", err);
    return { limited: false };
  }
}

/**
 * Best-effort client IP for the per-IP bucket component. `x-forwarded-for`
 * is set by Vercel's edge network in production; local dev has no such
 * header, so those requests share one "local" bucket — acceptable since
 * local dev isn't the threat model this defends, and it means the limiter
 * is still exercised (not silently disabled) during local testing.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwardedFor = h.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "local";
}
