import Link from "next/link";
import { requireAdminRole } from "@/lib/auth/require-admin";
import { listJobImports } from "@/db/admin/job-imports";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "AI imports · Admin" };

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

export default async function ImportsPage() {
  const { supabase } = await requireAdminRole("reviewer");
  const imports = await listJobImports(supabase);

  return (
    <div>
      <PageHeader
        title="AI job imports"
        actions={
          <Link href="/admin/imports/new">
            <Button fullWidth={false}>+ Start ingestion</Button>
          </Link>
        }
      />
      {imports.length === 0 ? (
        <p className="text-sm text-gray-500">No imports yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {imports.map((i) => (
            <li key={i.id}>
              <Card className="flex items-center justify-between gap-2 p-3.5">
                <div>
                  <Link
                    href={`/admin/imports/${i.id}`}
                    className="text-sm font-medium text-gray-900 hover:text-brand-700"
                  >
                    {i.source_url}
                  </Link>
                  <span className="ml-2 text-xs text-gray-500">{i.job_sources?.name}</span>
                </div>
                <Badge tone={STATUS_TONE[i.status] ?? "gray"}>
                  {STATUS_LABELS[i.status] ?? i.status}
                </Badge>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
