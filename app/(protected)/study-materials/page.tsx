import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { listExamTargets } from "@/db/exam-targets";
import { listMaterialsByKind } from "@/db/materials";
import { MaterialList, hasMaterials } from "@/components/preparation/material-list";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Study Materials" };

export default async function StudyMaterialsPage() {
  const { supabase, user } = await requireUser("/study-materials");
  const targets = (await listExamTargets(supabase, user.id)).filter(
    (t) => t.status === "active" && t.exams && t.exams.status === "published",
  );
  const withMaterials = await Promise.all(
    targets.map(async (t) => ({
      target: t,
      grouped: await listMaterialsByKind(supabase, t.exam_id),
    })),
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Study Materials"
        description="Official documents for the exams you are preparing for: notifications, syllabus, sample papers and guidance."
      />
      {withMaterials.length === 0 ? (
        <EmptyState
          title="Choose an exam first"
          description="Official documents are shown for the exams you are preparing for."
          action={
            <Link href="/preparation/exams">
              <Button fullWidth={false} className="px-5">
                Find an Exam
              </Button>
            </Link>
          }
        />
      ) : (
        withMaterials.map(({ target, grouped }) => (
          <section key={target.id}>
            <h2 className="mb-3 text-sm font-semibold text-gray-900">
              <Link
                href={`/preparation/exams/${target.exams!.slug}`}
                className="hover:text-brand-700"
              >
                {target.exams!.name}
              </Link>
            </h2>
            {hasMaterials(grouped) ? (
              <Card>
                <MaterialList grouped={grouped} />
              </Card>
            ) : (
              <Card className="text-sm text-gray-500">
                No official documents have been collected for this exam yet. They appear here
                automatically once found.
              </Card>
            )}
          </section>
        ))
      )}
    </div>
  );
}
