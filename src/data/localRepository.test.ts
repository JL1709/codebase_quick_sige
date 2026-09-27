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
