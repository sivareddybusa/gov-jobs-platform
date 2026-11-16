import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getPublishedExamBySlug } from "@/db/exams";
import { getTargetForExam } from "@/db/exam-targets";
import { getSyllabus } from "@/db/syllabus";
import { listMaterialsByKind } from "@/db/materials";
import { MaterialList, hasMaterials } from "@/components/preparation/material-list";
import { SyllabusTree } from "@/components/preparation/syllabus-tree";
import { searchPublishedNotifications } from "@/db/jobs";
import { summarizeNotificationEligibility } from "@/services/jobs/notification-eligibility";
import { EXAM_CATEGORY_LABELS } from "@/domain/exams";
import type { ExamCategory } from "@/domain/exams";
import { JobCard } from "@/components/jobs/job-card";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StartPreparingForm } from "../../start-preparing-form";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `${slug.replace(/-/g, " ")} · Exam` };
}

export default async function ExamDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, user } = await requireUser(`/preparation/exams/${slug}`);
  const exam = await getPublishedExamBySlug(supabase, slug);
  if (!exam) notFound();

  const [target, notifications, syllabus, materials] = await Promise.all([
    getTargetForExam(supabase, user.id, exam.id),
    exam.organization_id
      ? searchPublishedNotifications(supabase, { organizationId: exam.organization_id, limit: 6 })
      : Promise.resolve([]),
    getSyllabus(supabase, exam.id),
    listMaterialsByKind(supabase, exam.id),
  ]);
  const statusById = await summarizeNotificationEligibility(supabase, user.id, notifications);
  const preparing = target?.status === "active";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/preparation/exams"
        className="text-sm font-medium text-brand-600 hover:underline"
      >
        ← All exams
      </Link>
      <PageHeader
        title={exam.name}
        description={`${EXAM_CATEGORY_LABELS[exam.category as ExamCategory]}${
          exam.organizations ? ` · ${exam.organizations.name}` : ""
        }`}
        actions={<Badge tone="green">Verified</Badge>}
      />

      <Card className="flex flex-col gap-3">
        {exam.description ? <p className="text-sm text-gray-700">{exam.description}</p> : null}
        <div className="flex flex-wrap gap-4 text-sm">
          {exam.official_website_url ? (
            <a
              href={exam.official_website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-600 hover:underline"
            >
              Official website ↗
            </a>
          ) : null}
          {exam.source_url ? (
            <a
              href={exam.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-brand-600 hover:underline"
            >
              Source ↗
            </a>
          ) : null}
        </div>
        <div className="border-t border-gray-100 pt-3">
          {preparing ? (
            <p className="text-sm text-gray-700">
              You are preparing for this exam.{" "}
              <Link href="/preparation" className="font-medium text-brand-600 hover:underline">
                Manage in My Preparation
              </Link>
            </p>
          ) : (
            <StartPreparingForm examId={exam.id} />
          )}
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">
          Live notifications from {exam.organizations?.name ?? "the conducting body"}
        </h2>
        {notifications.length === 0 ? (
          <Card className="text-sm text-gray-500">
            No published notifications for this exam&apos;s organization right now.
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {notifications.map((n) => (
              <JobCard key={n.id} notification={n} eligibilityStatus={statusById.get(n.id)} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Syllabus</h2>
        {syllabus.total > 0 ? (
          <Card className="flex flex-col gap-3">
            <SyllabusTree tree={syllabus.tree} />
            <p className="border-t border-gray-100 pt-3 text-xs text-gray-500">
              Collected automatically from{" "}
              {syllabus.sourceUrl ? (
                <a
                  href={syllabus.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-brand-600 hover:underline"
                >
                  the official page ↗
                </a>
              ) : (
                "an official page"
              )}
              {syllabus.syncedAt
                ? ` on ${new Date(syllabus.syncedAt).toLocaleDateString("en-IN")}`
                : ""}
              . Always confirm against the latest official notification.
            </p>
          </Card>
        ) : (
          <Card className="text-sm text-gray-500">
            The syllabus for this exam hasn&apos;t been found on an official page yet. It appears
            here automatically once it is.
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Official documents</h2>
        {hasMaterials(materials) ? (
          <Card>
            <MaterialList grouped={materials} />
          </Card>
        ) : (
          <Card className="text-sm text-gray-500">
            No official documents have been collected for this exam yet. They appear here
            automatically once found.
          </Card>
        )}
      </section>

      <Card className="text-sm text-gray-500">
        Practice questions and mock tests for this exam are added in upcoming releases and will
        appear here once verified.
      </Card>
    </div>
  );
}
