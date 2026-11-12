import { requireUser } from "@/lib/auth/require-user";
import { getProfileById } from "@/db/profiles";
import {
  listActiveCategories,
  listActiveStates,
  listActiveEducationLevels,
  listQualificationOptions,
  listActiveStatuses,
} from "@/db/reference-data";
import { listUserQualifications } from "@/db/user-qualifications";
import { listProfileStatuses } from "@/db/profile-statuses";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ProfileForm } from "./profile-form";
import { QualificationsSection } from "./qualifications-section";
import { StatusesSection } from "./statuses-section";

export const metadata = { title: "Your profile" };

// Distinct from /onboarding: onboarding is the one-time minimum-viable setup
// gate (task Phase 3), this is the ongoing editable profile (task Phase 4)
// covering the same fields plus the rest of PRD.md §7 (gender, experience,
// domicile state, qualifications, special statuses).
export default async function ProfilePage() {
  const { supabase, user } = await requireUser("/profile");

  const [profile, categories, states, educationLevels, qualificationOptions, statusOptions] =
    await Promise.all([
      getProfileById(supabase, user.id),
      listActiveCategories(supabase),
      listActiveStates(supabase),
      listActiveEducationLevels(supabase),
      listQualificationOptions(supabase),
      listActiveStatuses(supabase),
    ]);

  const [qualifications, statuses] = await Promise.all([
    listUserQualifications(supabase, user.id),
    listProfileStatuses(supabase, user.id),
  ]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-8">
      <PageHeader
        title="Your profile"
        description="Keep this up to date — it's what we use to check which government jobs you may be eligible for, and to explain why."
      />

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Profile details</h2>
        <Card>
          <ProfileForm
            categories={categories}
            states={states}
            educationLevels={educationLevels}
            defaultValues={{
              fullName: profile?.full_name ?? "",
              dateOfBirth: profile?.date_of_birth ?? "",
              categoryId: profile?.category_id ?? "",
              stateId: profile?.state_id ?? "",
              domicileStateId: profile?.domicile_state_id ?? "",
              educationLevelId: profile?.education_level_id ?? "",
              gender:
                (profile?.gender as "male" | "female" | "other" | "prefer_not_to_say" | "") ?? "",
              experienceYears:
                profile?.experience_years === null || profile?.experience_years === undefined
                  ? ""
                  : String(profile.experience_years),
            }}
          />
        </Card>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Qualifications</h2>
        <QualificationsSection
          qualificationOptions={qualificationOptions}
          qualifications={qualifications}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Special statuses</h2>
        <StatusesSection statusOptions={statusOptions} statuses={statuses} />
      </section>
    </div>
  );
}
