import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { LocalStorageRepository, type AppRepository } from "../data/localRepository";
import { deleteBlob } from "../data/blobRepository";
import { defaultAssessmentAnswers } from "../data/seed";
import { createPlanFromAssessment } from "../domain/recommendationEngine";
import { buildRevisionSnapshot } from "../domain/revisionSnapshot";
import { blockHierarchyColor, categoryPlacementIds } from "../domain/categoryTree";
import { instantiateOverviewSection, localizeOverviewTemplate, normalizeOverviewKey, validateOverviewTemplate } from "../domain/overviewTemplates";
import type {
  AppDatabase, AssessmentAnswers, BuildingBlock, BuildingBlockCategory, DocumentTemplate, GeneratedDocument,
  Locale, OverviewTemplate, Plan, PlanRevision, Project, ProjectDocumentConfiguration, ProjectFormValues, ProjectStatus, Recommendation,
} from "../domain/types";

interface PublishInput { index: string; changeSummary: string; approvedBy: string }

interface AppContextValue {
  database: AppDatabase;
  setLocale: (locale: Locale) => void;
  createProject: (values: ProjectFormValues) => Project;
  deleteProject: (projectId: string) => Promise<void>;
  updateProject: (project: Project) => void;
  updateProjectStatus: (projectId: string, status: ProjectStatus) => void;
  saveAssessment: (projectId: string, answers: AssessmentAnswers) => void;
  createPlan: (projectId: string, recommendations?: Recommendation[]) => Plan;
  updatePlan: (plan: Plan) => void;
  publishPlan: (planId: string, input: PublishInput) => PlanRevision;
  saveBlock: (block: BuildingBlock) => void;
  archiveBlock: (blockId: string) => void;
  restoreBlock: (blockId: string) => void;
  saveCategory: (category: BuildingBlockCategory) => void;
  reorderCategories: (parentId: string | undefined, orderedCategoryIds: string[]) => void;
  archiveCategory: (categoryId: string) => void;
  restoreCategory: (categoryId: string) => void;
  applyOverviewTemplates: (projectId: string, templateIds: string[]) => void;
  saveOverviewTemplate: (template: OverviewTemplate, locale?: Locale) => void;
  deleteOverviewTemplate: (templateId: string) => void;
  saveDocumentTemplate: (template: DocumentTemplate) => void;
  deleteDocumentTemplate: (templateId: string) => void;
  setDocumentTemplate: (configuration: ProjectDocumentConfiguration) => void;
  addGeneratedDocument: (document: GeneratedDocument) => void;
  migrationRecovery: { available: boolean; error: string | null };
  restoreMigrationBackup: () => void;
  downloadMigrationBackup: () => void;
  resetDemo: () => void;
  getProject: (projectId: string) => Project | undefined;
  getPlanForProject: (projectId: string) => Plan | undefined;
  getAssessment: (projectId: string) => AssessmentAnswers;
}

const AppContext = createContext<AppContextValue | null>(null);

