import { describe, expect, it } from "vitest";
import { validateProjectForm } from "./projectValidation";

const validProject = {
  projectNumber: "QS-100",
  name: "Campus",
  description: "New building",
  address: "Test Street 1",
  city: "Berlin",
  constructionType: "new_build" as const,
  startDate: "2026-10-01",
  endDate: "2027-03-01",
  documentLocale: "en" as const,
  templateIds: ["overview-template-standard"],
};

describe("project form validation", () => {
  it("accepts a complete chronological project", () => {
    expect(validateProjectForm(validProject).success).toBe(true);
  });

  it("rejects missing and reversed dates", () => {
    expect(validateProjectForm({ ...validProject, endDate: "" }).success).toBe(false);
    expect(validateProjectForm({ ...validProject, endDate: "2026-09-30" }).success).toBe(false);
  });

  it("preserves selected overview templates after validation", () => {
    const result = validateProjectForm(validProject);
    expect(result.success && result.data.templateIds).toEqual(["overview-template-standard"]);
  });
});
