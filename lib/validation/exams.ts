import { z } from "zod";
import { EXAM_CATEGORIES } from "@/domain/exams";

const emptyToUndefined = (value: unknown) =>
  value === null || (typeof value === "string" && value.trim() === "") ? undefined : value;

/**
 * What the AI extractor may return about an exam page. Untrusted: validated
 * here, then cross-checked against the page text in services/exams/sync.ts.
 * The official website URL is deliberately NOT part of it — we derive that
 * from the page we actually fetched, never from model output.
 */
export const examExtractionSchema = z.object({
  isExamPage: z.boolean(),
  name: z.string().trim().min(1).max(300),
  shortName: z.preprocess(emptyToUndefined, z.string().trim().max(60).nullish()),
  category: z.enum(EXAM_CATEGORIES),
  description: z.preprocess(emptyToUndefined, z.string().trim().max(4000).nullish()),
});
export type ExamExtraction = z.infer<typeof examExtractionSchema>;

export const examTransitionSchema = z.object({
  examId: z.uuid("Invalid exam"),
  action: z.enum(["publish", "unpublish", "archive"]),
});

export const startTargetSchema = z.object({
  examId: z.uuid("Invalid exam"),
  targetYear: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(2000).max(2100).optional(),
  ),
});

export const targetActionSchema = z.object({
  targetId: z.uuid("Invalid target"),
  action: z.enum(["make_primary", "pause", "resume", "remove"]),
});

export const examSearchParamsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(EXAM_CATEGORIES).optional(),
});
