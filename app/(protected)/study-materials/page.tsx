import { requireUser } from "@/lib/auth/require-user";
import { SectionUnavailable } from "@/components/preparation/section-unavailable";

export const metadata = { title: "Study Materials" };

export default async function Page() {
  await requireUser("/study-materials");
  return (
    <SectionUnavailable
      title="Study Materials"
      description="Verified notes and reference material for your exam."
      detail="Materials are attached to an exam's syllabus once reviewed by our team."
    />
  );
}
