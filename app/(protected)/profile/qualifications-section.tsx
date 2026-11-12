"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addQualificationSchema, type AddQualificationInput } from "@/lib/validation/profile";
import { addQualificationAction, removeQualificationAction } from "./actions";
import { InputField, SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Card } from "@/components/ui/card";
import { RemoveItemForm } from "./remove-item-form";
import type { UserQualificationRow } from "@/db/user-qualifications";

type ReferenceOption = { id: string; name: string };

type QualificationFormValues = {
  qualificationId: string;
  institution: string;
  yearCompleted: string;
};

export function QualificationsSection({
  qualificationOptions,
  qualifications,
}: {
  qualificationOptions: ReferenceOption[];
  qualifications: UserQualificationRow[];
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<QualificationFormValues, unknown, AddQualificationInput>({
    // See profile-form.tsx's comment: the schema's z.preprocess widens its
    // declared input type to `unknown` for the optional fields.
    resolver: zodResolver(addQualificationSchema) as Resolver<
      QualificationFormValues,
      unknown,
      AddQualificationInput
    >,
    defaultValues: { qualificationId: "", institution: "", yearCompleted: "" },
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    const formData = new FormData();
    formData.set("qualificationId", data.qualificationId);
    formData.set("institution", data.institution ?? "");
    formData.set(
      "yearCompleted",
      data.yearCompleted === undefined ? "" : String(data.yearCompleted),
    );

    const result = await addQualificationAction({ status: "idle" }, formData);
    if (result.status === "error") {
      setServerError(result.message ?? "Something went wrong. Please try again.");
      return;
    }
    reset();
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-4">
      {qualifications.length > 0 ? (
        <Card className="divide-y divide-gray-100 p-0">
          {qualifications.map((q) => (
            <div key={q.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <p className="font-medium text-gray-900">
                  {q.qualifications?.name ?? "Qualification"}
                </p>
                {q.institution || q.year_completed ? (
                  <p className="text-xs text-gray-500">
                    {[q.institution, q.year_completed].filter(Boolean).join(" · ")}
                  </p>
                ) : null}
              </div>
              <RemoveItemForm id={q.id} action={removeQualificationAction} label="Remove" />
            </div>
          ))}
        </Card>
      ) : (
        <p className="text-sm text-gray-500">No qualifications added yet.</p>
      )}

      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-card)]"
      >
        <SelectField
          id="qualificationId"
          label="Add a qualification"
          placeholder="Select a qualification"
          options={qualificationOptions.map((q) => ({ value: q.id, label: q.name }))}
          error={errors.qualificationId?.message}
          {...register("qualificationId")}
        />
        <InputField
          id="institution"
          label="Institution (optional)"
          error={errors.institution?.message}
          {...register("institution")}
        />
        <InputField
          id="yearCompleted"
          label="Year completed (optional)"
          type="number"
          error={errors.yearCompleted?.message}
          {...register("yearCompleted")}
        />
        {serverError ? <FormMessage status="error" message={serverError} /> : null}
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? "Adding…" : "Add qualification"}
        </Button>
      </form>
    </div>
  );
}
