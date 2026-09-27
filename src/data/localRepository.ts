import { createSeedDatabase } from "./seed";
import { ensurePlanLayout } from "../domain/planLayout";
import type { AppDatabase, BuildingBlock, BuildingBlockCategory, Project } from "../domain/types";
import { z } from "zod";

export const STORAGE_KEY = "quicksige.database.v3";
const LEGACY_STORAGE_KEYS = ["quicksige.prototype.database.v2"];
export const BACKUP_KEY = "quicksige.database.migration-backup.v2";
export const MIGRATION_ERROR_KEY = "quicksige.database.migration-error";
export const CURRENT_SCHEMA_VERSION = 6;

const persistedDatabaseSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
  organization: z.object({ id: z.string(), name: z.string(), defaultLocale: z.enum(["de", "en"]), accentColor: z.string() }),
  user: z.object({ id: z.string(), organizationId: z.string(), name: z.string(), email: z.string(), role: z.enum(["owner", "admin", "editor", "viewer"]), preferredLocale: z.enum(["de", "en"]) }),
  projects: z.array(z.object({ id: z.string() }).passthrough()),
  blocks: z.array(z.object({ id: z.string(), code: z.string() }).passthrough()),
  categories: z.array(z.object({ id: z.string() }).passthrough()),
  plans: z.array(z.object({ id: z.string(), projectId: z.string() }).passthrough()),
  revisions: z.array(z.object({ id: z.string() }).passthrough()),
  overviewTemplates: z.array(z.object({ id: z.string() }).passthrough()),
  documentTemplates: z.array(z.object({ id: z.string() }).passthrough()),
  documentConfigurations: z.array(z.object({ id: z.string() }).passthrough()),
  generatedDocuments: z.array(z.object({ id: z.string() }).passthrough()),
  auditEvents: z.array(z.object({ id: z.string() }).passthrough()),
}).passthrough();

const DETAILED_CATEGORY_BY_CODE: Record<string, string> = {
  "SET-001": "site-access-emergency", "SET-002": "site-access-emergency", "SET-003": "site-access-emergency",
  "SET-004": "site-access-emergency", "SET-005": "site-utilities", "SET-006": "site-access-emergency",
  "HEI-001": "height-fall-protection", "HEI-002": "height-fall-protection", "HAZ-001": "hazardous-permit-work",
  "HAZ-002": "hazardous-permit-work", "HAZ-003": "hazardous-permit-work",
};

export interface AppRepository {
  load(): AppDatabase;
  save(database: AppDatabase): void;
  reset(): AppDatabase;
  hasBackup(): boolean;
  restoreBackup(): AppDatabase;
  exportBackup(): string | null;
  getMigrationError(): string | null;
}

function isDatabase(value: unknown): value is Partial<AppDatabase> & Pick<AppDatabase, "projects" | "blocks"> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AppDatabase>;
  return Array.isArray(candidate.projects) && Array.isArray(candidate.blocks);
}

function migrateProject(project: Project): Project {
  return {
    ...project,
    participants: project.participants ?? [],
    emergencyContacts: project.emergencyContacts ?? [],
    customFields: project.customFields ?? [],
    customSections: project.customSections ?? [],
    assets: project.assets ?? [],
  };
}

function migrateBlock(block: BuildingBlock): BuildingBlock {
  const originalCategoryId = block.primaryCategoryId ?? block.categoryId ?? "uncategorized";
  const detailedCategoryId = block.source !== "organization" ? DETAILED_CATEGORY_BY_CODE[block.code] : undefined;
  const primaryCategoryId = detailedCategoryId ?? originalCategoryId;
  return {
    ...block,
    primaryCategoryId,
    categoryIds: [...new Set([...(block.categoryIds?.length ? block.categoryIds : [originalCategoryId]), ...(detailedCategoryId ? [detailedCategoryId] : [])])],
    lifecycle: block.lifecycle ?? "active",
    provenance: block.provenance ?? {
      kind: block.source === "organization" ? "organization" : "starter_content",
      label: block.source === "organization" ? "Organization content" : "Migrated starter content — professional verification required",
    },
  };
}

function migrateCategory(category: BuildingBlockCategory, sortOrder: number): BuildingBlockCategory {
  return { ...category, sortOrder: category.sortOrder ?? sortOrder, lifecycle: category.lifecycle ?? "active" };
}

