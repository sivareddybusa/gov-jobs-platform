import { requireAdminRole } from "@/lib/auth/require-admin";
import { listActiveStates } from "@/db/reference-data";
import { OrganizationForm } from "../organization-form";
import { createOrganizationAction } from "../actions";
import { Card } from "@/components/ui/card";

export const metadata = { title: "New organization · Admin" };

export default async function NewOrganizationPage() {
  const { supabase } = await requireAdminRole("admin");
  const states = await listActiveStates(supabase);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">New organization</h1>
      <Card>
        <OrganizationForm action={createOrganizationAction} states={states} />
      </Card>
    </div>
  );
}