export function newId(prefix: string): string {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${randomId}`;
}

function applyProjectTemplates(project: Project, templateIds: string[], templates: OverviewTemplate[], locale: Locale): Project {
  return templateIds.reduce((current, templateId) => {
    const template = templates.find((candidate) => candidate.id === templateId);
    const localizedTemplate = template && localizeOverviewTemplate(template, locale);
    if (!template || !localizedTemplate || current.overviewSections.some((section) => section.templateId === template.id || section.placeholderKey === normalizeOverviewKey(localizedTemplate.name, "template"))) return current;
    return { ...current, overviewSections: [...current.overviewSections, instantiateOverviewSection(template, newId, locale)] };
  }, project);
}

export function AppProvider({ children, repository: providedRepository }: { children: ReactNode; repository?: AppRepository }) {
  const repository = useRef<AppRepository>(providedRepository ?? new LocalStorageRepository());
  const [database, setDatabase] = useState<AppDatabase>(() => repository.current.load());
  const commit = useCallback((updater: (current: AppDatabase) => AppDatabase) => {
    setDatabase((current) => { const next = updater(current); repository.current.save(next); return next; });
  }, []);

  const setLocale = useCallback((locale: Locale) => commit((current) => ({ ...current, user: { ...current.user, preferredLocale: locale } })), [commit]);
  const createProject = useCallback((values: ProjectFormValues): Project => {
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const initialProject: Project = {
      id: newId("project"), organizationId: database.organization.id,
      projectNumber: `QS-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
      name: values.name,
      description: "",
      address: "",
      city: "",
      constructionType: "new_build",
      startDate: today,
      endDate: today,
      status: "draft",
      documentLocale: database.user.preferredLocale,
      participants: [], emergencyContacts: [], customFields: [], customSections: [],
      overviewSections: values.overviewSections,
      assets: [], documentFolders: [], createdAt: now, updatedAt: now,
    };
    const project = initialProject;
    commit((current) => ({
      ...current, projects: [project, ...current.projects],
      assessments: { ...current.assessments, [project.id]: { ...defaultAssessmentAnswers } },
      auditEvents: [...current.auditEvents, { id: newId("audit"), projectId: project.id, action: "project.created", actorName: current.user.name, createdAt: now, details: project.name }],
    }));
    return project;
  }, [commit, database.organization.id, database.user.preferredLocale]);

  const deleteProject = useCallback(async (projectId: string): Promise<void> => {
    const project = database.projects.find((candidate) => candidate.id === projectId);
    if (!project) return;
    const projectDocuments = database.generatedDocuments.filter((document) => document.projectId === projectId);
    const projectRevisions = database.revisions.filter((revision) => revision.projectId === projectId);
    const revisionDocuments = projectRevisions.flatMap((revision) => revision.snapshot.generatedDocuments);
    const revisionAssets = projectRevisions.flatMap((revision) => revision.snapshot.project.assets);
    const blobIds = new Set([
      ...project.assets.flatMap((asset) => [asset.blobId, asset.previewBlobId]),
      ...revisionAssets.flatMap((asset) => [asset.blobId, asset.previewBlobId]),
      ...projectDocuments.map((document) => document.blobId),
      ...revisionDocuments.map((document) => document.blobId),
    ].filter((blobId): blobId is string => Boolean(blobId)));
    await Promise.all([...blobIds].map((blobId) => deleteBlob(blobId)));
    commit((current) => {
      const assessments = { ...current.assessments };
      Reflect.deleteProperty(assessments, projectId);
      return {
        ...current,
        projects: current.projects.filter((candidate) => candidate.id !== projectId),
        assessments,
        plans: current.plans.filter((plan) => plan.projectId !== projectId),
        revisions: current.revisions.filter((revision) => revision.projectId !== projectId),
        documentConfigurations: current.documentConfigurations.filter((configuration) => configuration.projectId !== projectId),
        generatedDocuments: current.generatedDocuments.filter((document) => document.projectId !== projectId),
        auditEvents: current.auditEvents.filter((event) => event.projectId !== projectId),
      };
    });
  }, [commit, database.generatedDocuments, database.projects, database.revisions]);

  const updateProject = useCallback((project: Project) => {
    const now = new Date().toISOString();
    commit((current) => ({
      ...current,
      projects: current.projects.map((candidate) => candidate.id === project.id ? { ...project, updatedAt: now } : candidate),
      plans: current.plans.map((plan) => plan.projectId === project.id ? { ...plan, status: "draft", updatedAt: now } : plan),
      generatedDocuments: current.generatedDocuments.map((document) => document.projectId === project.id ? { ...document, stale: true } : document),
    }));
  }, [commit]);

  const updateProjectStatus = useCallback((projectId: string, status: ProjectStatus) => {
    const now = new Date().toISOString();
    commit((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === projectId ? { ...project, status, updatedAt: now } : project),
    }));
  }, [commit]);

  const saveAssessment = useCallback((projectId: string, answers: AssessmentAnswers) => {
    const now = new Date().toISOString();
    commit((current) => ({
      ...current, assessments: { ...current.assessments, [projectId]: answers },
      projects: current.projects.map((project) => project.id === projectId ? { ...project, updatedAt: now } : project),
      auditEvents: [...current.auditEvents, { id: newId("audit"), projectId, action: "assessment.saved", actorName: current.user.name, createdAt: now, details: "Guided assessment updated" }],
    }));
  }, [commit]);

  const createPlan = useCallback((projectId: string, recommendations?: Recommendation[]): Plan => {
    const project = database.projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const plan = createPlanFromAssessment(project, database.assessments[projectId] ?? defaultAssessmentAnswers, database.blocks, database.categories, recommendations);
    commit((current) => ({ ...current, plans: [plan, ...current.plans.filter((candidate) => candidate.projectId !== projectId)], projects: current.projects.map((candidate) => candidate.id === projectId ? { ...candidate, updatedAt: plan.updatedAt } : candidate) }));
    return plan;
  }, [commit, database.assessments, database.blocks, database.categories, database.projects]);

  const updatePlan = useCallback((plan: Plan) => {
    const updatedPlan = { ...plan, status: "draft" as const, updatedAt: new Date().toISOString() };
    commit((current) => ({
      ...current,
      plans: current.plans.map((candidate) => candidate.id === plan.id ? updatedPlan : candidate),
      projects: current.projects.map((project) => project.id === plan.projectId ? { ...project, updatedAt: updatedPlan.updatedAt } : project),
      generatedDocuments: current.generatedDocuments.map((document) => document.projectId === plan.projectId ? { ...document, stale: true } : document),
    }));
  }, [commit]);

  const publishPlan = useCallback((planId: string, input: PublishInput): PlanRevision => {
    const plan = database.plans.find((candidate) => candidate.id === planId);
    const project = plan && database.projects.find((candidate) => candidate.id === plan.projectId);
    if (!plan || !project) throw new Error("Plan or project not found");
    const publishedAt = new Date().toISOString();
    const publishedPlan: Plan = { ...plan, status: "published", updatedAt: publishedAt };
    const revision: PlanRevision = {
      id: newId("revision"), projectId: project.id, planId: plan.id, ...input, publishedAt,
      snapshot: buildRevisionSnapshot(database, { ...project, updatedAt: publishedAt }, publishedPlan),
    };
    commit((current) => ({ ...current, plans: current.plans.map((candidate) => candidate.id === planId ? publishedPlan : candidate), projects: current.projects.map((candidate) => candidate.id === project.id ? { ...candidate, updatedAt: publishedAt } : candidate), revisions: [revision, ...current.revisions] }));
    return revision;
  }, [commit, database]);

  const saveBlock = useCallback((block: BuildingBlock) => commit((current) => {
    const normalizedBlock = {
      ...block,
      categoryIds: categoryPlacementIds(block.primaryCategoryId, current.categories),
      color: blockHierarchyColor(block, current.categories),
    };
    return { ...current, blocks: current.blocks.some((candidate) => candidate.id === block.id) ? current.blocks.map((candidate) => candidate.id === block.id ? normalizedBlock : candidate) : [normalizedBlock, ...current.blocks] };
  }), [commit]);
  const archiveBlock = useCallback((blockId: string) => commit((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === blockId ? { ...block, lifecycle: "archived" } : block) })), [commit]);
  const restoreBlock = useCallback((blockId: string) => commit((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === blockId ? { ...block, lifecycle: "active" } : block) })), [commit]);
  const saveCategory = useCallback((category: BuildingBlockCategory) => commit((current) => {
    const categories = current.categories.some((candidate) => candidate.id === category.id)
      ? current.categories.map((candidate) => candidate.id === category.id ? category : candidate)
      : [...current.categories, category];
    const blocks = current.blocks.map((block) => ({
      ...block,
      categoryIds: categoryPlacementIds(block.primaryCategoryId, categories),
      color: blockHierarchyColor(block, categories),
    }));
    return { ...current, categories, blocks };
  }), [commit]);
  const reorderCategories = useCallback((parentId: string | undefined, orderedCategoryIds: string[]) => commit((current) => {
    const positions = new Map(orderedCategoryIds.map((categoryId, index) => [categoryId, index]));
    return {
      ...current,
      categories: current.categories.map((category) => {
        const position = positions.get(category.id);
        return category.parentId === parentId && position !== undefined ? { ...category, sortOrder: position } : category;
      }),
    };
  }), [commit]);
  const archiveCategory = useCallback((categoryId: string) => commit((current) => ({ ...current, categories: current.categories.map((category) => category.id === categoryId ? { ...category, lifecycle: "archived" } : category) })), [commit]);
  const restoreCategory = useCallback((categoryId: string) => commit((current) => ({ ...current, categories: current.categories.map((category) => category.id === categoryId ? { ...category, lifecycle: "active" } : category) })), [commit]);
  const applyTemplatesToProject = useCallback((projectId: string, templateIds: string[]) => {
    commit((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === projectId
        ? { ...applyProjectTemplates(project, templateIds, current.overviewTemplates, current.user.preferredLocale), updatedAt: new Date().toISOString() }
        : project),
    }));
  }, [commit]);
  const saveOverviewTemplate = useCallback((template: OverviewTemplate, locale?: Locale) => commit((current) => {
    const validationLocale = locale ?? current.user.preferredLocale;
    const localizedTemplate = localizeOverviewTemplate(template, validationLocale);
    const localizedTemplates = current.overviewTemplates.map((candidate) => localizeOverviewTemplate(candidate, validationLocale));
    if (!validateOverviewTemplate(localizedTemplate, localizedTemplates).valid) return current;
    return { ...current, overviewTemplates: current.overviewTemplates.some((candidate) => candidate.id === template.id) ? current.overviewTemplates.map((candidate) => candidate.id === template.id ? template : candidate) : [template, ...current.overviewTemplates] };
  }), [commit]);
  const deleteOverviewTemplate = useCallback((templateId: string) => commit((current) => ({ ...current, overviewTemplates: current.overviewTemplates.filter((template) => template.id !== templateId) })), [commit]);
  const saveDocumentTemplate = useCallback((template: DocumentTemplate) => commit((current) => {
    const existing = current.documentTemplates.find((candidate) => candidate.id === template.id);
    const saved = { ...template, lifecycle: template.lifecycle ?? "active" as const, revision: existing && existing.blobId !== template.blobId ? (existing.revision ?? 1) + 1 : template.revision ?? 1 };
    return { ...current, documentTemplates: existing ? current.documentTemplates.map((candidate) => candidate.id === template.id ? saved : candidate) : [saved, ...current.documentTemplates] };
  }), [commit]);
  const deleteDocumentTemplate = useCallback((templateId: string) => commit((current) => {
    const template = current.documentTemplates.find((candidate) => candidate.id === templateId);
    if (!template || template.origin === "standard") return current;
    return {
      ...current,
      documentTemplates: current.documentTemplates.filter((candidate) => candidate.id !== templateId),
      documentConfigurations: current.documentConfigurations.filter((configuration) => configuration.templateId !== templateId),
    };
  }), [commit]);
  const setDocumentTemplate = useCallback((configuration: ProjectDocumentConfiguration) => commit((current) => ({ ...current, documentConfigurations: [...current.documentConfigurations.filter((candidate) => !(candidate.projectId === configuration.projectId && candidate.documentType === configuration.documentType)), configuration] })), [commit]);
  const addGeneratedDocument = useCallback((document: GeneratedDocument) => commit((current) => ({ ...current, generatedDocuments: [document, ...current.generatedDocuments] })), [commit]);
  const restoreMigrationBackup = useCallback(() => setDatabase(repository.current.restoreBackup()), []);
  const downloadMigrationBackup = useCallback(() => {
    const raw = repository.current.exportBackup();
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `quicksige-migration-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }, []);
  const resetDemo = useCallback(() => setDatabase(repository.current.reset()), []);
  const value = useMemo<AppContextValue>(() => ({
    database, setLocale, createProject, deleteProject, updateProject, updateProjectStatus, saveAssessment, createPlan, updatePlan, publishPlan,
    saveBlock, archiveBlock, restoreBlock, saveCategory, reorderCategories, archiveCategory, restoreCategory,
    applyOverviewTemplates: applyTemplatesToProject, saveOverviewTemplate, deleteOverviewTemplate,
    saveDocumentTemplate, deleteDocumentTemplate, setDocumentTemplate, addGeneratedDocument, resetDemo,
    migrationRecovery: {
      available: repository.current.hasBackup(),
      error: repository.current.getMigrationError(),
    },
    restoreMigrationBackup, downloadMigrationBackup,
    getProject: (projectId) => database.projects.find((project) => project.id === projectId),
    getPlanForProject: (projectId) => database.plans.find((plan) => plan.projectId === projectId),
    getAssessment: (projectId) => database.assessments[projectId] ?? { ...defaultAssessmentAnswers },
  }), [database, setLocale, createProject, deleteProject, updateProject, updateProjectStatus, saveAssessment, createPlan, updatePlan, publishPlan, saveBlock, archiveBlock, restoreBlock, saveCategory, reorderCategories, archiveCategory, restoreCategory, applyTemplatesToProject, saveOverviewTemplate, deleteOverviewTemplate, saveDocumentTemplate, deleteDocumentTemplate, setDocumentTemplate, addGeneratedDocument, restoreMigrationBackup, downloadMigrationBackup, resetDemo]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
