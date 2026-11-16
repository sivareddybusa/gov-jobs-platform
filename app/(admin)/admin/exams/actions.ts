"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/auth/require-admin";
import type { ActionState } from "@/lib/auth/action-state";
import { transitionExamUseCase } from "@/services/admin/exams";
import { recordAuditEvent } from "@/lib/audit";
import {
  runConfiguredExamSync,
  runConfiguredMaterialsSync,
  runConfiguredSyllabusSync,
} from "@/services/exams/run";

export async function transitionExamAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireAdminRole("admin");
  const result = await transitionExamUseCase(supabase, user.id, {
    examId: formData.get("examId"),
    action: formData.get("action"),
  });
  if (!result.success) return { status: "error", message: result.error };
  revalidatePath("/admin/exams");
  revalidatePath("/preparation/exams");
  return { status: "success", message: "Status updated." };
}

export async function runSyncAction(): Promise<ActionState> {
  const { user } = await requireAdminRole("admin");
  const result = await runConfiguredExamSync();
  if (result.status === "unavailable") return { status: "error", message: result.reason };
  const s = result.summary;
  await recordAuditEvent({
    actorId: user.id,
    eventType: "exam.sync_triggered",
    entityTable: "exams",
    entityId: user.id,
    metadata: { ...s },
  });
  revalidatePath("/admin/exams");
  revalidatePath("/preparation/exams");
  return {
    status: "success",
    message: `Searched ${s.queries} queries, read ${s.pagesRead} official pages: ${s.created} added, ${s.refreshed} refreshed, ${s.skipped} skipped, ${s.failed} failed.`,
  };
}

export async function runSyllabusSyncAction(): Promise<ActionState> {
  const { user } = await requireAdminRole("admin");
  const result = await runConfiguredSyllabusSync();
  if (result.status === "unavailable") return { status: "error", message: result.reason };
  const s = result.summary;
  await recordAuditEvent({
    actorId: user.id,
    eventType: "syllabus.sync_triggered",
    entityTable: "exams",
    entityId: user.id,
    metadata: { ...s },
  });
  revalidatePath("/admin/exams");
  revalidatePath("/preparation/exams");
  return {
    status: "success",
    message: `Checked ${s.exams} exams: ${s.stored} syllabi stored, ${s.notFound} not found on official pages, ${s.failed} failed.`,
  };
}

export async function runMaterialsSyncAction(): Promise<ActionState> {
  const { user } = await requireAdminRole("admin");
  const result = await runConfiguredMaterialsSync();
  if (result.status === "unavailable") return { status: "error", message: result.reason };
  const s = result.summary;
  await recordAuditEvent({
    actorId: user.id,
    eventType: "materials.sync_triggered",
    entityTable: "exams",
    entityId: user.id,
    metadata: { ...s },
  });
  revalidatePath("/admin/exams");
  revalidatePath("/preparation/exams");
  return {
    status: "success",
    message: `Checked ${s.exams} exams: ${s.links} official links saved, ${s.failed} failed.`,
  };
}
