"use client";

import { useActionState } from "react";
import { initialActionState } from "@/lib/auth/action-state";
import { SelectField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { FormMessage } from "@/components/ui/form-message";
import { updatePreferencesAction } from "./actions";

export function SettingsForm({
  languages,
  defaults,
}: {
  languages: Array<{ code: string; name: string; nativeName: string }>;
  defaults: { languageCode: string; inAppNotifications: boolean; emailNotifications: boolean };
}) {
  const [state, formAction] = useActionState(updatePreferencesAction, initialActionState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <SelectField
        id="languageCode"
        name="languageCode"
        label="Preferred language"
        defaultValue={defaults.languageCode}
        options={languages.map((l) => ({
          value: l.code,
          label: l.name === l.nativeName ? l.name : `${l.name} (${l.nativeName})`,
        }))}
      />
      <p className="-mt-3 text-xs text-gray-500">
        Interface and content translations are being added. Your choice is saved and will apply as
        each language becomes available.
      </p>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium text-gray-700">Notifications</legend>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="inAppNotifications"
            defaultChecked={defaults.inAppNotifications}
            className="mt-0.5"
          />
          <span>In-app notifications</span>
        </label>
        <label className="flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            name="emailNotifications"
            defaultChecked={defaults.emailNotifications}
            className="mt-0.5"
          />
          <span>
            Email notifications
            <span className="block text-xs text-gray-500">
              Your choice is saved now; email delivery will start once it is enabled.
            </span>
          </span>
        </label>
      </fieldset>
      {state.status === "error" ? (
        <FormMessage status="error" message={state.message ?? "Something went wrong."} />
      ) : null}
      {state.status === "success" ? (
        <FormMessage status="success" message={state.message ?? "Saved."} />
      ) : null}
      <SubmitButton pendingLabel="Saving…" fullWidth={false} className="self-start px-5">
        Save settings
      </SubmitButton>
    </form>
  );
}
