import { createSeedDatabase, DEFAULT_PRIMARY_CATEGORY_BY_BLOCK_ID } from "./seed";
import { ensurePlanLayout, fitBlocksInArea, reconcilePlanSectionsWithCatalog } from "../domain/planLayout";
import { defaultBlockImageSource } from "../domain/blockImages";
import { categoryPlacementIds, normalizeCategoryColorOwnership } from "../domain/categoryTree";
import { legacyProjectOverviewSections } from "../domain/projectOverview";
import type {
  AppDatabase,
  BuildingBlock,
  BuildingBlockCategory,
  CustomField,
  EmergencyContact,
  Locale,
  OverviewTemplate,
  OverviewTemplateEntry,
  Participant,
  Plan,
  Project,
} from "../domain/types";
import { z } from "zod";

export const STORAGE_KEY = "quicksige.database.v3";
const LEGACY_STORAGE_KEYS = ["quicksige.prototype.database.v2"];
export const BACKUP_KEY = "quicksige.database.migration-backup.v2";
export const MIGRATION_ERROR_KEY = "quicksige.database.migration-error";
export const CURRENT_SCHEMA_VERSION = 22;

const persistedDatabaseSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
  organization: z.object({ id: z.string(), name: z.string(), accentColor: z.string() }),
  user: z.object({ id: z.string(), organizationId: z.string(), name: z.string(), email: z.string(), role: z.enum(["owner", "admin", "editor", "viewer"]), preferredLocale: z.enum(["de", "en"]) }),
  projects: z.array(z.object({ id: z.string() }).passthrough()),
  blocks: z.array(z.object({ id: z.string() }).passthrough()),
  categories: z.array(z.object({ id: z.string() }).passthrough()),
  plans: z.array(z.object({ id: z.string(), projectId: z.string() }).passthrough()),
  revisions: z.array(z.object({ id: z.string() }).passthrough()),
  overviewTemplates: z.array(z.object({ id: z.string() }).passthrough()),
  documentTemplates: z.array(z.object({ id: z.string() }).passthrough()),
  documentConfigurations: z.array(z.object({ id: z.string() }).passthrough()),
  generatedDocuments: z.array(z.object({ id: z.string() }).passthrough()),
  auditEvents: z.array(z.object({ id: z.string() }).passthrough()),
}).passthrough();

const CATEGORY_ASSIGNMENT_CORRECTIONS: Record<string, { previousCategoryId: string; correctedCategoryId: string }> = {
  "block-existing-utilities": { previousCategoryId: "preparation", correctedCategoryId: "existing-underground-utilities" },
  "block-site-fencing": { previousCategoryId: "site-access-emergency", correctedCategoryId: "imported-site-security" },
  "block-temporary-power": { previousCategoryId: "site-utilities", correctedCategoryId: "site-power-water" },
  "organization-archived-infection-access": { previousCategoryId: "preparation", correctedCategoryId: "site-access-emergency" },
};

type PersistedBuildingBlock = BuildingBlock & {
  color?: string;
  code?: string;
  tags?: string[];
  provenance?: unknown;
  contentRevision?: number;
  reviewedAt?: string;
  source?: "system" | "organization";
};

type PersistedProject = Project & { documentLocale?: Locale };
type PersistedPlan = Plan & { documentLocale?: Locale; title?: string };

type PersistedOverviewTemplate = Partial<OverviewTemplate> & Pick<OverviewTemplate, "id" | "organizationId" | "name" | "createdAt" | "updatedAt"> & {
  kind?: "project_details" | "emergency_contacts" | "participants" | "custom_section";
  title?: string;
  fields?: CustomField[];
  emergencyContacts?: EmergencyContact[];
  participants?: Participant[];
  lifecycle?: "active" | "archived";
};

const LEGACY_BLOCK_METADATA_FIELDS = ["color", "code", "tags", "provenance", "contentRevision", "reviewedAt", "source"] as const;

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

