"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { addStatusSchema, type AddStatusInput } from "@/lib/validation/profile";
import { addStatusAction, removeStatusAction } from "./actions";
import { SelectField } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Card } from "@/components/ui/card";
import { RemoveItemForm } from "./remove-item-form";
import type { ProfileStatusRow } from "@/db/profile-statuses";

type ReferenceOption = { id: string; name: string };

type StatusFormValues = { statusId: string };

export function StatusesSection({
  statusOptions,
  statuses,
}: {
  statusOptions: ReferenceOption[];
  statuses: ProfileStatusRow[];
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StatusFormValues, unknown, AddStatusInput>({
    resolver: zodResolver(addStatusSchema),
    defaultValues: { statusId: "" },
  });
  const [serverError, setServerError] = useState<string | null>(null);

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null);
    const formData = new FormData();
    formData.set("statusId", data.statusId);

    const result = await addStatusAction({ status: "idle" }, formData);
    if (result.status === "error") {
      setServerError(result.message ?? "Something went wrong. Please try again.");
      return;
    }
    reset();
    router.refresh();
  });

  return (
    <div className="flex flex-col gap-4">
      {statuses.length > 0 ? (
        <Card className="divide-y divide-gray-100 p-0">
          {statuses.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
              <p className="font-medium text-gray-900">{s.statuses?.name ?? "Status"}</p>
              <RemoveItemForm id={s.id} action={removeStatusAction} label="Remove" />
            </div>
          ))}
        </Card>
      ) : (
        <p className="text-sm text-gray-500">No special statuses added yet.</p>
      )}

      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-[var(--shadow-card)]"
      >
        <SelectField
          id="statusId"
          label="Add a special status"
          placeholder="Select a status"
          options={statusOptions.map((s) => ({ value: s.id, label: s.name }))}
          error={errors.statusId?.message}
          {...register("statusId")}
        />
        {serverError ? <FormMessage status="error" message={serverError} /> : null}
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {isSubmitting ? "Adding…" : "Add status"}
        </Button>
      </form>
    </div>
  );
}
