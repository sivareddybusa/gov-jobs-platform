import { requireUser } from "@/lib/auth/require-user";
import { SectionUnavailable } from "@/components/preparation/section-unavailable";

export const metadata = { title: "Performance Analytics" };

export default async function Page() {
  await requireUser("/performance");
  return (
    <SectionUnavailable
      title="Performance Analytics"
      description="Track accuracy, speed and weak topics over time."
      detail="Analytics appear after you attempt practice questions or mock tests."
    />
  );
}