function migrateProject(project: PersistedProject, locale: Locale): Project {
  const documentFolders = project.documentFolders ?? [];
  const documentFolderIds = new Set(documentFolders.map((folder) => folder.id));
  const projectWithoutLegacyLocale = { ...project };
  Reflect.deleteProperty(projectWithoutLegacyLocale, "documentLocale");
  const migratedProject = {
    ...projectWithoutLegacyLocale,
    participants: project.participants ?? [],
    emergencyContacts: project.emergencyContacts ?? [],
    customFields: project.customFields ?? [],
    customSections: project.customSections ?? [],
    overviewSections: project.overviewSections ?? [],
    assets: (project.assets ?? []).map((asset) => ({
      ...asset,
      folderId: asset.folderId && documentFolderIds.has(asset.folderId) ? asset.folderId : undefined,
    })),
    documentFolders,
  };
  if (migratedProject.overviewSections.length > 0) return migratedProject;
  let identifierIndex = 0;
  return {
    ...migratedProject,
    overviewSections: legacyProjectOverviewSections(migratedProject, (prefix) => `${project.id}-${prefix}-${identifierIndex++}`, locale),
  };
}

function migratePlan(plan: PersistedPlan): Plan {
  const planWithoutLegacyLocale = { ...plan };
  Reflect.deleteProperty(planWithoutLegacyLocale, "documentLocale");
  Reflect.deleteProperty(planWithoutLegacyLocale, "title");
  return ensurePlanLayout({
    ...planWithoutLegacyLocale,
    supportingDocuments: plan.supportingDocuments ?? [],
    includedAssetIds: plan.includedAssetIds ?? [],
  });
}

function migratePlanCategoryHierarchy(
  plan: Plan,
  categories: BuildingBlockCategory[],
  blocks: BuildingBlock[],
  sourceSchemaVersion: number,
): Plan {
  if (sourceSchemaVersion >= CURRENT_SCHEMA_VERSION) return plan;
  const sections = reconcilePlanSectionsWithCatalog(plan.sections, categories, blocks);
  const fitted = fitBlocksInArea(plan.layout, sections, categories, blocks);
  return {
    ...plan,
    sections,
    layout: fitted.fits ? fitted.layout : plan.layout,
  };
}

function migrateTemplateEntry(entry: OverviewTemplateEntry): OverviewTemplateEntry {
  return {
    id: entry.id,
    label: entry.label ?? "",
    type: entry.type ?? "text",
    defaultValue: entry.defaultValue ?? "",
    children: (entry.children ?? []).map(migrateTemplateEntry),
    translations: entry.translations,
  };
}

