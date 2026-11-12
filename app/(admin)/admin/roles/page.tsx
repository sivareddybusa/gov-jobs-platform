import { requireAdminRole } from "@/lib/auth/require-admin";
import { listRoleAssignments } from "@/db/admin/roles";
import { GrantRoleForm, RevokeRoleButton } from "./role-forms";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Admin roles · Admin" };

export default async function RolesPage() {
  const { supabase } = await requireAdminRole("super_admin");
  const assignments = await listRoleAssignments(supabase);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <PageHeader
        title="Admin roles"
        description="Grant/revoke admin roles. Reviewer < editor < admin < super_admin."
      />

      {assignments.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {assignments.map((a) => (
            <li key={a.id}>
              <Card className="flex items-center justify-between p-3.5">
                <div>
                  <p className="font-mono text-xs text-gray-500">{a.user_id}</p>
                  <Badge tone="brand" className="mt-1">
                    {a.role_code}
                  </Badge>
                </div>
                <RevokeRoleButton id={a.id} />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-500">No admin role assignments yet.</p>
      )}

      <GrantRoleForm />
    </div>
  );
}
