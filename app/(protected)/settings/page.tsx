import { requireUser } from "@/lib/auth/require-user";
import { getPreferences, listActiveLanguages } from "@/db/preferences";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser("/settings");
  const [prefs, languages] = await Promise.all([
    getPreferences(supabase, user.id),
    listActiveLanguages(supabase),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Language and notification preferences." />
      <Card className="max-w-xl">
        <SettingsForm
          languages={languages.map((l) => ({
            code: l.code,
            name: l.name,
            nativeName: l.native_name,
          }))}
          defaults={{
            languageCode: prefs.language_code,
            inAppNotifications: prefs.in_app_notifications,
            emailNotifications: prefs.email_notifications,
          }}
        />
      </Card>
    </div>
  );
}
