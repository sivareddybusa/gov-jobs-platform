import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/require-admin";
import { listOrganizations } from "@/db/admin/organizations";
import { getJobSourceById } from "@/db/admin/job-sources";
import { SourceForm } from "../source-form";
import { updateJobSourceAction } from "../actions";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Edit source · Admin" };

export default async function EditSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireAdminRole("admin");
  const [source, organizations] = await Promise.all([
    getJobSourceById(supabase, id),
    listOrganizations(supabase),
  ]);
  if (!source) notFound();

  const boundAction = updateJobSourceAction.bind(null, id);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Edit source</h1>
      <Card>
        <SourceForm
          action={boundAction}
          organizations={organizations}
          defaultValues={{
            organizationId: source.organization_id ?? "",
            name: source.name,
            officialDomain: source.official_domain,
            sourceType: source.source_type,
            sourceUrl: source.source_url,
          }}
        />
      </Card>
    </div>
  );
}
