import { requireUser } from "@/lib/auth/require-user";
import { SectionUnavailable } from "@/components/preparation/section-unavailable";

export const metadata = { title: "Mock Tests" };

export default async function Page() {
  await requireUser("/mock-tests");
  return (
    <SectionUnavailable
      title="Mock Tests"
      description="Timed, exam-pattern tests scored on the server."
      detail="Mock tests are published per exam after review."
    />
  );
}
