import { requireUser } from "@/lib/auth/require-user";
import { SectionUnavailable } from "@/components/preparation/section-unavailable";

export const metadata = { title: "My Study Plan" };

export default async function Page() {
  await requireUser("/study-plan");
  return (
    <SectionUnavailable
      title="My Study Plan"
      description="A schedule built around your exam, syllabus and available time."
      detail="Your plan is generated from the exam you are preparing for."
    />
  );
}
