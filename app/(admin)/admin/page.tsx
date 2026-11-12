import { PageHeader } from "@/components/ui/page-header";

export const metadata = { title: "Admin" };

export default function AdminOverviewPage() {
  return (
    <div>
      <PageHeader
        title="Admin overview"
        description="Manage organizations, sources, job notifications, eligibility rules, and admin roles. Each section enforces its own minimum role server-side — links you don't have permission for will redirect you back to the dashboard."
      />
    </div>
  );
}
