import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { updatePreferencesSchema } from "@/lib/validation/preferences";
import { upsertPreferences } from "@/db/preferences";
import type { ServiceResult } from "@/services/profile/types";

export async function updatePreferencesUseCase(
  db: SupabaseClient<Database>,
  userId: string,
  input: unknown,
): Promise<ServiceResult> {
  const parsed = updatePreferencesSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { error } = await upsertPreferences(db, userId, parsed.data);
  // An unknown language code is rejected by the FK to supported_languages.
  if (error) return { success: false, error: "Could not save your settings." };
  return { success: true };
}
