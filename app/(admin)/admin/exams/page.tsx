import { requireAdminRole } from "@/lib/auth/require-admin";
import { listAllExams } from "@/db/admin/exams";
import { EXAM_CATEGORY_LABELS } from "@/domain/exams";
import type { ExamCategory } from "@/domain/exams";
import { getSyncAvailability } from "@/services/exams/run";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RunSyncButton, StatusActions } from "./status-actions";

export const metadata = { title: "Exams · Admin" };

type RowAction = "publish" | "unpublish" | "archive";

export default async function AdminExamsPage() {
  const { supabase, user } = await requireAdminRole("reviewer");
  const [exams, canAdmin] = await Promise.all([
    listAllExams(supabase),
    supabase.rpc("is_admin", { check_user_id: user.id, min_role: "admin" }),
  ]);
  const isAdmin = canAdmin.data === true;
  const availability = await getSyncAvailability();
  const configured = availability.search && availability.extractor;

  return (
    <div>
      <PageHeader
        title="Exams"
        description="The exam catalog is fetched automatically from Google and official websites. Admins monitor it and can take wrong content down; they do not enter exams."
        actions={isAdmin ? <RunSyncButton disabled={!configured} /> : null}
      />
      {!configured ? (
        <Card className="mb-4 border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-900">
          Automatic sync is not configured:{" "}
          {[
            !availability.search &&
              "Google Search (GOOGLE_SEARCH_API_KEY, GOOGLE_SEARCH_ENGINE_ID)",
            !availability.extractor && "an AI provider (Admin → AI providers)",
          ]
            .filter(Boolean)
            .join(" and ")}{" "}
          missing. See docs/GOOGLE_SEARCH_INTEGRATION.md.
        </Card>
      ) : null}
      {exams.length === 0 ? (
        <p className="text-sm text-gray-500">
          No exams yet. They appear here after the first successful sync.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {exams.map((exam) => {
            const actions: RowAction[] = [];
            if (isAdmin) {
              if (exam.status === "published") actions.push("unpublish", "archive");
              else if (
                exam.status === "draft" &&
                (exam.verification_status === "auto_verified" ||
                  exam.verification_status === "admin_verified")
              )
                actions.push("publish", "archive");
            }
            return (
              <li key={exam.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">{exam.name}</p>
                    <p className="text-xs text-gray-500">
                      {EXAM_CATEGORY_LABELS[exam.category as ExamCategory]}
                      {exam.organizations ? ` · ${exam.organizations.name}` : ""}
                    </p>
                    {exam.source_url ? (
                      <a
                        href={exam.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block max-w-xs truncate text-xs text-brand-700 hover:underline"
                      >
                        {exam.source_url}
                      </a>
                    ) : null}
                    <p className="text-xs text-gray-500">
                      {exam.last_synced_at
                        ? `Last synced ${new Date(exam.last_synced_at).toLocaleString("en-IN")}`
                        : "Not synced yet"}
                    </p>
                    {exam.sync_status === "failed" && exam.sync_error ? (
                      <p className="text-xs text-red-700">Sync error: {exam.sync_error}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={exam.verification_status.endsWith("verified") ? "green" : "amber"}
                      >
                        {exam.verification_status.replace("_", " ")}
                      </Badge>
                      <Badge tone={exam.status === "published" ? "brand" : "gray"}>
                        {exam.status}
                      </Badge>
                    </div>
                    {actions.length > 0 ? (
                      <StatusActions examId={exam.id} actions={actions} />
                    ) : null}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
