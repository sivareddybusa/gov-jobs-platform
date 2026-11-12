import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/require-admin";
import { getJobImportById } from "@/db/admin/job-imports";
import { parseStoredExtraction } from "@/services/admin/job-imports";
import { listOrganizations } from "@/db/admin/organizations";
import { listJobSources } from "@/db/admin/job-sources";
import { ReviewForm } from "./review-form";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Review import · Admin" };

const STATUS_LABELS: Record<string, string> = {
  discovered: "Discovered",
  downloaded: "Downloaded",
  extracted: "Extracted",
  review_required: "Needs review",
  validation_failed: "Failed",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_TONE: Record<string, "gray" | "green" | "red" | "amber" | "brand"> = {
  discovered: "gray",
  downloaded: "gray",
  extracted: "gray",
  review_required: "amber",
  validation_failed: "red",
  approved: "green",
  rejected: "red",
};

export default async function ImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdminRole("reviewer");
  const importRow = await getJobImportById(supabase, id);
  if (!importRow) notFound();

  const [organizations, sources] = await Promise.all([
    listOrganizations(supabase),
    listJobSources(supabase),
  ]);
  const extraction = parseStoredExtraction(importRow.raw_extraction_output);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Review import</h1>
        <Badge tone={STATUS_TONE[importRow.status] ?? "gray"}>
          {STATUS_LABELS[importRow.status] ?? importRow.status}
        </Badge>
      </div>

      <Card>
        <dl className="grid grid-cols-1 gap-3 text-sm text-gray-700 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-gray-900">Source URL</dt>
            <dd className="break-all">{importRow.source_url}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-900">Source</dt>
            <dd>{importRow.job_sources?.name}</dd>
          </div>
        </dl>
      </Card>

      {importRow.status === "validation_failed" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p className="font-medium">Ingestion failed and cannot be reviewed.</p>
          {importRow.validation_errors ? (
            <pre className="mt-2 overflow-x-auto text-xs whitespace-pre-wrap">
              {JSON.stringify(importRow.validation_errors, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}

      {(importRow.status === "approved" || importRow.status === "rejected") && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
          <p>
            This import was already {importRow.status}
            {importRow.reviewed_at ? ` on ${new Date(importRow.reviewed_at).toLocaleString()}` : ""}
            .
          </p>
          {importRow.review_notes ? <p className="mt-1">{importRow.review_notes}</p> : null}
        </div>
      )}

      {importRow.status === "review_required" && extraction ? (
        <ReviewForm
          importId={id}
          extraction={extraction}
          organizations={organizations}
          departments={[]}
          sources={sources}
        />
      ) : null}

      {importRow.status === "review_required" && !extraction ? (
        <p className="text-sm text-red-600">
          The stored extraction could not be parsed. This import cannot be reviewed as-is.
        </p>
      ) : null}
    </div>
  );
}
