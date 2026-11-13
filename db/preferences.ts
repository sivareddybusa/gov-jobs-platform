import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type DB = SupabaseClient<Database>;

export type UserPreferencesRow = Database["public"]["Tables"]["user_preferences"]["Row"];
export type SupportedLanguageRow = Database["public"]["Tables"]["supported_languages"]["Row"];

export const DEFAULT_PREFERENCES = {
  language_code: "en",
  in_app_notifications: true,
  email_notifications: false,
} as const;

export async function getPreferences(
  db: DB,
  profileId: string,
): Promise<
  Pick<UserPreferencesRow, "language_code" | "in_app_notifications" | "email_notifications">
> {
  const { data } = await db
    .from("user_preferences")
    .select("language_code, in_app_notifications, email_notifications")
    .eq("profile_id", profileId)
    .maybeSingle();
  return data ?? { ...DEFAULT_PREFERENCES };
}

export async function listActiveLanguages(db: DB): Promise<SupportedLanguageRow[]> {
  const { data } = await db
    .from("supported_languages")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

export async function upsertPreferences(
  db: DB,
  profileId: string,
  prefs: { languageCode: string; inAppNotifications: boolean; emailNotifications: boolean },
): Promise<{ error: PostgrestError | null }> {
  const { error } = await db.from("user_preferences").upsert({
    profile_id: profileId,
    language_code: prefs.languageCode,
    in_app_notifications: prefs.inAppNotifications,
    email_notifications: prefs.emailNotifications,
    updated_at: new Date().toISOString(),
  });
  return { error };
}
