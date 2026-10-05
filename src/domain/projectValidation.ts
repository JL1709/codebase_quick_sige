import { z } from "zod";
import type { ProjectFormValues } from "./types";
import { invalidProjectSectionIds } from "./projectOverview";
import { invalidSiblingNameIds } from "./placeholderNames";

const projectOverviewEntrySchema: z.ZodType<ProjectFormValues["overviewSections"][number]["entries"][number]> = z.lazy(() => z.object({
  id: z.string().trim().min(1),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["text", "date", "group", "repeating_group"]),
  value: z.string().max(10_000),
  children: z.array(projectOverviewEntrySchema),
  items: z.array(z.array(projectOverviewEntrySchema)),
}).superRefine((entry, context) => {
  if (invalidSiblingNameIds(entry.children.map((child) => ({ id: child.id, name: child.label }))).size) {
    context.addIssue({ code: "custom", message: "Field names must produce unique placeholders within their group.", path: ["children"] });
  }
}));

export const projectFormSchema = z.object({
  name: z.string().trim().min(1).max(160),
  participantsSectionName: z.string().trim().min(1).max(160),
  overviewSections: z.array(z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1).max(160),
    entries: z.array(projectOverviewEntrySchema),
  })),
  overviewSectionOrder: z.array(z.string().trim().min(1)),
}).superRefine((project, context) => {
  if (invalidProjectSectionIds(project).size) context.addIssue({ code: "custom", message: "Section names must produce unique project placeholders.", path: ["overviewSections"] });
  project.overviewSections.forEach((section, index) => {
    if (invalidSiblingNameIds(section.entries.map((entry) => ({ id: entry.id, name: entry.label }))).size) {
      context.addIssue({ code: "custom", message: "Field names must produce unique placeholders within their section.", path: ["overviewSections", index, "entries"] });
    }
  });
});

export function validateProjectForm(values: ProjectFormValues) {
  return projectFormSchema.safeParse(values);
}
