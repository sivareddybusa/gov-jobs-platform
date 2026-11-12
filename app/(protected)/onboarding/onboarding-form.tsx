"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { onboardingSchema, type OnboardingInput } from "@/lib/validation/onboarding";
import { updateOnboardingAction } from "./actions";
import { InputField, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";

type ReferenceOption = { id: string; name: string };

export function OnboardingForm({
  categories,
  states,
  educationLevels,
  defaultValues,
}: {
  categories: ReferenceOption[];
  states: ReferenceOption[];
  educationLevels: ReferenceOption[];
  defaultValues: OnboardingInput;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues,
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    const formData = new FormData();
    formData.set("dateOfBirth", data.dateOfBirth);
    formData.set("categoryId", data.categoryId);
    formData.set("stateId", data.stateId);
    formData.set("educationLevelId", data.educationLevelId);

    const result = await updateOnboardingAction({ status: "idle" }, formData);
    if (result.status === "error") {
      setServerError(result.message ?? "Something went wrong. Please try again.");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
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
        id="educationLevelId"
        label="Highest education level"
        placeholder="Select your education level"
        options={educationLevels.map((e) => ({ value: e.id, label: e.name }))}
        error={errors.educationLevelId?.message}
        {...register("educationLevelId")}
      />
      {serverError ? <FormMessage status="error" message={serverError} /> : null}
      <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
        {isSubmitting ? "Saving…" : "Save and continue"}
      </Button>
    </form>
  );
}
