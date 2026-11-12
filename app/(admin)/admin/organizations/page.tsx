import Link from "next/link";
import { requireAdminRole } from "@/lib/auth/require-admin";
import { listOrganizations } from "@/db/admin/organizations";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Organizations · Admin" };

export default async function OrganizationsPage() {
  const { supabase } = await requireAdminRole("reviewer");
  const organizations = await listOrganizations(supabase);

  return (
    <div>
      <PageHeader
        title="Organizations"
        actions={
          <Link href="/admin/organizations/new">
            <Button fullWidth={false}>+ New organization</Button>
          </Link>
        }
      />
      {organizations.length === 0 ? (
        <p className="text-sm text-gray-500">No organizations yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {organizations.map((org) => (
            <li key={org.id}>
              <Card className="flex items-center justify-between gap-2 p-3.5">
                <Link
                  href={`/admin/organizations/${org.id}`}
                  className="text-sm font-medium text-gray-900 hover:text-brand-700"
                >
                  {org.name}
                </Link>
                <div className="flex items-center gap-2">
                  <Badge>{org.org_type}</Badge>
                  {!org.is_active ? <Badge tone="red">inactive</Badge> : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
