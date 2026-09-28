import { describe, expect, it } from "vitest";
import { flattenOverviewEntries, localizeOverviewTemplate } from "../domain/overviewTemplates";
import { createSeedDatabase } from "./seed";

describe("seed data", () => {
  it("provides localized starter content without internal review metadata", () => {
    const database = createSeedDatabase();
    expect(database.blocks.length).toBeGreaterThanOrEqual(15);
    for (const block of database.blocks) {
      expect(block).not.toHaveProperty("code");
      expect(block).not.toHaveProperty("tags");
      expect(block.translations.de.title).not.toBe("");
      expect(block.translations.en.title).not.toBe("");
      expect(block).not.toHaveProperty("provenance");
      expect(block).not.toHaveProperty("reviewedAt");
      expect(block).not.toHaveProperty("contentRevision");
      expect(block).not.toHaveProperty("source");
      expect(block.translations.de).not.toHaveProperty("status");
      expect(block.translations.en).not.toHaveProperty("status");
    }
    expect(database.blocks.filter((block) => block.id.startsWith("import-"))).toHaveLength(4);
    expect(database.blocks.some((block) => block.regulations.some((reference) => reference.includes("xyz")))).toBe(false);
    const activeBlocks = database.blocks.filter((block) => block.lifecycle === "active");
    expect(activeBlocks).toHaveLength(23);
    expect(activeBlocks.every((block) => block.imageDataUrl?.startsWith("/block-images/"))).toBe(true);
    expect(new Set(activeBlocks.map((block) => block.imageDataUrl)).size).toBe(23);
  });

  it("contains a complete local test project and generated plan", () => {
    const database = createSeedDatabase();
    const project = database.projects[0];
    expect(project.participants.some((participant) => participant.role === "coordinator")).toBe(true);
    expect(project.emergencyContacts.length).toBeGreaterThanOrEqual(2);
    expect(database.plans.find((plan) => plan.projectId === project.id)).toBeDefined();
    expect(database.projects.some((candidate) => candidate.documentLocale === "en" && candidate.constructionType === "renovation")).toBe(true);
    expect(database.revisions.some((revision) => revision.projectId === project.id)).toBe(true);
    expect(project.assets.some((asset) => asset.mimeType === "application/pdf" && asset.pageCount === 2)).toBe(true);
  });

  it("provides distinct German and English overview template examples", () => {
    const database = createSeedDatabase();
    for (const template of database.overviewTemplates) {
      expect(template.translations?.en?.name).toBeTruthy();
      expect(flattenOverviewEntries(template.entries).every(({ entry }) => Boolean(entry.translations?.en))).toBe(true);
    }

    const emergencyTemplate = database.overviewTemplates.find((template) => template.id === "overview-template-emergency")!;
    const germanEmergencyTemplate = localizeOverviewTemplate(emergencyTemplate, "de");
    const englishEmergencyTemplate = localizeOverviewTemplate(emergencyTemplate, "en");
    expect(germanEmergencyTemplate.name).toBe("Notfallkontakte");
    expect(englishEmergencyTemplate.name).toBe("Emergency contacts");
    expect(germanEmergencyTemplate.entries[0].children[0].defaultValue).toBe("Feuerwehr / Rettungsdienst");
    expect(englishEmergencyTemplate.entries[0].children[0].defaultValue).toBe("Fire brigade / emergency services");
  });

  it("keeps the release fixture inventory stable", () => {
    const database = createSeedDatabase();
    expect({
      projectIds: database.projects.map((project) => project.id),
      planIds: database.plans.map((plan) => plan.id),
      categoryCount: database.categories.length,
      blockCount: database.blocks.length,
      revisionIds: database.revisions.map((revision) => revision.id),
      templateCount: database.documentTemplates.length,
    }).toMatchInlineSnapshot(`
      {
        "blockCount": 24,
        "categoryCount": 16,
        "planIds": [
          "plan-project-logistics-center",
          "plan-project-riverside-renovation",
        ],
        "projectIds": [
          "project-logistics-center",
          "project-riverside-renovation",
        ],
        "revisionIds": [
          "revision-demo-a",
        ],
        "templateCount": 2,
      }
    `);
  });
});