export function migrateDatabase(value: unknown): AppDatabase | null {
  if (!isDatabase(value)) return null;
  const source = value as AppDatabase;
  const defaults = createSeedDatabase();
  const projects = source.projects.map(migrateProject);
  const plans = (source.plans ?? []).map((plan) => ensurePlanLayout({
    ...plan,
    supportingDocuments: plan.supportingDocuments ?? [],
    includedAssetIds: plan.includedAssetIds ?? [],
  }));
  const sourceCategories = (source.categories ?? []).map(migrateCategory);
  const sourceCategoryIds = new Set(sourceCategories.map((category) => category.id));
  const categories = [...sourceCategories, ...defaults.categories.filter((category) => !sourceCategoryIds.has(category.id))];
  const migrated: AppDatabase = {
    ...defaults,
    ...source,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projects,
    blocks: source.blocks.map(migrateBlock),
    categories,
    plans,
    revisions: (source.revisions ?? []).map((revision) => ({
      ...revision,
      snapshot: {
        ...revision.snapshot,
        plan: ensurePlanLayout(revision.snapshot.plan),
        documentTemplates: revision.snapshot.documentTemplates ?? source.documentTemplates ?? defaults.documentTemplates,
        documentConfigurations: revision.snapshot.documentConfigurations ?? (source.documentConfigurations ?? []).filter((configuration) => configuration.projectId === revision.projectId),
        generatedDocuments: revision.snapshot.generatedDocuments ?? (source.generatedDocuments ?? []).filter((document) => document.projectId === revision.projectId),
      },
    })),
    overviewTemplates: (source.overviewTemplates ?? defaults.overviewTemplates).map((template) => ({ ...template, lifecycle: template.lifecycle ?? "active" })),
    documentTemplates: (source.documentTemplates ?? defaults.documentTemplates).map((template) => ({ ...template, lifecycle: template.lifecycle ?? "active", revision: template.revision ?? 1 })),
    documentConfigurations: source.documentConfigurations ?? [],
    generatedDocuments: (source.generatedDocuments ?? []).map((document) => {
      const project = projects.find((candidate) => candidate.id === document.projectId) ?? projects[0];
      const plan = plans.find((candidate) => candidate.projectId === document.projectId);
      return {
        ...document,
        templateRevision: document.templateRevision ?? 1,
        projectSnapshot: document.projectSnapshot ?? structuredClone(project),
        planSnapshot: document.planSnapshot ?? (plan ? structuredClone(plan) : undefined),
        language: document.language ?? project?.documentLocale ?? "de",
        dependencyFingerprint: document.dependencyFingerprint ?? "legacy",
        stale: document.stale ?? true,
      };
    }),
    auditEvents: source.auditEvents ?? [],
  };
  return persistedDatabaseSchema.safeParse(migrated).success ? migrated : null;
}

export class LocalStorageRepository implements AppRepository {
  load(): AppDatabase {
    try {
      const current = window.localStorage.getItem(STORAGE_KEY);
      if (current) {
        const parsed = JSON.parse(current) as Partial<AppDatabase>;
        if ((parsed.schemaVersion ?? 0) < CURRENT_SCHEMA_VERSION && !window.localStorage.getItem(BACKUP_KEY)) window.localStorage.setItem(BACKUP_KEY, current);
        const database = migrateDatabase(parsed);
        if (database) {
          window.localStorage.removeItem(MIGRATION_ERROR_KEY);
          this.save(database);
          return database;
        }
        window.localStorage.setItem(BACKUP_KEY, current);
        window.localStorage.setItem(MIGRATION_ERROR_KEY, "Stored project data could not be migrated. A recoverable backup was preserved.");
      }
      for (const legacyKey of LEGACY_STORAGE_KEYS) {
        const legacy = window.localStorage.getItem(legacyKey);
        if (!legacy) continue;
        const database = migrateDatabase(JSON.parse(legacy));
        if (!database) continue;
        window.localStorage.setItem(BACKUP_KEY, legacy);
        this.save(database);
        return database;
      }
      return this.reset(false);
    } catch (error) {
      const current = window.localStorage.getItem(STORAGE_KEY);
      if (current) window.localStorage.setItem(BACKUP_KEY, current);
      window.localStorage.setItem(MIGRATION_ERROR_KEY, error instanceof Error ? error.message : "Unknown migration error");
      return this.reset(false);
    }
  }

  save(database: AppDatabase): void {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
  }

  reset(clearRecovery = true): AppDatabase {
    const database = createSeedDatabase();
    this.save(database);
    if (clearRecovery) {
      window.localStorage.removeItem(BACKUP_KEY);
      window.localStorage.removeItem(MIGRATION_ERROR_KEY);
    }
    return database;
  }

  hasBackup(): boolean { return Boolean(window.localStorage.getItem(BACKUP_KEY)); }

  exportBackup(): string | null { return window.localStorage.getItem(BACKUP_KEY); }

  getMigrationError(): string | null { return window.localStorage.getItem(MIGRATION_ERROR_KEY); }

  restoreBackup(): AppDatabase {
    const raw = window.localStorage.getItem(BACKUP_KEY);
    if (!raw) throw new Error("No migration backup is available.");
    const database = migrateDatabase(JSON.parse(raw));
    if (!database) throw new Error("The migration backup is malformed and cannot be restored automatically.");
    this.save(database);
    window.localStorage.removeItem(MIGRATION_ERROR_KEY);
    return database;
  }
}
