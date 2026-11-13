import { z } from "zod";

/**
 * Language is validated for shape here; the database FK against
 * `supported_languages` is the authority on which codes actually exist, so
 * adding a language never requires a code change.
 */
export const updatePreferencesSchema = z.object({
  languageCode: z
    .string()
    .trim()
    .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/, "Invalid language"),
  inAppNotifications: z.boolean(),
  emailNotifications: z.boolean(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
