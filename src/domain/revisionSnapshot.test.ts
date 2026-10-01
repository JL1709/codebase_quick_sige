import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { buildRevisionSnapshot } from "./revisionSnapshot";

describe("revision snapshots", () => {
  it("remain independent from later project, plan, catalog, and template mutations", () => {
    const database = createSeedDatabase();
    const project = database.projects[0];
    const plan = database.plans.find((candidate) => candidate.projectId === project.id);
    expect(plan).toBeDefined();
    const snapshot = buildRevisionSnapshot(database, project, plan!);
    const originalProjectName = snapshot.project.name;
    const originalPlanStatus = snapshot.plan.status;
    const originalBlockTitle = snapshot.blocks[0].translations.de.title;
    const originalTemplateName = snapshot.documentTemplates[0].name;

    project.name = "Changed after publication";
    plan!.status = "published";
    database.blocks.find((block) => block.id === snapshot.blocks[0].id)!.translations.de.title = "Changed catalog content";
    database.documentTemplates.find((template) => template.id === snapshot.documentTemplates[0].id)!.name = "Changed template";

    expect(snapshot.project.name).toBe(originalProjectName);
    expect(snapshot.plan.status).toBe(originalPlanStatus);
    expect(snapshot.blocks[0].translations.de.title).toBe(originalBlockTitle);
    expect(snapshot.documentTemplates[0].name).toBe(originalTemplateName);
  });

  it("includes only blocks used by the published plan", () => {
    const database = createSeedDatabase();
    const project = database.projects[0];
    const plan = database.plans.find((candidate) => candidate.projectId === project.id)!;
    const usedIds = new Set(plan.sections.flatMap((section) => section.items.map((item) => item.blockId)));
    const snapshot = buildRevisionSnapshot(database, project, plan);

    expect(snapshot.blocks.every((block) => usedIds.has(block.id))).toBe(true);
    expect(snapshot.blocks).toHaveLength(usedIds.size);
  });

  it("retains an archived template when the published project references it", () => {
    const database = createSeedDatabase();
    const project = database.projects[0];
    const plan = database.plans.find((candidate) => candidate.projectId === project.id)!;
    const configuration = {
      id: "configuration-archived-template",
      projectId: project.id,
      documentType: "a4_plan" as const,
      templateId: "standard-a4_plan-de",
    };
    database.documentConfigurations.push(configuration);
    const template = database.documentTemplates.find((candidate) => candidate.id === configuration.templateId)!;
    template.lifecycle = "archived";

    const snapshot = buildRevisionSnapshot(database, project, plan);

    expect(snapshot.documentTemplates.map((candidate) => candidate.id)).toContain(template.id);
  });

  it("captures resolved contact values so later directory edits cannot rewrite history", () => {
    const database = createSeedDatabase();
    const project = database.projects[0];
    const plan = database.plans.find((candidate) => candidate.projectId === project.id)!;
    const assignment = database.projectContactAssignments.find((candidate) => candidate.projectId === project.id)!;
    const contact = database.contacts.find((candidate) => candidate.id === assignment.contactId)!;
    const snapshot = buildRevisionSnapshot(database, project, plan);
    const capturedParticipant = snapshot.project.participants.find((participant) => participant.role === assignment.roles[0].role)!;

    contact.prefix = "";
    contact.givenName = "Changed live";
    contact.familyName = "contact";
    contact.emails[0].value = "changed@example.com";
    const currentSnapshot = buildRevisionSnapshot(database, project, plan);

    expect(snapshot.project.participants).toContainEqual(capturedParticipant);
    expect(snapshot.project.participants.some((participant) => participant.name === "Changed live contact")).toBe(false);
    expect(currentSnapshot.project.participants.some((participant) => participant.name === "Changed live contact" && participant.email === "changed@example.com")).toBe(true);
  });
});
