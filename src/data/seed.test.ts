import { describe, expect, it } from "vitest";
import { categoryPlacementIds } from "../domain/categoryTree";
import { flattenOverviewEntries, localizeOverviewTemplate } from "../domain/overviewTemplates";
import { resolveProjectParticipants } from "../domain/contacts";
import type { PlanAssetElement } from "../domain/types";
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
      expect(block).not.toHaveProperty("color");
      expect(block.translations.de).not.toHaveProperty("status");
      expect(block.translations.en).not.toHaveProperty("status");
    }
    expect(database.blocks.filter((block) => block.id.startsWith("import-"))).toHaveLength(4);
    expect(database.blocks.some((block) => block.regulations.some((reference) => reference.includes("xyz")))).toBe(false);
    const activeBlocks = database.blocks.filter((block) => block.lifecycle === "active");
    expect(activeBlocks).toHaveLength(23);
    expect(activeBlocks.every((block) => block.imageDataUrl?.startsWith("/block-images/"))).toBe(true);
    expect(new Set(activeBlocks.map((block) => block.imageDataUrl)).size).toBe(23);
    expect(database.categories.filter((category) => !category.parentId).every((category) => Boolean(category.color))).toBe(true);
    expect(database.categories.filter((category) => category.parentId).every((category) => !("color" in category))).toBe(true);
  });

  it("contains a complete local test project and generated plan", () => {
    const database = createSeedDatabase();
    const project = database.projects[0];
    expect(project.participants).toEqual([]);
    expect(resolveProjectParticipants(database, project.id).some((participant) => participant.role === "coordinator")).toBe(true);
    expect(project.emergencyContacts.length).toBeGreaterThanOrEqual(2);
    expect(database.plans.find((plan) => plan.projectId === project.id)).toBeDefined();
    expect(database.projects).toHaveLength(1);
    expect(database.projects.every((candidate) => !("documentLocale" in candidate))).toBe(true);
    expect(database.plans.every((candidate) => !("documentLocale" in candidate))).toBe(true);
    expect(database.plans.every((candidate) => candidate.layout.elements.every((element) => element.kind !== "title_block"))).toBe(true);
    expect(database.revisions.some((revision) => revision.projectId === project.id)).toBe(true);
    expect(project.assets.map((asset) => asset.filename)).toEqual(["lageplan.jpg", "Infos.pdf"]);
    expect(project.assets.some((asset) => asset.mimeType === "application/pdf" && asset.pageCount === 4)).toBe(true);
    expect(project.assets.every((asset) => asset.dataUrl?.startsWith("/project-documents/logistikzentrum-west/"))).toBe(true);
    const plan = database.plans.find((candidate) => candidate.projectId === project.id)!;
    const placedDocuments = plan.layout.elements.filter(
      (element): element is PlanAssetElement => element.kind === "image" || element.kind === "pdf_page",
    );
    const blockArea = plan.layout.elements.find((element) => element.kind === "block_area")!;
    expect(plan.includedAssetIds).toEqual(["asset-logistics-site-plan", "asset-logistics-info-pdf"]);
    expect(placedDocuments).toHaveLength(5);
    expect(placedDocuments.filter((element) => element.kind === "image")).toHaveLength(1);
    expect(placedDocuments.filter((element) => element.kind === "pdf_page").map((element) => element.pageNumber)).toEqual([1, 2, 3, 4]);
    expect(placedDocuments.every((element) => element.x >= blockArea.x + blockArea.width)).toBe(true);
  });

  it("places catalog blocks in their most specific applicable category", () => {
    const database = createSeedDatabase();
    const expectedCategoryByBlockId = {
      "block-existing-utilities": "existing-underground-utilities",
      "block-site-fencing": "imported-site-security",
      "block-temporary-power": "site-power-water",
      "organization-archived-infection-access": "site-access-emergency",
    };

    for (const [blockId, categoryId] of Object.entries(expectedCategoryByBlockId)) {
      const block = database.blocks.find((candidate) => candidate.id === blockId);
      expect(block?.primaryCategoryId).toBe(categoryId);
      expect(block?.categoryIds.at(-1)).toBe(categoryId);
    }
  });

  it("keeps catalog identities, localized titles, and category paths unambiguous", () => {
    const database = createSeedDatabase();
    expect(new Set(database.blocks.map((block) => block.id)).size).toBe(database.blocks.length);

    for (const locale of ["de", "en"] as const) {
      const normalizedTitles = database.blocks.map((block) => block.translations[locale].title.trim().toLocaleLowerCase(locale));
      expect(new Set(normalizedTitles).size).toBe(normalizedTitles.length);
    }

    const categoryIds = new Set(database.categories.map((category) => category.id));
    for (const block of database.blocks) {
      expect(categoryIds.has(block.primaryCategoryId)).toBe(true);
      expect(block.categoryIds).toEqual(categoryPlacementIds(block.primaryCategoryId, database.categories));
      for (const locale of ["de", "en"] as const) {
        expect(block.translations[locale].title.trim()).not.toBe("");
        expect(block.translations[locale].shortDescription.trim()).not.toBe("");
        expect(block.translations[locale].longDescription.trim()).not.toBe("");
      }
    }
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
        ],
        "projectIds": [
          "project-logistics-center",
        ],
        "revisionIds": [
          "revision-demo-a",
        ],
        "templateCount": 2,
      }
    `);
  });
});
