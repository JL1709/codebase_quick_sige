import { beforeEach, describe, expect, it } from "vitest";
import type { PlanAssetElement } from "../domain/types";
import { createSeedDatabase } from "./seed";
import { createBundledWordTemplates } from "./bundledWordTemplates";
import {
  BACKUP_KEY, CURRENT_SCHEMA_VERSION, LocalStorageRepository, MIGRATION_ERROR_KEY,
  STORAGE_KEY, migrateDatabase,
} from "./localRepository";

describe("local database migration", () => {
  beforeEach(() => window.localStorage.clear());
  it("adds the Word library once without replacing edited data or resurrecting deleted templates", () => {
    const source = createSeedDatabase();
    source.schemaVersion = 38;
    const libraryIds = new Set(createBundledWordTemplates(source.organization.id).map((template) => template.id));
    source.documentTemplates = source.documentTemplates.filter((template) => !libraryIds.has(template.id));
    source.projects[0].overviewSections = source.projects[0].overviewSections.filter((section) => section.name !== "Vorankündigung");
    const number = source.projects[0].overviewSections.find((section) => section.name === "Allgemein")!.entries.find((entry) => entry.label === "Nummer")!;
    number.value = "User-edited number";
    const migrated = migrateDatabase(source)!;
    expect(migrated.documentTemplates.filter((template) => libraryIds.has(template.id))).toHaveLength(20);
    expect(migrated.projects[0].overviewSections.find((section) => section.name === "Vorankündigung")).toBeDefined();
    expect(migrated.projects[0].overviewSections.find((section) => section.name === "Allgemein")!.entries.find((entry) => entry.label === "Nummer")!.value).toBe("User-edited number");
    expect(source.projects[0].overviewSections.some((section) => section.name === "Vorankündigung")).toBe(false);
    const replacement = migrated.documentTemplates.find((template) => template.id === "word-template-alarmplan")!;
    replacement.blobId = "uploaded-replacement";
    replacement.name = "Edited alarm plan";
    migrated.documentTemplates = migrated.documentTemplates.filter((template) => template.id !== "word-template-lageplan");
    const reloaded = migrateDatabase(migrated)!;
    expect(reloaded.documentTemplates.filter((template) => libraryIds.has(template.id))).toHaveLength(19);
    expect(reloaded.documentTemplates.find((template) => template.id === replacement.id)).toMatchObject({ name: "Edited alarm plan", blobId: "uploaded-replacement" });
    expect(reloaded.projects[0].overviewSections.filter((section) => section.name === "Vorankündigung")).toHaveLength(1);
  });
  it("migrates legacy organization records without inventing company contact details", () => {
    const source = createSeedDatabase();
    source.schemaVersion = 37;
    const legacy = { ...source, organization: { id: source.organization.id, name: "Original company", accentColor: source.organization.accentColor } };
    const migrated = migrateDatabase(legacy)!;
    expect(migrated.organization).toMatchObject({ name: "Original company", email: "", phone: "", address: { postalCode: "", countryCode: "" } });
    expect(migrated.user.email).toBe(source.user.email);
    expect(migrated.revisions[0].snapshot.organization).toBeUndefined();
  });

  it("persists organization profiles and revision snapshots across reloads", () => {
    const source = createSeedDatabase();
    source.organization.address.postalCode = "01234";
    source.organization.logo = { blobId: "original-logo", filename: "logo.png", mimeType: "image/png", width: 200, height: 80 };
    source.revisions[0].snapshot.organization = structuredClone(source.organization);
    const repository = new LocalStorageRepository();
    repository.save(source);
    const reloaded = repository.load();
    expect(reloaded.organization).toEqual(source.organization);
    expect(reloaded.revisions[0].snapshot.organization).toEqual(source.organization);
    reloaded.organization.logo!.blobId = "new-logo";
    expect(reloaded.revisions[0].snapshot.organization!.logo!.blobId).toBe("original-logo");
  });

  it("preserves projects while adding flexible data, templates, and A0 layout", () => {
    const legacy = structuredClone(createSeedDatabase()) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 2;
    (legacy.organization as Record<string, unknown>).defaultLocale = "de";
    const project = (legacy.projects as Array<Record<string, unknown>>)[0];
    project.documentLocale = "de";
    delete project.customFields;
    delete project.customSections;
    delete project.assets;
    delete project.documentFolders;
    const plan = (legacy.plans as Array<Record<string, unknown>>)[0];
    plan.documentLocale = "de";
    plan.title = "Legacy German plan title";
    delete plan.layout;
    delete legacy.overviewTemplates;
    delete legacy.documentTemplates;
    const legacyBlock = (legacy.blocks as Array<Record<string, unknown>>)[0];
    legacyBlock.code = "PRE-001";
    legacyBlock.tags = ["legacy global term"];
    legacyBlock.provenance = { kind: "starter_content", label: "Legacy source", verifiedAt: "2026-09-01" };
    legacyBlock.contentRevision = 2;
    legacyBlock.reviewedAt = "2026-09-01";
    legacyBlock.source = "system";
    const legacyGermanContent = ((legacyBlock.translations as Record<string, Record<string, unknown>>).de);
    legacyGermanContent.status = "approved";
    legacyBlock.imageDataUrl = "/block-images/pre-001.png";

    const migrated = migrateDatabase(legacy);

    expect(migrated?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated?.organization).not.toHaveProperty("defaultLocale");
    expect(migrated?.projects[0].id).toBe(project.id);
    expect(migrated?.projects[0].customFields).toEqual([]);
    expect(migrated?.projects[0].documentFolders).toEqual([]);
    expect(migrated?.projects[0]).not.toHaveProperty("documentLocale");
    expect(migrated?.plans[0].layout.format).toBe("A0");
    expect(migrated?.plans[0]).not.toHaveProperty("documentLocale");
    expect(migrated?.plans[0]).not.toHaveProperty("title");
    expect(migrated?.documentTemplates.length).toBeGreaterThan(0);
    expect(migrated?.blocks[0].imageDataUrl).toBe("/block-images/block-existing-utilities.png");
    expect(migrated?.blocks[0]).not.toHaveProperty("code");
    expect(migrated?.blocks[0]).not.toHaveProperty("tags");
    expect(migrated?.blocks[0]).not.toHaveProperty("provenance");
    expect(migrated?.blocks[0]).not.toHaveProperty("contentRevision");
    expect(migrated?.blocks[0]).not.toHaveProperty("reviewedAt");
    expect(migrated?.blocks[0]).not.toHaveProperty("source");
    expect(migrated?.blocks[0].translations.de).not.toHaveProperty("status");
    expect(migrated?.blocks[0].translations.de.searchTerms).toContain("legacy global term");
    expect(migrated?.blocks[0].translations.en.searchTerms).toContain("legacy global term");
  });

  it("migrates the single legacy assessment into a completed run and adds plan provenance", () => {
    const source = structuredClone(createSeedDatabase()) as unknown as Record<string, unknown>;
    source.schemaVersion = 23;
    const assessmentRuns = source.assessmentRuns as Array<{ projectId: string; answers: unknown }>;
    source.assessments = Object.fromEntries(assessmentRuns.map((run) => [run.projectId, run.answers]));
    delete source.assessmentRuns;
    const plans = source.plans as Array<Record<string, unknown>>;
    plans.forEach((plan) => delete plan.provenance);

    const migrated = migrateDatabase(source);

    expect(migrated?.assessmentRuns).toHaveLength(assessmentRuns.length);
    expect(migrated?.assessmentRuns.every((run) => Boolean(run.completedAt))).toBe(true);
    expect(migrated).not.toHaveProperty("assessments");
    expect(migrated?.plans.every((plan) => plan.provenance.method === "guided_assessment")).toBe(true);
    expect(migrated?.plans.every((plan) => Boolean(plan.provenance.sourceAssessmentRunId))).toBe(true);
  });

  it("removes automatically generated title boxes from every project and revision", () => {
    const source = structuredClone(createSeedDatabase());
    source.schemaVersion = 29;
    const legacyTitleBlock = {
      id: "layout-title-block",
      kind: "title_block" as const,
      x: 8_700,
      y: 7_000,
      width: 3_000,
      height: 1_200,
      zIndex: 1_000,
    };
    const additionalProject = { ...structuredClone(source.projects[0]), id: "project-created-by-user", name: "User project" };
    const additionalPlan = { ...structuredClone(source.plans[0]), id: "plan-created-by-user", projectId: additionalProject.id };
    source.projects.push(additionalProject);
    source.plans.push(additionalPlan);
    source.plans.forEach((plan) => plan.layout.elements.push({ ...legacyTitleBlock }));
    source.revisions[0].snapshot.plan.layout.elements.push({ ...legacyTitleBlock });

    const migrated = migrateDatabase(source);

    expect(migrated?.plans.find((plan) => plan.projectId === additionalProject.id)).toBeDefined();
    expect(migrated?.plans.every((plan) => plan.layout.elements.every((element) => element.kind !== "title_block"))).toBe(true);
    expect(migrated?.revisions[0].snapshot.plan.layout.elements.every((element) => element.kind !== "title_block")).toBe(true);
  });

  it("removes synthetic project information created by the legacy project form", () => {
    const source = structuredClone(createSeedDatabase());
    source.schemaVersion = 30;
    const createdAt = "2026-09-28T12:00:00.000Z";
    const userProject = {
      ...structuredClone(source.projects[0]),
      id: "project-created-by-user",
      name: "test",
      projectNumber: "QS-2026-166",
      description: "",
      address: "",
      city: "",
      constructionType: "new_build" as const,
      startDate: "2026-09-28",
      endDate: "2026-09-28",
      createdAt,
      updatedAt: createdAt,
    };
    source.projects.push(userProject);

    const migrated = migrateDatabase(source);
    const migratedUserProject = migrated?.projects.find((project) => project.id === userProject.id);

    expect(migratedUserProject).not.toHaveProperty("projectNumber");
    expect(migratedUserProject).not.toHaveProperty("description");
    expect(migratedUserProject).not.toHaveProperty("address");
    expect(migratedUserProject).not.toHaveProperty("city");
    expect(migratedUserProject).not.toHaveProperty("constructionType");
    expect(migratedUserProject).not.toHaveProperty("startDate");
    expect(migratedUserProject).not.toHaveProperty("endDate");
    expect(migrated?.projects.find((project) => project.id === "project-logistics-center")).not.toHaveProperty("projectNumber");
  });

  it("removes the legacy project number from an existing logistics demo project", () => {
    const source = structuredClone(createSeedDatabase());
    source.schemaVersion = 35;
    source.projects[0].projectNumber = "QS-2026-014";

    const migrated = migrateDatabase(source);

    expect(migrated?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated?.projects[0]).not.toHaveProperty("projectNumber");
  });

  it("removes Riverside and replaces only the bundled logistics documents", () => {
    const source = structuredClone(createSeedDatabase());
    source.schemaVersion = 26;
    const logisticsProject = source.projects[0];
    const logisticsPlan = source.plans[0];
    const riversideProject = { ...structuredClone(logisticsProject), id: "project-riverside-renovation", name: "Riverside Office Renovation" };
    const riversidePlan = { ...structuredClone(logisticsPlan), id: "plan-project-riverside-renovation", projectId: riversideProject.id };
    source.projects.push(riversideProject);
    source.plans.push(riversidePlan);
    logisticsProject.assets = [
      { id: "asset-site-image", filename: "baustellenlage.png", mimeType: "image/png", byteSize: 70, createdAt: logisticsProject.createdAt },
      { id: "asset-multipage-plan", filename: "lageplan-zweiseitig.pdf", mimeType: "application/pdf", byteSize: 3_600, createdAt: logisticsProject.createdAt },
      { id: "asset-user-upload", filename: "keep-me.jpg", mimeType: "image/jpeg", byteSize: 100, createdAt: logisticsProject.createdAt },
    ];
    logisticsPlan.includedAssetIds = ["asset-site-image", "asset-multipage-plan"];
    logisticsPlan.layout.elements.push(
      { id: "layout-demo-image", kind: "image", assetId: "asset-site-image", x: 100, y: 100, width: 500, height: 500, zIndex: 700 },
      { id: "layout-demo-pdf", kind: "pdf_page", assetId: "asset-multipage-plan", pageNumber: 1, x: 700, y: 100, width: 500, height: 500, zIndex: 701 },
    );

    const migrated = migrateDatabase(source);

    expect(migrated?.projects.map((project) => project.id)).toEqual(["project-logistics-center"]);
    expect(migrated?.plans.map((plan) => plan.projectId)).toEqual(["project-logistics-center"]);
    expect(migrated?.projects[0].assets.map((asset) => asset.filename)).toEqual(["keep-me.jpg", "lageplan.jpg", "Infos.pdf"]);
    expect(migrated?.plans[0].includedAssetIds).toEqual(["asset-logistics-site-plan", "asset-logistics-info-pdf"]);
    expect(migrated?.plans[0].layout.elements.some((element) => ["layout-demo-image", "layout-demo-pdf"].includes(element.id))).toBe(false);
    expect(migrated?.plans[0].layout.elements.filter((element) => element.kind === "image" || element.kind === "pdf_page")).toHaveLength(5);
  });

  it("deduplicates only the legacy imported utilities title", () => {
    const source = structuredClone(createSeedDatabase());
    source.schemaVersion = 27;
    const importedBlock = source.blocks.find((block) => block.id === "import-existing-utilities")!;
    importedBlock.translations.de.title = "Sicherer Umgang mit Bestandsleitungen";
    importedBlock.translations.en.title = "Safe handling of existing utilities";
    const originalContent = {
      imageDataUrl: importedBlock.imageDataUrl,
      regulations: structuredClone(importedBlock.regulations),
      shortDescription: importedBlock.translations.de.shortDescription,
      longDescription: importedBlock.translations.de.longDescription,
    };

    const migratedBlock = migrateDatabase(source)?.blocks.find((block) => block.id === importedBlock.id);

    expect(migratedBlock?.translations.de.title).toBe("Bestandsleitungen bei Erdarbeiten berücksichtigen");
    expect(migratedBlock?.translations.en.title).toBe("Account for existing utilities during earthworks");
    expect(migratedBlock?.imageDataUrl).toBe(originalContent.imageDataUrl);
    expect(migratedBlock?.regulations).toEqual(originalContent.regulations);
    expect(migratedBlock?.translations.de.shortDescription).toBe(originalContent.shortDescription);
    expect(migratedBlock?.translations.de.longDescription).toBe(originalContent.longDescription);
  });

  it("preserves a user-customized utilities title while correcting an unchanged language layer", () => {
    const source = structuredClone(createSeedDatabase());
    source.schemaVersion = 27;
    const importedBlock = source.blocks.find((block) => block.id === "import-existing-utilities")!;
    importedBlock.translations.de.title = "Individueller Leitungstitel";
    importedBlock.translations.en.title = "Safe handling of existing utilities";

    const migratedBlock = migrateDatabase(source)?.blocks.find((block) => block.id === importedBlock.id);

    expect(migratedBlock?.translations.de.title).toBe("Individueller Leitungstitel");
    expect(migratedBlock?.translations.en.title).toBe("Account for existing utilities during earthworks");
  });

  it("places every example project document once while preserving existing placements", () => {
    const source = structuredClone(createSeedDatabase());
    source.schemaVersion = 28;
    const plan = source.plans[0];
    const existingPage = plan.layout.elements.find(
      (element) => element.kind === "pdf_page" && element.assetId === "asset-logistics-info-pdf" && element.pageNumber === 2,
    )!;
    existingPage.x = 9_000;
    existingPage.y = 3_000;
    plan.layout.elements = plan.layout.elements.filter((element) => (
      element.kind !== "image" && !(element.kind === "pdf_page" && element.pageNumber !== 2)
    ));
    plan.includedAssetIds = ["asset-logistics-info-pdf"];

    const migratedPlan = migrateDatabase(source)?.plans[0];
    const placedDocuments = migratedPlan?.layout.elements.filter(
      (element): element is PlanAssetElement => element.kind === "image" || element.kind === "pdf_page",
    ) ?? [];
    const migratedPage = placedDocuments.find(
      (element) => element.kind === "pdf_page" && element.assetId === "asset-logistics-info-pdf" && element.pageNumber === 2,
    );

    expect(migratedPlan?.includedAssetIds).toEqual(["asset-logistics-info-pdf", "asset-logistics-site-plan"]);
    expect(placedDocuments).toHaveLength(5);
    expect(migratedPage).toMatchObject({ id: existingPage.id, x: 9_000, y: 3_000 });
    expect(placedDocuments.filter((element) => element.kind === "pdf_page").map((element) => element.pageNumber).sort()).toEqual([1, 2, 3, 4]);
  });

  it("keeps valid document folders and moves files from missing folders to Unsorted", () => {
    const source = createSeedDatabase();
    source.projects[0].documentFolders = [{ id: "folder-permits", name: "Permits", createdAt: "2026-09-01T00:00:00.000Z" }];
    source.projects[0].assets = [
      {
        id: "asset-valid-folder",
        filename: "permit.pdf",
        mimeType: "application/pdf",
        byteSize: 100,
        folderId: "folder-permits",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "asset-missing-folder",
        filename: "notes.docx",
        mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteSize: 200,
        folderId: "folder-missing",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ];

    const migrated = migrateDatabase(source);

    expect(migrated?.projects[0].documentFolders).toEqual(source.projects[0].documentFolders);
    expect(migrated?.projects[0].assets[0].folderId).toBe("folder-permits");
    expect(migrated?.projects[0].assets[1].folderId).toBeUndefined();
  });

  it("is repeatable and normalizes a deep category into one complete placement path", () => {
    const source = createSeedDatabase();
    source.categories.push(
      { id: "depth-3", parentId: "site-access-emergency", color: "#123456", sortOrder: 99, lifecycle: "active", translations: { de: { name: "Tiefe 3", description: "" }, en: { name: "Depth 3", description: "" } } },
      { id: "depth-4", parentId: "depth-3", color: "#123456", sortOrder: 100, lifecycle: "active", translations: { de: { name: "Tiefe 4", description: "" }, en: { name: "Depth 4", description: "" } } },
    );
    source.blocks[0].primaryCategoryId = "depth-4";
    source.blocks[0].categoryIds = ["depth-4"];

    const first = migrateDatabase(source);
    const second = migrateDatabase(first);

    expect(second?.categories.find((category) => category.id === "depth-4")?.parentId).toBe("depth-3");
    expect(second?.categories.find((category) => category.id === "depth-3")).not.toHaveProperty("color");
    expect(second?.categories.find((category) => category.id === "depth-4")).not.toHaveProperty("color");
    expect(second?.blocks[0].categoryIds).toEqual(["site-setup", "site-access-emergency", "depth-3", "depth-4"]);
    expect(second?.blocks[0]).not.toHaveProperty("color");
    expect(second?.schemaVersion).toBe(first?.schemaVersion);
  });

  it("preserves current catalog category assignments across repeated loads", () => {
    const source = createSeedDatabase();
    const movedBlock = source.blocks.find((block) => block.id === "block-first-aid");
    expect(movedBlock).toBeDefined();
    movedBlock!.primaryCategoryId = "earthworks";
    movedBlock!.categoryIds = ["earthworks"];

    const first = migrateDatabase(source);
    const second = migrateDatabase(first);
    const reloadedBlock = second?.blocks.find((block) => block.id === movedBlock!.id);

    expect(reloadedBlock?.primaryCategoryId).toBe("earthworks");
    expect(reloadedBlock?.categoryIds).toEqual(["earthworks"]);
    expect(reloadedBlock).not.toHaveProperty("color");
    expect(second?.categories.find((category) => category.id === "earthworks")?.color).toBe("#a85a32");
  });

  it("corrects known default category mistakes without overwriting unrelated catalog moves", () => {
    const source = createSeedDatabase();
    source.schemaVersion = 19;
    const legacyAssignments = {
      "block-existing-utilities": "preparation",
      "block-site-fencing": "site-access-emergency",
      "block-temporary-power": "site-utilities",
      "organization-archived-infection-access": "preparation",
    };
    for (const [blockId, categoryId] of Object.entries(legacyAssignments)) {
      const block = source.blocks.find((candidate) => candidate.id === blockId)!;
      block.primaryCategoryId = categoryId;
      block.categoryIds = [categoryId];
    }
    const deliberatelyMovedBlock = source.blocks.find((block) => block.id === "block-first-aid")!;
    deliberatelyMovedBlock.primaryCategoryId = "earthworks";
    deliberatelyMovedBlock.categoryIds = ["earthworks"];

    const migrated = migrateDatabase(source);

    expect(migrated?.blocks.find((block) => block.id === "block-existing-utilities")?.primaryCategoryId).toBe("existing-underground-utilities");
    expect(migrated?.blocks.find((block) => block.id === "block-site-fencing")?.primaryCategoryId).toBe("imported-site-security");
    expect(migrated?.blocks.find((block) => block.id === "block-temporary-power")?.primaryCategoryId).toBe("site-power-water");
    expect(migrated?.blocks.find((block) => block.id === "organization-archived-infection-access")?.primaryCategoryId).toBe("site-access-emergency");
    expect(migrated?.blocks.find((block) => block.id === "block-first-aid")?.primaryCategoryId).toBe("earthworks");
  });

  it("does not reapply old category corrections during newer migrations", () => {
    const source = createSeedDatabase();
    source.schemaVersion = 28;
    const deliberatelyMovedBlock = source.blocks.find((block) => block.id === "block-site-fencing")!;
    deliberatelyMovedBlock.primaryCategoryId = "site-access-emergency";
    deliberatelyMovedBlock.categoryIds = ["site-setup", "site-access-emergency"];

    const migratedBlock = migrateDatabase(source)?.blocks.find((block) => block.id === deliberatelyMovedBlock.id);

    expect(migratedBlock?.primaryCategoryId).toBe("site-access-emergency");
    expect(migratedBlock?.categoryIds).toEqual(["site-setup", "site-access-emergency"]);
  });

  it("removes legacy block and descendant colors from live data and revision snapshots", () => {
    const source = createSeedDatabase();
    const childCategory = source.categories.find((category) => category.parentId);
    const revision = source.revisions[0];
    const snapshotChildCategory = revision.snapshot.categories.find((category) => category.parentId);
    expect(childCategory).toBeDefined();
    expect(snapshotChildCategory).toBeDefined();
    Object.assign(source.blocks[0], { color: "#123456" });
    Object.assign(childCategory!, { color: "#654321" });
    Object.assign(revision.snapshot.blocks[0], { color: "#abcdef" });
    Object.assign(snapshotChildCategory!, { color: "#fedcba" });

    const migrated = migrateDatabase(source);

    expect(migrated?.blocks[0]).not.toHaveProperty("color");
    expect(migrated?.categories.find((category) => category.id === childCategory!.id)).not.toHaveProperty("color");
    expect(migrated?.revisions[0].snapshot.blocks[0]).not.toHaveProperty("color");
    expect(migrated?.revisions[0].snapshot.categories.find((category) => category.id === snapshotChildCategory!.id)).not.toHaveProperty("color");
  });

  it("migrates legacy typed overview templates into the hierarchical builder", () => {
    const source = structuredClone(createSeedDatabase()) as unknown as Record<string, unknown>;
    source.schemaVersion = 11;
    source.overviewTemplates = [{
      id: "legacy-overview",
      organizationId: "organization-demo",
      name: "Legacy details",
      kind: "project_details",
      lifecycle: "active",
      fields: [{ id: "legacy-field", key: "Bauherr", value: "Example GmbH" }],
      emergencyContacts: [],
      participants: [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
    }];
    const firstProject = (source.projects as Array<Record<string, unknown>>)[0];
    delete firstProject.overviewSections;

    const migrated = migrateDatabase(source);
    expect(migrated?.projects[0].overviewSections.length).toBeGreaterThan(0);
    expect(migrated?.projects[0].overviewSections[0].entries.some((entry) => entry.label === "Bauherr")).toBe(true);
    expect(migrated?.overviewTemplates[0]).toMatchObject({
      id: "legacy-overview",
      name: "Legacy details",
      entries: [{ id: "legacy-field", label: "Bauherr", type: "text", defaultValue: "Example GmbH", children: [] }],
    });
    expect(migrated?.overviewTemplates[0]).not.toHaveProperty("kind");
    expect(migrated?.overviewTemplates[0]).not.toHaveProperty("lifecycle");
  });

  it("backfills English content for existing starter overview templates", () => {
    const source = createSeedDatabase();
    source.schemaVersion = 17;
    const starterTemplate = source.overviewTemplates.find((template) => template.id === "overview-template-emergency")!;
    delete starterTemplate.translations;
    const removeEntryTranslations = (entries: typeof starterTemplate.entries) => entries.forEach((entry) => {
      delete entry.translations;
      removeEntryTranslations(entry.children);
    });
    removeEntryTranslations(starterTemplate.entries);

    const migratedTemplate = migrateDatabase(source)?.overviewTemplates.find((template) => template.id === starterTemplate.id);

    expect(migratedTemplate?.translations?.en?.name).toBe("Emergency contacts");
    expect(migratedTemplate?.entries[0].children[0].translations?.en).toEqual({
      label: "Service",
      defaultValue: "Fire brigade / emergency services",
    });
  });

  it("retains only A4 and custom Word templates in the active workspace", () => {
    const source = createSeedDatabase();
    const standardTemplate = source.documentTemplates.find((template) => template.origin === "standard")!;
    standardTemplate.name = "QuickSiGe standard";
    const customTemplate = { ...standardTemplate, id: "custom-template", name: "Customer template", origin: "custom" as const };
    const retiredStandardTemplate = { ...standardTemplate, id: "standard-site_rules-en", documentType: "site_rules" as const };
    source.documentTemplates.push(customTemplate, retiredStandardTemplate);
    source.documentConfigurations.push({
      id: "retired-standard-configuration",
      projectId: source.projects[0].id,
      documentType: "site_rules",
      templateId: retiredStandardTemplate.id,
    });

    const migrated = migrateDatabase(source);

    expect(migrated?.documentTemplates.find((template) => template.id === standardTemplate.id)?.name).toBe("QuickSiGe Standard");
    expect(migrated?.documentTemplates.find((template) => template.id === customTemplate.id)?.name).toBe("Customer template");
    expect(migrated?.documentTemplates.some((template) => template.id === retiredStandardTemplate.id)).toBe(false);
    expect(migrated?.documentConfigurations.some((configuration) => configuration.templateId === retiredStandardTemplate.id)).toBe(false);
  });

  it("moves legacy project participants into the canonical contacts directory", () => {
    const source = structuredClone(createSeedDatabase()) as unknown as Record<string, unknown>;
    source.schemaVersion = 31;
    const project = (source.projects as Array<Record<string, unknown>>)[0];
    project.participants = [{
      id: "legacy-coordinator", role: "coordinator", company: "Safety GmbH", name: "Ada Lovelace",
      email: "ada@example.com", phone: "+49 170 123456",
    }];
    delete source.contacts;
    delete source.companies;
    delete source.contactAffiliations;
    delete source.projectContactAssignments;
    delete source.externalContactIdentities;
    delete source.contactImportBatches;

    const migrated = migrateDatabase(source);

    expect(migrated?.projects[0].participants).toEqual([]);
    expect(migrated?.contacts).toEqual([expect.objectContaining({ givenName: "Ada", familyName: "Lovelace", source: "migration" })]);
    expect(migrated?.companies).toEqual([expect.objectContaining({ name: "Safety GmbH" })]);
    expect(migrated?.projectContactAssignments).toEqual([expect.objectContaining({ projectId: project.id, roles: [expect.objectContaining({ role: "coordinator" })] })]);
  });

  it("migrates a legacy display name into the structured contact name and removes the duplicate field", () => {
    const source = structuredClone(createSeedDatabase()) as unknown as Record<string, unknown>;
    source.schemaVersion = 36;
    const legacyContact = (source.contacts as Array<Record<string, unknown>>)[0];
    legacyContact.givenName = "";
    legacyContact.familyName = "";
    legacyContact.displayName = "Ada Lovelace";

    const migrated = migrateDatabase(source);
    const contact = migrated?.contacts[0];

    expect(contact).toMatchObject({ givenName: "Ada", familyName: "Lovelace" });
    expect(contact).not.toHaveProperty("displayName");
  });

  it("creates reusable role definitions and a canonical project overview order", () => {
    const source = structuredClone(createSeedDatabase()) as unknown as Record<string, unknown>;
    source.schemaVersion = 32;
    delete source.projectRoleDefinitions;
    source.contactAffiliations = [];
    const project = (source.projects as Array<Record<string, unknown>>)[0];
    delete project.overviewSectionOrder;
    delete project.participantsSectionName;
    const legacySection = (project.overviewSections as Array<Record<string, unknown>>)[0];
    legacySection.templateId = "overview-template-standard";
    const assignments = source.projectContactAssignments as Array<{ companyId?: string; roles: Array<Record<string, unknown>> }>;
    const legacyCompanyId = (source.companies as Array<{ id: string }>)[0].id;
    assignments[0].companyId = legacyCompanyId;
    assignments[0].roles = [{ id: "legacy-fire-role", role: "custom", customLabel: "Fire lead" }];

    const migrated = migrateDatabase(source);
    const migratedRole = migrated?.projectContactAssignments[0].roles[0];

    expect(migrated?.projectRoleDefinitions).toEqual([expect.objectContaining({ name: "Fire lead", lifecycle: "active" })]);
    expect(migratedRole?.roleDefinitionId).toBe(migrated?.projectRoleDefinitions[0].id);
    expect(migrated?.projectContactAssignments[0]).not.toHaveProperty("companyId");
    expect(migrated?.contactAffiliations).toContainEqual(expect.objectContaining({
      contactId: migrated?.projectContactAssignments[0].contactId,
      companyId: legacyCompanyId,
      primary: true,
      lifecycle: "active",
    }));
    expect(migrated?.projects[0].overviewSectionOrder[0]).toBe("system:project-participants");
    expect(migrated?.projects[0].participantsSectionName).toBe("Projektbeteiligte");
    expect(migrated?.projects[0].overviewSections.every((section) => !("templateId" in section))).toBe(true);
    expect(migrated?.projects[0].overviewSections.map((section) => section.id)).toEqual(
      migrated?.projects[0].overviewSectionOrder.filter((id) => id !== "system:project-participants"),
    );
  });

  it("rejects malformed payloads instead of erasing them into partial state", () => {
    expect(migrateDatabase({ projects: "invalid", blocks: [] })).toBeNull();
  });

  it("migrates an empty legacy database without duplicating defaults on repeated migration", () => {
    const emptyLegacy = { projects: [], blocks: [], categories: [], plans: [], revisions: [] };
    const first = migrateDatabase(emptyLegacy);
    const second = migrateDatabase(first);

    expect(first?.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(first?.projects).toEqual([]);
    expect(second?.categories.map((category) => category.id)).toEqual(first?.categories.map((category) => category.id));
  });

  it("preserves a recoverable backup before upgrading stored data", () => {
    const legacy = createSeedDatabase();
    legacy.schemaVersion = 2;
    const raw = JSON.stringify(legacy);
    window.localStorage.setItem(STORAGE_KEY, raw);

    const repository = new LocalStorageRepository();
    const migrated = repository.load();

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(window.localStorage.getItem(BACKUP_KEY)).toBe(raw);
    expect(repository.hasBackup()).toBe(true);
    expect(repository.restoreBackup().projects[0].id).toBe(legacy.projects[0].id);
  });

  it("records malformed storage and keeps its original payload available for recovery", () => {
    const malformed = JSON.stringify({ projects: "invalid", blocks: [] });
    window.localStorage.setItem(STORAGE_KEY, malformed);

    const repository = new LocalStorageRepository();
    repository.load();

    expect(window.localStorage.getItem(BACKUP_KEY)).toBe(malformed);
    expect(window.localStorage.getItem(MIGRATION_ERROR_KEY)).toContain("recoverable backup");
  });

  it("reads and atomically saves the focused Contacts repository snapshot", () => {
    const repository = new LocalStorageRepository();
    repository.reset();
    const database = repository.load();
    const snapshot = repository.loadContacts();
    snapshot.contacts[0] = { ...snapshot.contacts[0], givenName: "Repository", familyName: "replacement" };
    snapshot.auditEvents.push({
      id: "audit-contacts-repository", action: "contact.updated", actorName: database.user.name,
      createdAt: "2026-09-29T00:00:00.000Z", details: snapshot.contacts[0].id,
    });

    repository.saveContacts(snapshot);
    const reloaded = repository.load();

    expect(reloaded.contacts[0]).toMatchObject({ givenName: "Repository", familyName: "replacement" });
    expect(reloaded.auditEvents.at(-1)?.id).toBe("audit-contacts-repository");
    expect(reloaded.blocks).toEqual(database.blocks);
  });
});
