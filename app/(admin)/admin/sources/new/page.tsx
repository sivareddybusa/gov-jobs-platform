import { requireAdminRole } from "@/lib/auth/require-admin";
import { listOrganizations } from "@/db/admin/organizations";
import { SourceForm } from "../source-form";
import { createJobSourceAction } from "../actions";
import { Card } from "@/components/ui/card";

export const metadata = { title: "New source · Admin" };

export default async function NewSourcePage() {
  const { supabase } = await requireAdminRole("admin");
  const organizations = await listOrganizations(supabase);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">New source</h1>
      <Card>
        <SourceForm action={createJobSourceAction} organizations={organizations} />
      </Card>
    </div>
  );
}
