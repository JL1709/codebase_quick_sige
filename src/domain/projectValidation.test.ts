import { describe, expect, it } from "vitest";
import { validateProjectForm } from "./projectValidation";

const validProject = {
  name: "Campus",
  participantsSectionName: "Project participants",
  overviewSectionOrder: ["system:project-participants", "section-1"],
  overviewSections: [{
    id: "section-1",
    name: "Project information",
    entries: [{ id: "entry-1", label: "Client", type: "text" as const, value: "Example Ltd", children: [], items: [] }],
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

  it("rejects section names that collide with other sections, participants, or built-in paths", () => {
    const section = validProject.overviewSections[0];
    for (const name of ["Name", "Plan", "Project participants"]) {
      expect(validateProjectForm({ ...validProject, overviewSections: [{ ...section, name }] }).success).toBe(false);
    }
    expect(validateProjectForm({ ...validProject, overviewSections: [section, { ...section, id: "other", name: "PROJECT INFORMATION" }] }).success).toBe(false);
  });

  it("allows the same field label in different groups but rejects duplicate siblings", () => {
    const field = validProject.overviewSections[0].entries[0];
    const group = { ...field, type: "group" as const, value: "", children: [field] };
    expect(validateProjectForm({ ...validProject, overviewSections: [{ ...validProject.overviewSections[0], entries: [{ ...group, id: "first", label: "Billing" }, { ...group, id: "second", label: "Site" }] }] }).success).toBe(true);
    expect(validateProjectForm({ ...validProject, overviewSections: [{ ...validProject.overviewSections[0], entries: [field, { ...field, id: "other", label: "CLIENT" }] }] }).success).toBe(false);
  });
});
