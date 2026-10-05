import { createSeedDatabase, DEFAULT_PRIMARY_CATEGORY_BY_BLOCK_ID } from "./seed";
import { ensurePlanLayout, fitBlocksInArea, reconcilePlanSectionsWithCatalog } from "../domain/planLayout";
import { defaultBlockImageSource } from "../domain/blockImages";
import { categoryPlacementIds, normalizeCategoryColorOwnership } from "../domain/categoryTree";
import { legacyProjectOverviewSections } from "../domain/projectOverview";
import { normalizeProjectOverviewSectionOrder, orderProjectOverviewSections, PROJECT_PARTICIPANTS_SECTION_ID } from "../domain/projectOverviewOrder";
import { migrateLegacyProjectContacts, migrateProjectRoleCatalog, splitContactFullName, splitContactGivenNamePrefix } from "../domain/contacts";
import type {
  AppDatabase,
  AssessmentAnswers,
  BuildingBlock,
  BuildingBlockCategory,
  Contact,
  ContactCompanyAffiliation,
  CustomField,
  EmergencyContact,
  Locale,
  OverviewTemplate,
  OverviewTemplateEntry,
  Participant,
  Plan,
  PlanAssetElement,
  Project,
  ProjectAssessmentRun,
  ProjectContactAssignment,
  ProjectOverviewSection,
} from "../domain/types";
import { z } from "zod";
import { emptyOrganizationProfile, storedOrganizationSchema } from "../domain/organizationProfile";

export const STORAGE_KEY = "quicksige.database.v3";
const LEGACY_STORAGE_KEYS = ["quicksige.prototype.database.v2"];
export const BACKUP_KEY = "quicksige.database.migration-backup.v2";
export const MIGRATION_ERROR_KEY = "quicksige.database.migration-error";
export const CURRENT_SCHEMA_VERSION = 38;
const CATEGORY_HIERARCHY_SCHEMA_VERSION = 24;
const CATEGORY_ASSIGNMENT_CORRECTION_SCHEMA_VERSION = 20;
const AUTOMATIC_TITLE_BLOCK_REMOVAL_SCHEMA_VERSION = 30;
const SYNTHETIC_PROJECT_INFORMATION_REMOVAL_SCHEMA_VERSION = 31;
const DEMO_CONTENT_REFRESH_SCHEMA_VERSION = 27;
const CATALOG_TITLE_DEDUPLICATION_SCHEMA_VERSION = 28;
const EXAMPLE_DOCUMENT_PLACEMENT_SCHEMA_VERSION = 29;
const MIGRATION_FALLBACK_TIMESTAMP = new Date(0).toISOString();
const LOGISTICS_DEMO_PROJECT_ID = "project-logistics-center";
const GENERATED_PROJECT_NUMBER_PATTERN = /^QS-\d{4}-\d{3}$/;
const REMOVED_DEMO_PROJECT_ID = "project-riverside-renovation";
const REPLACED_DEMO_ASSET_IDS = new Set(["asset-site-image", "asset-multipage-plan"]);
const REPLACED_DEMO_LAYOUT_ELEMENT_IDS = new Set(["layout-demo-image", "layout-demo-pdf", "layout-demo-document"]);
const IMPORTED_UTILITIES_BLOCK_ID = "import-existing-utilities";
const LEGACY_IMPORTED_UTILITIES_TITLES = {
  de: "Sicherer Umgang mit Bestandsleitungen",
  en: "Safe handling of existing utilities",
} as const;
const CORRECTED_IMPORTED_UTILITIES_TITLES = {
  de: "Bestandsleitungen bei Erdarbeiten berücksichtigen",
  en: "Account for existing utilities during earthworks",
} as const;

