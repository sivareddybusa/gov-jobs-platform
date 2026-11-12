import { requireAdminRole } from "@/lib/auth/require-admin";
import { listJobSources } from "@/db/admin/job-sources";
import { StartIngestionForm } from "./start-ingestion-form";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Start ingestion · Admin" };

export default async function NewImportPage() {
  const { supabase } = await requireAdminRole("editor");
  const sources = await listJobSources(supabase);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Start ingestion</h1>
      <Card>
        <StartIngestionForm sources={sources} />
      </Card>
    </div>
  );
}
