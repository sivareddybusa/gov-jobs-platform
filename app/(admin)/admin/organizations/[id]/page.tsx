import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/require-admin";
import { listActiveStates } from "@/db/reference-data";
import { getOrganizationById, listDepartments } from "@/db/admin/organizations";
import { OrganizationForm } from "../organization-form";
import { updateOrganizationAction } from "../actions";
import { DepartmentForm } from "./department-form";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Edit organization · Admin" };

export default async function EditOrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase } = await requireAdminRole("admin");
  const [organization, states, departments] = await Promise.all([
    getOrganizationById(supabase, id),
    listActiveStates(supabase),
    listDepartments(supabase, id),
  ]);
  if (!organization) notFound();

  const boundAction = updateOrganizationAction.bind(null, id);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-8">
      <div>
        <h1 className="mb-4 text-lg font-semibold text-gray-900">Edit organization</h1>
        <Card>
          <OrganizationForm
            action={boundAction}
            states={states}
            defaultValues={{
              name: organization.name,
              shortCode: organization.short_code ?? "",
              orgType: organization.org_type,
              stateId: organization.state_id ?? "",
              websiteUrl: organization.website_url ?? "",
            }}
          />
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Departments</h2>
        {departments.length > 0 ? (
          <ul className="mb-3 flex flex-col gap-2">
            {departments.map((d) => (
              <li key={d.id}>
                <Card className="p-3 text-sm text-gray-900">{d.name}</Card>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-sm text-gray-500">No departments yet.</p>
        )}
        <DepartmentForm organizationId={id} />
      </div>
    </div>
  );
}
