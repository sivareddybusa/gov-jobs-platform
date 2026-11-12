import { requireAdminRole } from "@/lib/auth/require-admin";
import { JobPostForm } from "../../../job-post-form";
import { createJobPostAction } from "../../../actions";
import { Card } from "@/components/ui/card";

export const metadata = { title: "New job post · Admin" };

export default async function NewJobPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminRole("editor");
  const boundAction = createJobPostAction.bind(null, id);

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">New job post</h1>
      <Card>
        <JobPostForm action={boundAction} />
      </Card>
    </div>
  );
}
