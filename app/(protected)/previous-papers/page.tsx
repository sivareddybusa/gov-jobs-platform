import { requireUser } from "@/lib/auth/require-user";
import { SectionUnavailable } from "@/components/preparation/section-unavailable";

export const metadata = { title: "Previous Year Papers" };

export default async function Page() {
  await requireUser("/previous-papers");
  return (
    <SectionUnavailable
      title="Previous Year Papers"
      description="Authentic past papers with source details."
      detail="Only papers with a verifiable source are published."
    />
  );
}
