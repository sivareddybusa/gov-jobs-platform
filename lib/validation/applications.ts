import { z } from "zod";
import { APPLICATION_STATUSES } from "@/domain/applications";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const optionalDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null)
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date")
  .refine((v) => v === null || !Number.isNaN(Date.parse(v)), "Use a valid date");

export const trackApplicationSchema = z.object({
  jobPostId: z.uuid("Invalid job reference"),
});

export const updateApplicationSchema = z.object({
  applicationId: z.uuid("Invalid application reference"),
  status: z.enum(APPLICATION_STATUSES, "Choose a valid status"),
  appliedOn: optionalDate,
  applicationNumber: optionalText(100),
  notes: optionalText(2000),
});

export const removeApplicationSchema = z.object({
  applicationId: z.uuid("Invalid application reference"),
});

export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;
