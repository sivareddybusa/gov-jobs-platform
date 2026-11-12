import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getOwnProfile, isProfileComplete } from "@/lib/auth/profile";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Complete your profile" };

export default async function OnboardingPage() {
  const { supabase, user } = await requireUser("/onboarding");
  const profile = await getOwnProfile(supabase, user.id);

  if (isProfileComplete(profile)) {
    redirect("/dashboard");
  }

  const [{ data: categories }, { data: states }, { data: educationLevels }] = await Promise.all([
    supabase.from("categories").select("id, name").eq("is_active", true).order("name"),
    supabase.from("states").select("id, name").eq("is_active", true).order("name"),
    supabase.from("education_levels").select("id, name").eq("is_active", true).order("rank"),
  ]);

  return (
    <div className="mx-auto max-w-md">
      <PageHeader
        title="Complete your profile"
        description="We use this to check which government jobs you may be eligible for, and to explain why. You're never required to share more than this."
      />
      <Card>
        <OnboardingForm
          categories={categories ?? []}
          states={states ?? []}
          educationLevels={educationLevels ?? []}
          defaultValues={{
            dateOfBirth: profile?.date_of_birth ?? "",
            categoryId: profile?.category_id ?? "",
            stateId: profile?.state_id ?? "",
            educationLevelId: profile?.education_level_id ?? "",
          }}
        />
      </Card>
    </div>
  );
}
