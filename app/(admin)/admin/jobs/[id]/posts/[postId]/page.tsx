import { notFound } from "next/navigation";
import { requireAdminRole } from "@/lib/auth/require-admin";
import {
  listActiveCategories,
  listActiveStatuses,
  listActiveStates,
  listQualificationOptions,
  listActiveEducationLevels,
} from "@/db/reference-data";
import { getJobPostById } from "@/db/admin/job-notifications";
import * as rules from "@/db/admin/eligibility-rules";
import { JobPostForm } from "../../../job-post-form";
import { updateJobPostFieldsAction } from "./rules-actions";
import {
  AgeRuleForm,
  RelaxationsSection,
  StatusRequirementsSection,
  StateScopeSection,
  GenderRuleForm,
  ExperienceRuleForm,
  QualificationRequirementsSection,
} from "./rules-forms";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Job post eligibility rules · Admin" };

export default async function JobPostRulesPage({
  params,
}: {
  params: Promise<{ id: string; postId: string }>;
}) {
  const { id, postId } = await params;
  const { supabase } = await requireAdminRole("reviewer");
  const post = await getJobPostById(supabase, postId);
  if (!post || post.job_notification_id !== id) notFound();

  const [
    categories,
    statuses,
    states,
    qualifications,
    educationLevels,
    ageRule,
    relaxations,
    statusRequirements,
    stateScope,
    genderRule,
    experienceRule,
    qualificationRequirements,
  ] = await Promise.all([
    listActiveCategories(supabase),
    listActiveStatuses(supabase),
    listActiveStates(supabase),
    listQualificationOptions(supabase),
    listActiveEducationLevels(supabase),
    rules.getAgeRule(supabase, postId),
    rules.listRelaxations(supabase, postId),
    rules.listStatusRequirements(supabase, postId),
    rules.getStateScope(supabase, postId),
    rules.getGenderRule(supabase, postId),
    rules.getExperienceRule(supabase, postId),
    rules.listQualificationRequirements(supabase, postId),
  ]);

  const scopeStates = stateScope ? await rules.listStateScopeStates(supabase, stateScope.id) : [];
  const boundPostAction = updateJobPostFieldsAction.bind(null, id, postId);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <div>
        <h1 className="mb-4 text-lg font-semibold text-gray-900">{post.title}</h1>
        <Card>
          <JobPostForm
            action={boundPostAction}
            defaultValues={{
              title: post.title,
              vacancyCount: post.vacancy_count?.toString() ?? "",
              payScaleMin: post.pay_scale_min?.toString() ?? "",
              payScaleMax: post.pay_scale_max?.toString() ?? "",
              payScaleNote: post.pay_scale_note ?? "",
            }}
          />
        </Card>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Age rule</h2>
        <AgeRuleForm
          jobNotificationId={id}
          postId={postId}
          defaultValues={
            ageRule
              ? {
                  minAge: ageRule.min_age?.toString() ?? "",
                  maxAge: ageRule.max_age?.toString() ?? "",
                  ageCutoffDate: ageRule.age_cutoff_date,
                  relaxationCombinationMode: ageRule.relaxation_combination_mode,
                }
              : undefined
          }
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">
          Age/category/status relaxations
        </h2>
        <RelaxationsSection
          jobNotificationId={id}
          postId={postId}
          relaxations={relaxations}
          categories={categories}
          statuses={statuses}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Status-gated eligibility</h2>
        <StatusRequirementsSection
          jobNotificationId={id}
          postId={postId}
          requirements={statusRequirements}
          statuses={statuses}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">State / domicile scope</h2>
        <StateScopeSection
          jobNotificationId={id}
          postId={postId}
          stateScope={stateScope}
          scopeStates={scopeStates}
          states={states}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Gender rule</h2>
        <GenderRuleForm
          jobNotificationId={id}
          postId={postId}
          defaultValue={genderRule?.allowed_gender}
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Experience rule</h2>
        <ExperienceRuleForm
          jobNotificationId={id}
          postId={postId}
          defaultValues={
            experienceRule
              ? {
                  minYears: experienceRule.min_years?.toString() ?? "",
                  maxYears: experienceRule.max_years?.toString() ?? "",
                  domainNote: experienceRule.domain_note ?? "",
                  asOfDate: experienceRule.as_of_date ?? "",
                }
              : undefined
          }
        />
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">Qualification requirements</h2>
        <QualificationRequirementsSection
          jobNotificationId={id}
          postId={postId}
          requirements={qualificationRequirements}
          qualifications={qualifications}
          educationLevels={educationLevels}
        />
      </section>
    </div>
  );
}
