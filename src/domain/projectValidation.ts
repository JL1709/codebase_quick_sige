import { z } from "zod";
import type { ProjectFormValues } from "./types";

const projectOverviewEntrySchema: z.ZodType<ProjectFormValues["overviewSections"][number]["entries"][number]> = z.lazy(() => z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(160),
  placeholderKey: z.string().trim().min(1),
  type: z.enum(["text", "date", "group", "repeating_group"]),
  value: z.string().max(10_000),
  children: z.array(projectOverviewEntrySchema),
  items: z.array(z.array(projectOverviewEntrySchema)),
}));

export const projectFormSchema = z.object({
  name: z.string().trim().min(1).max(160),
  overviewSections: z.array(z.object({
    id: z.string().trim().min(1),
    templateId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).max(160),
    placeholderKey: z.string().trim().min(1),
    entries: z.array(projectOverviewEntrySchema),
  })),
});

export function validateProjectForm(values: ProjectFormValues) {
  return projectFormSchema.safeParse(values);
}
