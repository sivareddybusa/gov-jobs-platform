import Link from "next/link";
import { requireAdminRole } from "@/lib/auth/require-admin";
import { listJobSources } from "@/db/admin/job-sources";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Sources · Admin" };

export default async function SourcesPage() {
  const { supabase } = await requireAdminRole("reviewer");
  const sources = await listJobSources(supabase);

  return (
    <div>
      <PageHeader
        title="Sources"
        actions={
          <Link href="/admin/sources/new">
            <Button fullWidth={false}>+ New source</Button>
          </Link>
        }
      />
      {sources.length === 0 ? (
        <p className="text-sm text-gray-500">No sources yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sources.map((s) => (
            <li key={s.id}>
              <Card className="flex items-center justify-between gap-2 p-3.5">
                <Link
                  href={`/admin/sources/${s.id}`}
                  className="text-sm font-medium text-gray-900 hover:text-brand-700"
                >
                  {s.name}
                </Link>
                <span className="text-xs text-gray-500">{s.official_domain}</span>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
