import { beforeEach, describe, expect, it } from "vitest";
import { createSeedDatabase } from "./seed";
import {
  BACKUP_KEY, CURRENT_SCHEMA_VERSION, LocalStorageRepository, MIGRATION_ERROR_KEY,
  STORAGE_KEY, migrateDatabase,
} from "./localRepository";

describe("local database migration", () => {
  beforeEach(() => window.localStorage.clear());
  it("preserves projects while adding flexible data, templates, and A0 layout", () => {
    const legacy = structuredClone(createSeedDatabase()) as unknown as Record<string, unknown>;
    legacy.schemaVersion = 2;
    const project = (legacy.projects as Array<Record<string, unknown>>)[0];
    delete project.customFields;
    delete project.customSections;
    delete project.assets;
    delete project.documentFolders;
    const plan = (legacy.plans as Array<Record<string, unknown>>)[0];
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
    expect(migrated?.projects[0].id).toBe(project.id);
    expect(migrated?.projects[0].customFields).toEqual([]);
    expect(migrated?.projects[0].documentFolders).toEqual([]);
    expect(migrated?.plans[0].layout.format).toBe("A0");
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
    expect(second?.blocks[0].categoryIds).toEqual(["site-setup", "site-access-emergency", "depth-3", "depth-4"]);
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
    expect(reloadedBlock?.color).toBe(source.categories.find((category) => category.id === "earthworks")?.color);
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
      fields: [{ id: "legacy-field", key: "Bauherr", value: "Example GmbH", placeholderKey: "client" }],
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
});