const persistedDatabaseSchema = z.object({
  schemaVersion: z.number().int().nonnegative(),
  organization: storedOrganizationSchema,
  user: z.object({ id: z.string(), organizationId: z.string(), name: z.string(), email: z.string(), role: z.enum(["owner", "admin", "editor", "viewer"]), preferredLocale: z.enum(["de", "en"]) }),
  projects: z.array(z.object({ id: z.string() }).passthrough()),
  contacts: z.array(z.object({ id: z.string(), organizationId: z.string() }).passthrough()),
  companies: z.array(z.object({ id: z.string(), organizationId: z.string() }).passthrough()),
  contactAffiliations: z.array(z.object({ id: z.string(), contactId: z.string(), companyId: z.string() }).passthrough()),
  projectContactAssignments: z.array(z.object({ id: z.string(), projectId: z.string(), contactId: z.string() }).passthrough()),
  projectRoleDefinitions: z.array(z.object({ id: z.string(), organizationId: z.string(), name: z.string() }).passthrough()),
  externalContactIdentities: z.array(z.object({ id: z.string(), contactId: z.string(), provider: z.enum(["microsoft", "google"]) }).passthrough()),
  contactImportBatches: z.array(z.object({ id: z.string(), status: z.enum(["completed", "undone", "partially_undone"]) }).passthrough()),
  assessmentRuns: z.array(z.object({ id: z.string(), projectId: z.string() }).passthrough()),
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

type PersistedProject = Omit<Project, "overviewSections" | "participantsSectionName"> & {
  documentLocale?: Locale;
  participantsSectionName?: string;
  overviewSections?: Array<ProjectOverviewSection & { templateId?: string }>;
};
type PersistedPlan = Omit<Plan, "provenance"> & {
  documentLocale?: Locale;
  title?: string;
  provenance?: Plan["provenance"];
};
type PersistedProjectContactAssignment = ProjectContactAssignment & { companyId?: string };
type PersistedContact = Contact & { displayName?: string };

type PersistedDatabase = Omit<AppDatabase, "assessmentRuns" | "contacts" | "companies" | "contactAffiliations" | "projectContactAssignments" | "projectRoleDefinitions" | "externalContactIdentities" | "contactImportBatches"> & {
  assessmentRuns?: ProjectAssessmentRun[];
  assessments?: Record<string, AssessmentAnswers>;
  contacts?: PersistedContact[];
  companies?: AppDatabase["companies"];
  contactAffiliations?: AppDatabase["contactAffiliations"];
  projectContactAssignments?: PersistedProjectContactAssignment[];
  projectRoleDefinitions?: AppDatabase["projectRoleDefinitions"];
  externalContactIdentities?: AppDatabase["externalContactIdentities"];
  contactImportBatches?: AppDatabase["contactImportBatches"];
};

type PersistedOverviewTemplate = Partial<OverviewTemplate> & Pick<OverviewTemplate, "id" | "organizationId" | "name" | "createdAt" | "updatedAt"> & {
  kind?: "project_details" | "emergency_contacts" | "participants" | "custom_section";
  title?: string;
  fields?: CustomField[];
  emergencyContacts?: EmergencyContact[];
  participants?: Participant[];
  lifecycle?: "active" | "archived";
};

function withoutAssignmentCompany(assignment: PersistedProjectContactAssignment): ProjectContactAssignment {
  const canonicalAssignment = { ...assignment };
  Reflect.deleteProperty(canonicalAssignment, "companyId");
  return canonicalAssignment;
}

function migrateContactName(contact: PersistedContact): Contact {
  const migratedContact = { ...contact };
  const legacyDisplayName = migratedContact.displayName?.trim() ?? "";
  Reflect.deleteProperty(migratedContact, "displayName");
  if (!migratedContact.givenName?.trim() && !migratedContact.familyName?.trim() && legacyDisplayName) {
    Object.assign(migratedContact, splitContactFullName(legacyDisplayName));
  }
  if (!migratedContact.prefix?.trim()) {
    const name = splitContactGivenNamePrefix(migratedContact.givenName ?? "");
    migratedContact.prefix = name.prefix;
    migratedContact.givenName = name.givenName;
  }
  return migratedContact;
}

const LEGACY_BLOCK_METADATA_FIELDS = ["color", "code", "tags", "provenance", "contentRevision", "reviewedAt", "source"] as const;

export type ContactsRepositorySnapshot = Pick<AppDatabase,
  | "contacts"
  | "companies"
  | "contactAffiliations"
  | "projectContactAssignments"
  | "projectRoleDefinitions"
  | "externalContactIdentities"
  | "contactImportBatches"
  | "projects"
  | "plans"
  | "generatedDocuments"
  | "auditEvents"
>;

export function contactsRepositorySnapshot(database: AppDatabase): ContactsRepositorySnapshot {
  return {
    contacts: database.contacts,
    companies: database.companies,
    contactAffiliations: database.contactAffiliations,
    projectContactAssignments: database.projectContactAssignments,
    projectRoleDefinitions: database.projectRoleDefinitions,
    externalContactIdentities: database.externalContactIdentities,
    contactImportBatches: database.contactImportBatches,
    projects: database.projects,
    plans: database.plans,
    generatedDocuments: database.generatedDocuments,
    auditEvents: database.auditEvents,
  };
}

export interface ContactsRepository {
  loadContacts(): ContactsRepositorySnapshot;
  saveContacts(snapshot: ContactsRepositorySnapshot): void;
}

export interface AppRepository extends ContactsRepository {
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
    participantsSectionName: project.participantsSectionName?.trim() || (locale === "de" ? "Projektbeteiligte" : "Project participants"),
    overviewSections: project.overviewSections ?? [],
    assets: (project.assets ?? []).map((asset) => ({
      ...asset,
      folderId: asset.folderId && documentFolderIds.has(asset.folderId) ? asset.folderId : undefined,
    })),
    documentFolders,
  };
  let overviewSections = migratedProject.overviewSections;
  if (overviewSections.length === 0) {
    let identifierIndex = 0;
    overviewSections = legacyProjectOverviewSections(migratedProject, (prefix) => `${project.id}-${prefix}-${identifierIndex++}`, locale);
  }
  const persistedOrder = Array.isArray(project.overviewSectionOrder)
    ? project.overviewSectionOrder
    : [PROJECT_PARTICIPANTS_SECTION_ID, ...overviewSections.map((section) => section.id)];
  const overviewSectionOrder = normalizeProjectOverviewSectionOrder(persistedOrder, overviewSections);
  return {
    ...migratedProject,
    overviewSections: orderProjectOverviewSections(overviewSections, overviewSectionOrder) as ProjectOverviewSection[],
    overviewSectionOrder,
  };
}

function removeSyntheticProjectInformation(project: Project, sourceSchemaVersion: number): Project {
  if (sourceSchemaVersion >= SYNTHETIC_PROJECT_INFORMATION_REMOVAL_SCHEMA_VERSION
    || project.id === LOGISTICS_DEMO_PROJECT_ID
    || !GENERATED_PROJECT_NUMBER_PATTERN.test(project.projectNumber?.trim() ?? "")) return project;

  const migratedProject = { ...project };
  Reflect.deleteProperty(migratedProject, "projectNumber");
  const createdDate = project.createdAt.slice(0, 10);
  const hasLegacyCreationDefaults = project.startDate === createdDate
    && project.endDate === createdDate
    && project.constructionType === "new_build";
  if (hasLegacyCreationDefaults) {
    Reflect.deleteProperty(migratedProject, "constructionType");
    Reflect.deleteProperty(migratedProject, "startDate");
    Reflect.deleteProperty(migratedProject, "endDate");
  }
  (["description", "address", "city"] as const).forEach((field) => {
    if (!project[field]?.trim()) Reflect.deleteProperty(migratedProject, field);
  });
  return migratedProject;
}

function removeLegacyLiveProjectNumber(project: Project): Project {
  if (!Object.hasOwn(project, "projectNumber")) return project;
  const migratedProject = { ...project };
  Reflect.deleteProperty(migratedProject, "projectNumber");
  return migratedProject;
}

function migratePlan(plan: PersistedPlan, createdByName = "", sourceAssessmentRunId?: string): Plan {
  const planWithoutLegacyLocale = { ...plan };
  Reflect.deleteProperty(planWithoutLegacyLocale, "documentLocale");
  Reflect.deleteProperty(planWithoutLegacyLocale, "title");
  return ensurePlanLayout({
    ...planWithoutLegacyLocale,
    provenance: plan.provenance ?? {
      method: "guided_assessment",
      createdByName,
      sourceAssessmentRunId,
    },
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
  if (sourceSchemaVersion >= CATEGORY_HIERARCHY_SCHEMA_VERSION) return plan;
  const sections = reconcilePlanSectionsWithCatalog(plan.sections, categories, blocks);
  const fitted = fitBlocksInArea(plan.layout, sections, categories, blocks);
  return {
    ...plan,
    sections,
    layout: fitted.fits ? fitted.layout : plan.layout,
  };
}

function removeAutomaticTitleBlock(plan: Plan, sourceSchemaVersion: number): Plan {
  if (sourceSchemaVersion >= AUTOMATIC_TITLE_BLOCK_REMOVAL_SCHEMA_VERSION) return plan;
  return {
    ...plan,
    layout: {
      ...plan.layout,
      elements: plan.layout.elements.filter((element) => element.kind !== "title_block"),
    },
  };
}

function refreshLogisticsDemoDocuments(project: Project, defaultProject: Project, sourceSchemaVersion: number): Project {
  if (sourceSchemaVersion >= DEMO_CONTENT_REFRESH_SCHEMA_VERSION || project.id !== LOGISTICS_DEMO_PROJECT_ID) return project;
  return {
    ...project,
    assets: [
      ...project.assets.filter((asset) => !REPLACED_DEMO_ASSET_IDS.has(asset.id)),
      ...structuredClone(defaultProject.assets),
    ],
  };
}

function removeReplacedDemoCanvasElements(plan: Plan, sourceSchemaVersion: number): Plan {
  if (sourceSchemaVersion >= DEMO_CONTENT_REFRESH_SCHEMA_VERSION || plan.projectId !== LOGISTICS_DEMO_PROJECT_ID) return plan;
  return {
    ...plan,
    includedAssetIds: plan.includedAssetIds.filter((assetId) => !REPLACED_DEMO_ASSET_IDS.has(assetId)),
    layout: {
      ...plan.layout,
      elements: plan.layout.elements.filter((element) => (
        !REPLACED_DEMO_LAYOUT_ELEMENT_IDS.has(element.id)
        && !((element.kind === "image" || element.kind === "pdf_page") && REPLACED_DEMO_ASSET_IDS.has(element.assetId))
      )),
    },
  };
}

function placeDefaultLogisticsDocuments(plan: Plan, defaultPlan: Plan, sourceSchemaVersion: number): Plan {
  if (sourceSchemaVersion >= EXAMPLE_DOCUMENT_PLACEMENT_SCHEMA_VERSION || plan.projectId !== LOGISTICS_DEMO_PROJECT_ID) return plan;
  const defaultDocumentElements = defaultPlan.layout.elements.filter(
    (element): element is PlanAssetElement => element.kind === "image" || element.kind === "pdf_page",
  );
  const existingPlacementKeys = new Set(plan.layout.elements.flatMap((element) => (
    element.kind === "image" || element.kind === "pdf_page"
      ? [`${element.assetId}:${element.kind === "pdf_page" ? element.pageNumber ?? 1 : "image"}`]
      : []
  )));
  const existingElementIds = new Set(plan.layout.elements.map((element) => element.id));
  const missingDocumentElements = defaultDocumentElements.filter((element) => {
    const placementKey = `${element.assetId}:${element.kind === "pdf_page" ? element.pageNumber ?? 1 : "image"}`;
    return !existingPlacementKeys.has(placementKey) && !existingElementIds.has(element.id);
  });
  return {
    ...plan,
    includedAssetIds: [...new Set([...plan.includedAssetIds, ...defaultPlan.includedAssetIds])],
    layout: {
      ...plan.layout,
      elements: [...plan.layout.elements, ...structuredClone(missingDocumentElements)],
    },
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
  if (sourceSchemaVersion >= CATEGORY_ASSIGNMENT_CORRECTION_SCHEMA_VERSION) return block;
  const correction = CATEGORY_ASSIGNMENT_CORRECTIONS[block.id];
  if (!correction || block.primaryCategoryId !== correction.previousCategoryId) return block;
  return { ...block, primaryCategoryId: correction.correctedCategoryId };
}

function deduplicateDefaultCatalogTitle(block: BuildingBlock, sourceSchemaVersion: number): BuildingBlock {
  if (sourceSchemaVersion >= CATALOG_TITLE_DEDUPLICATION_SCHEMA_VERSION || block.id !== IMPORTED_UTILITIES_BLOCK_ID) return block;
  const translations = structuredClone(block.translations);
  let changed = false;
  for (const locale of ["de", "en"] as const) {
    if (translations[locale].title !== LEGACY_IMPORTED_UTILITIES_TITLES[locale]) continue;
    translations[locale].title = CORRECTED_IMPORTED_UTILITIES_TITLES[locale];
    changed = true;
  }
  return changed ? { ...block, translations } : block;
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

function migrateAssignmentCompaniesToContactAffiliations(
  organizationId: string,
  assignments: PersistedProjectContactAssignment[],
  affiliations: ContactCompanyAffiliation[],
): { assignments: ProjectContactAssignment[]; affiliations: ContactCompanyAffiliation[] } {
  const migratedAffiliations = affiliations.map((affiliation) => ({ ...affiliation }));
  const migratedAssignments = assignments.map((assignment) => {
    if (assignment.companyId) {
      const existingAffiliation = migratedAffiliations.find((affiliation) => (
        affiliation.contactId === assignment.contactId && affiliation.companyId === assignment.companyId
      ));
      if (existingAffiliation && assignment.lifecycle === "active") {
        existingAffiliation.lifecycle = "active";
        existingAffiliation.updatedAt = assignment.updatedAt;
      } else if (!existingAffiliation) {
        migratedAffiliations.push({
          id: `affiliation-${assignment.id}`,
          organizationId,
          contactId: assignment.contactId,
          companyId: assignment.companyId,
          jobTitle: "",
          department: "",
          primary: false,
          lifecycle: assignment.lifecycle,
          createdAt: assignment.createdAt,
          updatedAt: assignment.updatedAt,
        });
      }
    }
    return withoutAssignmentCompany(assignment);
  });
  const primaryAffiliationIds = new Set<string>();
  const processedContactIds = new Set<string>();
  for (const affiliation of migratedAffiliations) {
    if (affiliation.lifecycle !== "active" || processedContactIds.has(affiliation.contactId)) continue;
    const activeAffiliations = migratedAffiliations.filter((candidate) => (
      candidate.contactId === affiliation.contactId && candidate.lifecycle === "active"
    ));
    processedContactIds.add(affiliation.contactId);
    primaryAffiliationIds.add(activeAffiliations.find((candidate) => candidate.primary)?.id ?? activeAffiliations[0].id);
  }
  return {
    assignments: migratedAssignments,
    affiliations: migratedAffiliations.map((affiliation) => ({
      ...affiliation,
      primary: affiliation.lifecycle === "active" && primaryAffiliationIds.has(affiliation.id),
    })),
  };
}

export function migrateDatabase(value: unknown): AppDatabase | null {
  if (!isDatabase(value)) return null;
  const source = value as PersistedDatabase;
  const defaults = createSeedDatabase();
  const locale = source.user?.preferredLocale ?? defaults.user.preferredLocale;
  const organization = {
    ...emptyOrganizationProfile(), ...defaults.organization, ...source.organization,
    address: { ...emptyOrganizationProfile().address, ...source.organization?.address },
  } as typeof source.organization & { defaultLocale?: Locale };
  Reflect.deleteProperty(organization, "defaultLocale");
  const defaultLogisticsProject = defaults.projects.find((project) => project.id === LOGISTICS_DEMO_PROJECT_ID)!;
  const defaultLogisticsPlan = defaults.plans.find((plan) => plan.projectId === LOGISTICS_DEMO_PROJECT_ID)!;
  const projectsBeforeContactMigration = source.projects
    .filter((project) => (source.schemaVersion ?? 0) >= DEMO_CONTENT_REFRESH_SCHEMA_VERSION || project.id !== REMOVED_DEMO_PROJECT_ID)
    .map((project) => migrateProject(project as PersistedProject, locale))
    .map((project) => removeSyntheticProjectInformation(project, source.schemaVersion ?? 0))
    .map(removeLegacyLiveProjectNumber)
    .map((project) => refreshLogisticsDemoDocuments(project, defaultLogisticsProject, source.schemaVersion ?? 0));
  const canonicalProjectContacts = migrateAssignmentCompaniesToContactAffiliations(
    organization.id,
    source.projectContactAssignments ?? [],
    source.contactAffiliations ?? [],
  );
  const contactMigration = migrateLegacyProjectContacts(
    organization.id,
    projectsBeforeContactMigration,
    (source.contacts ?? []).map(migrateContactName),
    source.companies ?? [],
    canonicalProjectContacts.affiliations,
    canonicalProjectContacts.assignments,
  );
  const projects = contactMigration.projects.map((project) => {
    const overviewSections = project.overviewSections.map((section) => {
      const detachedSection = { ...section } as ProjectOverviewSection & { templateId?: string };
      Reflect.deleteProperty(detachedSection, "templateId");
      return detachedSection;
    });
    const overviewSectionOrder = normalizeProjectOverviewSectionOrder(project.overviewSectionOrder, overviewSections);
    return {
      ...project,
      overviewSections: orderProjectOverviewSections(overviewSections, overviewSectionOrder),
      overviewSectionOrder,
    };
  });
  const projectRoleMigration = migrateProjectRoleCatalog(
    organization.id,
    source.projectRoleDefinitions ?? [],
    contactMigration.assignments,
  );
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const legacyAssessments = source.assessments ?? {};
  const assessmentRuns = (source.assessmentRuns?.length
    ? source.assessmentRuns
    : Object.entries(legacyAssessments).map(([projectId, answers]): ProjectAssessmentRun => {
      const project = projectById.get(projectId);
      return {
        id: `assessment-${projectId}-legacy`,
        projectId,
        definitionVersion: 1,
        answers,
        createdByName: source.user?.name ?? defaults.user.name,
        createdAt: project?.createdAt ?? MIGRATION_FALLBACK_TIMESTAMP,
        updatedAt: project?.updatedAt ?? MIGRATION_FALLBACK_TIMESTAMP,
        completedAt: project?.updatedAt ?? MIGRATION_FALLBACK_TIMESTAMP,
      };
    }))
    .filter((run) => projectById.has(run.projectId))
    .map((run) => ({
      ...run,
      definitionVersion: run.definitionVersion ?? 1,
      createdByName: run.createdByName ?? source.user?.name ?? defaults.user.name,
      createdAt: run.createdAt ?? projectById.get(run.projectId)?.createdAt ?? MIGRATION_FALLBACK_TIMESTAMP,
      updatedAt: run.updatedAt ?? run.createdAt ?? projectById.get(run.projectId)?.updatedAt ?? MIGRATION_FALLBACK_TIMESTAMP,
    }));
  const sourceCategories = (source.categories ?? []).map(migrateCategory);
  const sourceCategoryIds = new Set(sourceCategories.map((category) => category.id));
  const categories = [...sourceCategories, ...defaults.categories.filter((category) => !sourceCategoryIds.has(category.id))];
  const blocks = source.blocks
    .map(migrateBlock)
    .map((block) => correctDefaultCategoryAssignment(block, source.schemaVersion ?? 0))
    .map((block) => deduplicateDefaultCatalogTitle(block, source.schemaVersion ?? 0))
    .map((block) => normalizeBlockPlacement(block, categories));
  const migratedPlans = (source.plans ?? [])
    .filter((plan) => projectById.has(plan.projectId))
    .map((plan) => migratePlan(
      plan as PersistedPlan,
      source.user?.name ?? defaults.user.name,
      assessmentRuns.find((run) => run.projectId === plan.projectId && run.completedAt)?.id,
    ))
    .map((plan) => migratePlanCategoryHierarchy(plan, categories, blocks, source.schemaVersion ?? 0))
    .map((plan) => removeAutomaticTitleBlock(plan, source.schemaVersion ?? 0))
    .map((plan) => removeReplacedDemoCanvasElements(plan, source.schemaVersion ?? 0))
    .map((plan) => placeDefaultLogisticsDocuments(plan, defaultLogisticsPlan, source.schemaVersion ?? 0));
  const activeProjectIds = new Set<string>();
  const plans = migratedPlans.map((plan) => {
    if (plan.supersededAt || !activeProjectIds.has(plan.projectId)) {
      if (!plan.supersededAt) activeProjectIds.add(plan.projectId);
      return plan;
    }
    return { ...plan, supersededAt: plan.updatedAt };
  });
  const documentTemplates = (source.documentTemplates ?? defaults.documentTemplates)
    .filter((template) => template.origin === "custom" || template.documentType === "a4_plan")
    .map((template) => ({
      ...template,
      name: template.origin === "standard" ? "QuickSiGe Standard" : template.name,
      lifecycle: template.lifecycle ?? "active" as const,
      revision: template.revision ?? 1,
    }));
  const documentTemplateIds = new Set(documentTemplates.map((template) => template.id));
  const sourceWithoutLegacyAssessments = { ...source };
  Reflect.deleteProperty(sourceWithoutLegacyAssessments, "assessments");
  const migrated: AppDatabase = {
    ...defaults,
    ...sourceWithoutLegacyAssessments,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    organization,
    projects,
    contacts: contactMigration.contacts,
    companies: contactMigration.companies,
    contactAffiliations: contactMigration.affiliations,
    projectContactAssignments: projectRoleMigration.assignments,
    projectRoleDefinitions: projectRoleMigration.definitions,
    externalContactIdentities: source.externalContactIdentities ?? [],
    contactImportBatches: (source.contactImportBatches ?? []).map((batch) => ({
      ...batch,
      items: batch.items.map((item) => ({
        ...item,
        previousContact: item.previousContact ? migrateContactName(item.previousContact as PersistedContact) : undefined,
        previousAssignment: item.previousAssignment ? withoutAssignmentCompany(item.previousAssignment) : undefined,
      })),
    })),
    assessmentRuns,
    blocks,
    categories,
    plans,
    revisions: (source.revisions ?? []).filter((revision) => projectById.has(revision.projectId)).map((revision) => {
      const snapshotCategories = (revision.snapshot.categories ?? categories).map(migrateCategory);
      const snapshotBlocks = (revision.snapshot.blocks ?? source.blocks)
        .map(migrateBlock)
        .map((block) => deduplicateDefaultCatalogTitle(block, source.schemaVersion ?? 0))
        .map((block) => normalizeBlockPlacement(block, snapshotCategories));
      const snapshotPlan = migratePlan(revision.snapshot.plan as PersistedPlan, source.user?.name ?? defaults.user.name);
      return {
        ...revision,
        snapshot: {
          ...revision.snapshot,
          project: refreshLogisticsDemoDocuments(
            removeSyntheticProjectInformation(
              migrateProject(revision.snapshot.project as PersistedProject, locale),
              source.schemaVersion ?? 0,
            ),
            defaultLogisticsProject,
            source.schemaVersion ?? 0,
          ),
          plan: removeReplacedDemoCanvasElements(
            removeAutomaticTitleBlock(
              migratePlanCategoryHierarchy(snapshotPlan, snapshotCategories, snapshotBlocks, source.schemaVersion ?? 0),
              source.schemaVersion ?? 0,
            ),
            source.schemaVersion ?? 0,
          ),
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
    documentConfigurations: (source.documentConfigurations ?? []).filter((configuration) => projectById.has(configuration.projectId) && documentTemplateIds.has(configuration.templateId)),
    generatedDocuments: (source.generatedDocuments ?? []).filter((document) => projectById.has(document.projectId)).map((document) => {
      const project = projects.find((candidate) => candidate.id === document.projectId) ?? projects[0];
      const plan = plans.find((candidate) => candidate.projectId === document.projectId && !candidate.supersededAt);
      return {
        ...document,
        templateRevision: document.templateRevision ?? 1,
        projectSnapshot: removeSyntheticProjectInformation(
          migrateProject((document.projectSnapshot ?? structuredClone(project)) as PersistedProject, locale),
          source.schemaVersion ?? 0,
        ),
        planSnapshot: document.planSnapshot ? migratePlan(document.planSnapshot as PersistedPlan, source.user?.name ?? defaults.user.name) : plan ? structuredClone(plan) : undefined,
        language: document.language ?? locale,
        dependencyFingerprint: document.dependencyFingerprint ?? "legacy",
        stale: document.stale ?? true,
      };
    }),
    auditEvents: (source.auditEvents ?? []).filter((event) => !event.projectId || projectById.has(event.projectId)),
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

  loadContacts(): ContactsRepositorySnapshot {
    return structuredClone(contactsRepositorySnapshot(this.load()));
  }

  saveContacts(snapshot: ContactsRepositorySnapshot): void {
    this.save({ ...this.load(), ...structuredClone(snapshot) });
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