function migrateOverviewTemplate(template: PersistedOverviewTemplate): OverviewTemplate {
  if (template.entries?.length) return {
    id: template.id,
    organizationId: template.organizationId,
    name: template.name,
    sourceLocale: template.sourceLocale ?? "de",
    translations: template.translations,
    entries: template.entries.map(migrateTemplateEntry),
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
  const fieldEntries = (template.fields ?? []).map((field) => ({
    id: field.id,
    label: field.key,
    type: "text" as const,
    defaultValue: field.value,
    children: [],
  }));
  const contactEntries = (template.emergencyContacts ?? []).map((contact, index) => ({
    id: contact.id,
    label: contact.label || `Contact ${index + 1}`,
    type: "group" as const,
    defaultValue: "",
    children: [
      { id: `${contact.id}-name`, label: `${contact.label || `Contact ${index + 1}`} name`, type: "text" as const, defaultValue: contact.name, children: [] },
      { id: `${contact.id}-phone`, label: `${contact.label || `Contact ${index + 1}`} phone`, type: "text" as const, defaultValue: contact.phone, children: [] },
    ],
  }));
  const participantEntries = (template.participants ?? []).map((participant, index) => ({
    id: participant.id,
    label: participant.name || `Participant ${index + 1}`,
    type: "group" as const,
    defaultValue: "",
    children: [
      { id: `${participant.id}-company`, label: `${participant.name || `Participant ${index + 1}`} company`, type: "text" as const, defaultValue: participant.company, children: [] },
      { id: `${participant.id}-email`, label: `${participant.name || `Participant ${index + 1}`} email`, type: "text" as const, defaultValue: participant.email, children: [] },
      { id: `${participant.id}-phone`, label: `${participant.name || `Participant ${index + 1}`} phone`, type: "text" as const, defaultValue: participant.phone, children: [] },
    ],
  }));
  return {
    id: template.id,
    organizationId: template.organizationId,
    name: template.title || template.name,
    sourceLocale: template.sourceLocale ?? "de",
    translations: template.translations,
    entries: [...fieldEntries, ...contactEntries, ...participantEntries],
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function backfillStarterEntryTranslations(
  entry: OverviewTemplateEntry,
  starterEntry: OverviewTemplateEntry | undefined,
): OverviewTemplateEntry {
  if (!starterEntry) return entry;
  return {
    ...entry,
    translations: { ...starterEntry.translations, ...entry.translations },
    children: entry.children.map((child) => backfillStarterEntryTranslations(
      child,
      starterEntry.children.find((candidate) => candidate.id === child.id),
    )),
  };
}

function backfillStarterTemplateTranslations(
  template: OverviewTemplate,
  starterTemplate: OverviewTemplate | undefined,
): OverviewTemplate {
  if (!starterTemplate) return template;
  return {
    ...template,
    translations: { ...starterTemplate.translations, ...template.translations },
    entries: template.entries.map((entry) => backfillStarterEntryTranslations(
      entry,
      starterTemplate.entries.find((candidate) => candidate.id === entry.id),
    )),
  };
}

function migrateBlock(block: PersistedBuildingBlock): BuildingBlock {
  const originalCategoryId = block.primaryCategoryId ?? block.categoryId ?? "uncategorized";
  const legacyDetailedCategoryId = block.primaryCategoryId ? undefined : DEFAULT_PRIMARY_CATEGORY_BY_BLOCK_ID[block.id];
  const primaryCategoryId = legacyDetailedCategoryId ?? originalCategoryId;
  const bundledImageSource = defaultBlockImageSource(block.id);
  const imageDataUrl = !block.imageDataUrl || block.imageDataUrl.startsWith("/block-images/")
    ? bundledImageSource
    : block.imageDataUrl;
  const legacySearchTerms = block.tags ?? [];
  const translations = Object.fromEntries(Object.entries(block.translations).map(([locale, content]) => {
    const contentWithoutLegacyStatus = { ...content } as typeof content & { status?: string };
    Reflect.deleteProperty(contentWithoutLegacyStatus, "status");
    return [
      locale,
      { ...contentWithoutLegacyStatus, searchTerms: [...new Set([...content.searchTerms, ...legacySearchTerms])] },
    ];
  })) as BuildingBlock["translations"];
  const blockWithoutLegacyFields = { ...block };
  LEGACY_BLOCK_METADATA_FIELDS.forEach((field) => Reflect.deleteProperty(blockWithoutLegacyFields, field));
  return {
    ...blockWithoutLegacyFields,
    imageDataUrl,
    translations,
    primaryCategoryId,
    categoryIds: [...new Set([...(block.categoryIds?.length ? block.categoryIds : [originalCategoryId]), ...(legacyDetailedCategoryId ? [legacyDetailedCategoryId] : [])])],
    lifecycle: block.lifecycle ?? "active",
  };
}

function correctDefaultCategoryAssignment(block: BuildingBlock, sourceSchemaVersion: number): BuildingBlock {
  if (sourceSchemaVersion >= CURRENT_SCHEMA_VERSION) return block;
  const correction = CATEGORY_ASSIGNMENT_CORRECTIONS[block.id];
  if (!correction || block.primaryCategoryId !== correction.previousCategoryId) return block;
  return { ...block, primaryCategoryId: correction.correctedCategoryId };
}

function migrateCategory(category: BuildingBlockCategory, sortOrder: number): BuildingBlockCategory {
  return normalizeCategoryColorOwnership({
    ...category,
    sortOrder: category.sortOrder ?? sortOrder,
    lifecycle: category.lifecycle ?? "active",
  });
}

function normalizeBlockPlacement(block: BuildingBlock, categories: BuildingBlockCategory[]): BuildingBlock {
  const categoryIds = categoryPlacementIds(block.primaryCategoryId, categories);
  if (!categoryIds.length) return block;
  return {
    ...block,
    categoryIds,
  };
}

export function migrateDatabase(value: unknown): AppDatabase | null {
  if (!isDatabase(value)) return null;
  const source = value as AppDatabase;
  const defaults = createSeedDatabase();
  const locale = source.user?.preferredLocale ?? defaults.user.preferredLocale;
  const organization = { ...defaults.organization, ...source.organization } as typeof source.organization & { defaultLocale?: Locale };
  Reflect.deleteProperty(organization, "defaultLocale");
  const projects = source.projects.map((project) => migrateProject(project as PersistedProject, locale));
  const sourceCategories = (source.categories ?? []).map(migrateCategory);
  const sourceCategoryIds = new Set(sourceCategories.map((category) => category.id));
  const categories = [...sourceCategories, ...defaults.categories.filter((category) => !sourceCategoryIds.has(category.id))];
  const blocks = source.blocks
    .map(migrateBlock)
    .map((block) => correctDefaultCategoryAssignment(block, source.schemaVersion ?? 0))
    .map((block) => normalizeBlockPlacement(block, categories));
  const plans = (source.plans ?? [])
    .map((plan) => migratePlan(plan as PersistedPlan))
    .map((plan) => migratePlanCategoryHierarchy(plan, categories, blocks, source.schemaVersion ?? 0));
  const documentTemplates = (source.documentTemplates ?? defaults.documentTemplates)
    .filter((template) => template.origin === "custom" || template.documentType === "a4_plan")
    .map((template) => ({
      ...template,
      name: template.origin === "standard" ? "QuickSiGe Standard" : template.name,
      lifecycle: template.lifecycle ?? "active" as const,
      revision: template.revision ?? 1,
    }));
  const documentTemplateIds = new Set(documentTemplates.map((template) => template.id));
  const migrated: AppDatabase = {
    ...defaults,
    ...source,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    organization,
    projects,
    blocks,
    categories,
    plans,
    revisions: (source.revisions ?? []).map((revision) => {
      const snapshotCategories = (revision.snapshot.categories ?? categories).map(migrateCategory);
      const snapshotBlocks = (revision.snapshot.blocks ?? source.blocks)
        .map(migrateBlock)
        .map((block) => normalizeBlockPlacement(block, snapshotCategories));
      const snapshotPlan = migratePlan(revision.snapshot.plan as PersistedPlan);
      return {
        ...revision,
        snapshot: {
          ...revision.snapshot,
          project: migrateProject(revision.snapshot.project as PersistedProject, locale),
          plan: migratePlanCategoryHierarchy(snapshotPlan, snapshotCategories, snapshotBlocks, source.schemaVersion ?? 0),
          blocks: snapshotBlocks,
          categories: snapshotCategories,
          documentTemplates: revision.snapshot.documentTemplates ?? source.documentTemplates ?? defaults.documentTemplates,
          documentConfigurations: revision.snapshot.documentConfigurations ?? (source.documentConfigurations ?? []).filter((configuration) => configuration.projectId === revision.projectId),
          generatedDocuments: revision.snapshot.generatedDocuments ?? (source.generatedDocuments ?? []).filter((document) => document.projectId === revision.projectId),
        },
      };
    }),
    overviewTemplates: ((source.overviewTemplates ?? defaults.overviewTemplates) as PersistedOverviewTemplate[])
      .map(migrateOverviewTemplate)
      .map((template) => backfillStarterTemplateTranslations(
        template,
        defaults.overviewTemplates.find((candidate) => candidate.id === template.id),
      )),
    documentTemplates,
    documentConfigurations: (source.documentConfigurations ?? []).filter((configuration) => documentTemplateIds.has(configuration.templateId)),
    generatedDocuments: (source.generatedDocuments ?? []).map((document) => {
      const project = projects.find((candidate) => candidate.id === document.projectId) ?? projects[0];
      const plan = plans.find((candidate) => candidate.projectId === document.projectId);
      return {
        ...document,
        templateRevision: document.templateRevision ?? 1,
        projectSnapshot: migrateProject((document.projectSnapshot ?? structuredClone(project)) as PersistedProject, locale),
        planSnapshot: document.planSnapshot ? migratePlan(document.planSnapshot as PersistedPlan) : plan ? structuredClone(plan) : undefined,
        language: document.language ?? locale,
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
