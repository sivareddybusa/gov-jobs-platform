import { requireUser } from "@/lib/auth/require-user";
import { SectionUnavailable } from "@/components/preparation/section-unavailable";

export const metadata = { title: "Practice Questions" };

export default async function Page() {
  await requireUser("/practice");
  return (
    <SectionUnavailable
      title="Practice Questions"
      description="Topic-wise practice with instant feedback."
      detail="Questions are drawn from reviewed question banks for your exam."
    />
  );
}
