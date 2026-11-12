"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { profileEditSchema, GENDER_VALUES, type ProfileEditInput } from "@/lib/validation/profile";
import { updateProfileAction } from "./actions";
import { InputField, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";

type ReferenceOption = { id: string; name: string };

// Form-side values are always strings (native form fields), the schema's
// `z.coerce`/preprocess rules turn them into the typed ProfileEditInput on
// submit — same reasoning as the empty-string normalization in
// lib/validation/profile.ts.
type ProfileFormValues = {
  fullName: string;
  dateOfBirth: string;
  categoryId: string;
  stateId: string;
  domicileStateId: string;
  educationLevelId: string;
  gender: (typeof GENDER_VALUES)[number] | "";
  experienceYears: string;
};

const GENDER_LABELS: Record<(typeof GENDER_VALUES)[number], string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  prefer_not_to_say: "Prefer not to say",
};

export function ProfileForm({
  categories,
  states,
  educationLevels,
  defaultValues,
}: {
  categories: ReferenceOption[];
  states: ReferenceOption[];
  educationLevels: ReferenceOption[];
  defaultValues: ProfileFormValues;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues, unknown, ProfileEditInput>({
    // The schema normalizes empty-string form fields via z.preprocess, which
    // widens its declared input type to `unknown` for those fields — cast
    // back to the form's actual (all-string) shape rather than losing
    // client-side validation over a cosmetic type mismatch.
    resolver: zodResolver(profileEditSchema) as Resolver<
      ProfileFormValues,
      unknown,
      ProfileEditInput
    >,
    defaultValues,
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    setSuccess(false);
    const formData = new FormData();
    formData.set("fullName", data.fullName ?? "");
    formData.set("dateOfBirth", data.dateOfBirth);
    formData.set("categoryId", data.categoryId);
    formData.set("stateId", data.stateId);
    formData.set("domicileStateId", data.domicileStateId ?? "");
    formData.set("educationLevelId", data.educationLevelId);
    formData.set("gender", data.gender ?? "");
    formData.set(
      "experienceYears",
      data.experienceYears === undefined ? "" : String(data.experienceYears),
    );

    const result = await updateProfileAction({ status: "idle" }, formData);
    if (result.status === "error") {
      setServerError(result.message ?? "Something went wrong. Please try again.");
      return;
    }
    setSuccess(true);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <InputField
        id="fullName"
        label="Full name"
        error={errors.fullName?.message}
        {...register("fullName")}
      />
      <InputField
        id="dateOfBirth"
        label="Date of birth"
        type="date"
        error={errors.dateOfBirth?.message}
        {...register("dateOfBirth")}
      />
      <SelectField
        id="categoryId"
        label="Category"
        placeholder="Select your category"
        options={categories.map((c) => ({ value: c.id, label: c.name }))}
        error={errors.categoryId?.message}
        {...register("categoryId")}
      />
      <SelectField
        id="stateId"
        label="State"
        placeholder="Select your state"
        options={states.map((s) => ({ value: s.id, label: s.name }))}
        error={errors.stateId?.message}
        {...register("stateId")}
      />
      <SelectField
        id="domicileStateId"
        label="Domicile state (if different)"
        placeholder="Same as state above"
        options={states.map((s) => ({ value: s.id, label: s.name }))}
        error={errors.domicileStateId?.message}
        {...register("domicileStateId")}
      />
      <SelectField
        id="educationLevelId"
        label="Highest education level"
        placeholder="Select your education level"
        options={educationLevels.map((e) => ({ value: e.id, label: e.name }))}
        error={errors.educationLevelId?.message}
        {...register("educationLevelId")}
      />
      <SelectField
        id="gender"
        label="Gender (optional)"
        placeholder="Prefer not to specify"
        options={GENDER_VALUES.map((value) => ({ value, label: GENDER_LABELS[value] }))}
        error={errors.gender?.message}
        {...register("gender")}
      />
      <InputField
        id="experienceYears"
        label="Years of work experience (optional)"
        type="number"
        min={0}
        step="0.5"
        error={errors.experienceYears?.message}
        {...register("experienceYears")}
      />
      {serverError ? <FormMessage status="error" message={serverError} /> : null}
      {success ? <FormMessage status="success" message="Profile updated." /> : null}
      <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
