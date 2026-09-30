import { describe, expect, it } from "vitest";
import { validateProjectForm } from "./projectValidation";

const validProject = {
  name: "Campus",
  participantsSectionName: "Project participants",
  overviewSectionOrder: ["system:project-participants", "section-1"],
  overviewSections: [{
    id: "section-1",
    name: "Project information",
    placeholderKey: "project_information",
    entries: [{ id: "entry-1", label: "Client", placeholderKey: "client", type: "text" as const, value: "Example Ltd", children: [], items: [] }],
  }],
};

describe("project form validation", () => {
  it("accepts a named project with flexible overview sections", () => {
    expect(validateProjectForm(validProject).success).toBe(true);
  });

  it("rejects a missing project name", () => {
    expect(validateProjectForm({ ...validProject, name: "" }).success).toBe(false);
  });

  it("requires editable project section titles", () => {
    expect(validateProjectForm({ ...validProject, participantsSectionName: "" }).success).toBe(false);
    expect(validateProjectForm({
      ...validProject,
      overviewSections: [{ ...validProject.overviewSections[0], name: "" }],
    }).success).toBe(false);
  });

  it("preserves overview sections after validation", () => {
    const result = validateProjectForm(validProject);
    expect(result.success && result.data.overviewSections).toEqual(validProject.overviewSections);
  });
});
