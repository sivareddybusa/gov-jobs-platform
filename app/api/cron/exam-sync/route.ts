import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runConfiguredExamSync } from "@/services/exams/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Scheduled exam sync (e.g. a daily cron). Disabled unless CRON_SECRET is set;
 * callers must send `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const secret = process.env["CRON_SECRET"];
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 404 });
  if (!authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runConfiguredExamSync();
  return NextResponse.json(result, { status: result.status === "ok" ? 200 : 503 });
}
