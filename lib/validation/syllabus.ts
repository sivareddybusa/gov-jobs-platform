import { z } from "zod";
import type { SyllabusNode } from "@/domain/syllabus";

const name = z.string().trim().min(1).max(300);

/** What the LLM may return. Untrusted: validated, then pruned against the page text. */
export const syllabusExtractionSchema = z.object({
  hasSyllabus: z.boolean(),
  subjects: z
    .array(
      z.object({
        name,
        chapters: z
          .array(z.object({ name, topics: z.array(name).max(60).default([]) }))
          .max(60)
          .default([]),
      }),
    )
    .max(40)
    .default([]),
});
export type SyllabusExtraction = z.infer<typeof syllabusExtractionSchema>;

/** subjects -> chapters -> topics, as the generic tree the database function takes. */
export function extractionToTree(e: SyllabusExtraction): SyllabusNode[] {
  return e.subjects.map((s) => ({
    name: s.name,
    children: s.chapters.map((c) => ({
      name: c.name,
      children: c.topics.map((t) => ({ name: t })),
    })),
  }));
}
