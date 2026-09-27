import { z } from "zod";
import type { ProjectFormValues } from "./types";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const projectFormSchema = z.object({
  projectNumber: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000),
  address: z.string().trim().min(1).max(240),
  city: z.string().trim().min(1).max(160),
  constructionType: z.enum(["new_build", "renovation", "demolition"]),
  startDate: z.string().regex(ISO_DATE_PATTERN),
  endDate: z.string().regex(ISO_DATE_PATTERN),
  documentLocale: z.enum(["de", "en"]),
  templateIds: z.array(z.string().trim().min(1)).default([]),
}).refine((values) => values.endDate >= values.startDate, { path: ["endDate"], message: "end_before_start" });

export function validateProjectForm(values: ProjectFormValues) {
  return projectFormSchema.safeParse(values);
}
