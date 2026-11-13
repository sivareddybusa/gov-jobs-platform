import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Honest shell for preparation sections whose content features are still being
 * built. It states plainly that the feature is not live yet and points to the
 * one real next step, instead of showing fake data or inert controls.
 */
export function SectionUnavailable({
  title,
  description,
  detail,
}: {
  title: string;
  description: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} />
      <EmptyState
        title="Not available yet"
        description={`${detail} This section is under development and is not live yet.`}
        action={
          <Link href="/preparation/exams">
            <Button fullWidth={false} className="px-5">
              Find an Exam
            </Button>
          </Link>
        }
      />
    </div>
  );
}
