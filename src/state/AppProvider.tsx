import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { LocalStorageRepository, type AppRepository } from "../data/localRepository";
import { defaultAssessmentAnswers } from "../data/seed";
import { createPlanFromAssessment } from "../domain/recommendationEngine";
import { buildRevisionSnapshot } from "../domain/revisionSnapshot";
import type {
  AppDatabase, AssessmentAnswers, BuildingBlock, BuildingBlockCategory, DocumentTemplate, GeneratedDocument,
  Locale, OverviewTemplate, Plan, PlanRevision, Project, ProjectDocumentConfiguration, ProjectFormValues, Recommendation,
} from "../domain/types";

interface PublishInput { index: string; changeSummary: string; approvedBy: string }

interface AppContextValue {
  database: AppDatabase;
  setLocale: (locale: Locale) => void;
  createProject: (values: ProjectFormValues) => Project;
  updateProject: (project: Project) => void;
  saveAssessment: (projectId: string, answers: AssessmentAnswers) => void;
  createPlan: (projectId: string, recommendations?: Recommendation[]) => Plan;
  updatePlan: (plan: Plan) => void;
  publishPlan: (planId: string, input: PublishInput) => PlanRevision;
  saveBlock: (block: BuildingBlock) => void;
  duplicateBlock: (blockId: string) => BuildingBlock;
  archiveBlock: (blockId: string) => void;
  restoreBlock: (blockId: string) => void;
  saveCategory: (category: BuildingBlockCategory) => void;
  archiveCategory: (categoryId: string) => void;
  restoreCategory: (categoryId: string) => void;
  applyOverviewTemplates: (projectId: string, templateIds: string[]) => void;
  saveOverviewTemplate: (template: OverviewTemplate) => void;
  duplicateOverviewTemplate: (templateId: string) => OverviewTemplate;
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

function cloneTemplateEntryId(prefix: string): string { return newId(prefix); }

function normalizedTemplateKey(value: string, fallback: string): string {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return normalized || fallback;
}

function cloneUniqueFields(existing: Project["customFields"], incoming: OverviewTemplate["fields"]): Project["customFields"] {
  const used = new Set(existing.map((field) => field.placeholderKey));
  return incoming.map((field, index) => {
    const baseKey = normalizedTemplateKey(field.placeholderKey || field.key, `field_${index + 1}`);
    let placeholderKey = baseKey;
    let suffix = 2;
    while (used.has(placeholderKey)) { placeholderKey = `${baseKey}_${suffix}`; suffix += 1; }
    used.add(placeholderKey);
    return { ...field, id: cloneTemplateEntryId("field"), placeholderKey };
  });
}

function applyProjectTemplates(project: Project, templateIds: string[], templates: OverviewTemplate[]): Project {
  return templateIds.reduce((current, templateId) => {
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) return current;
    if (template.kind === "project_details") {
      return { ...current, customFields: [...current.customFields, ...cloneUniqueFields(current.customFields, template.fields)] };
    }
    if (template.kind === "emergency_contacts") {
      return { ...current, emergencyContacts: [...current.emergencyContacts, ...template.emergencyContacts.map((contact) => ({ ...contact, id: cloneTemplateEntryId("emergency") }))] };
    }
    if (template.kind === "participants") {
      return { ...current, participants: [...current.participants, ...template.participants.map((participant) => ({ ...participant, id: cloneTemplateEntryId("participant") }))] };
    }
    const usedSectionKeys = new Set(current.customSections.map((section) => section.placeholderKey));
    const baseSectionKey = normalizedTemplateKey(template.title ?? template.name, `section_${current.customSections.length + 1}`);
    let sectionKey = baseSectionKey;
    let sectionSuffix = 2;
    while (usedSectionKeys.has(sectionKey)) { sectionKey = `${baseSectionKey}_${sectionSuffix}`; sectionSuffix += 1; }
    return {
      ...current,
      customSections: [...current.customSections, {
        id: cloneTemplateEntryId("section"), title: template.title ?? template.name,
        placeholderKey: sectionKey,
        fields: cloneUniqueFields([], template.fields),
      }],
    };
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
    const { templateIds = [], ...projectValues } = values;
    const initialProject: Project = {
      ...projectValues, id: newId("project"), organizationId: database.organization.id, status: "draft",
      participants: [], emergencyContacts: [], customFields: [], customSections: [], assets: [], createdAt: now, updatedAt: now,
    };
    const project = applyProjectTemplates(initialProject, templateIds, database.overviewTemplates);
    commit((current) => ({
      ...current, projects: [project, ...current.projects],
      assessments: { ...current.assessments, [project.id]: { ...defaultAssessmentAnswers } },
      auditEvents: [...current.auditEvents, { id: newId("audit"), projectId: project.id, action: "project.created", actorName: current.user.name, createdAt: now, details: project.name }],
    }));
    return project;
  }, [commit, database.organization.id, database.overviewTemplates]);

  const updateProject = useCallback((project: Project) => {
    const now = new Date().toISOString();
    commit((current) => ({
      ...current,
      projects: current.projects.map((candidate) => candidate.id === project.id ? { ...project, status: current.plans.some((plan) => plan.projectId === project.id) ? "in_review" : "draft", updatedAt: now } : candidate),
      plans: current.plans.map((plan) => plan.projectId === project.id ? { ...plan, status: "draft", updatedAt: now } : plan),
      generatedDocuments: current.generatedDocuments.map((document) => document.projectId === project.id ? { ...document, stale: true } : document),
    }));
  }, [commit]);

  const saveAssessment = useCallback((projectId: string, answers: AssessmentAnswers) => {
    const now = new Date().toISOString();
    commit((current) => ({
      ...current, assessments: { ...current.assessments, [projectId]: answers },
      projects: current.projects.map((project) => project.id === projectId ? { ...project, status: "in_review", updatedAt: now } : project),
      auditEvents: [...current.auditEvents, { id: newId("audit"), projectId, action: "assessment.saved", actorName: current.user.name, createdAt: now, details: "Guided assessment updated" }],
    }));
  }, [commit]);

  const createPlan = useCallback((projectId: string, recommendations?: Recommendation[]): Plan => {
    const project = database.projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const plan = createPlanFromAssessment(project, database.assessments[projectId] ?? defaultAssessmentAnswers, database.blocks, database.categories, recommendations);
    commit((current) => ({ ...current, plans: [plan, ...current.plans.filter((candidate) => candidate.projectId !== projectId)], projects: current.projects.map((candidate) => candidate.id === projectId ? { ...candidate, status: "in_review", updatedAt: plan.updatedAt } : candidate) }));
    return plan;
  }, [commit, database.assessments, database.blocks, database.categories, database.projects]);

  const updatePlan = useCallback((plan: Plan) => {
    const updatedPlan = { ...plan, status: "draft" as const, updatedAt: new Date().toISOString() };
    commit((current) => ({
      ...current,
      plans: current.plans.map((candidate) => candidate.id === plan.id ? updatedPlan : candidate),
      projects: current.projects.map((project) => project.id === plan.projectId ? { ...project, status: "in_review", updatedAt: updatedPlan.updatedAt } : project),
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
      snapshot: buildRevisionSnapshot(database, { ...project, status: "published", updatedAt: publishedAt }, publishedPlan),
    };
    commit((current) => ({ ...current, plans: current.plans.map((candidate) => candidate.id === planId ? publishedPlan : candidate), projects: current.projects.map((candidate) => candidate.id === project.id ? { ...candidate, status: "published", updatedAt: publishedAt } : candidate), revisions: [revision, ...current.revisions] }));
    return revision;
  }, [commit, database]);

  const saveBlock = useCallback((block: BuildingBlock) => commit((current) => ({ ...current, blocks: current.blocks.some((candidate) => candidate.id === block.id) ? current.blocks.map((candidate) => candidate.id === block.id ? block : candidate) : [block, ...current.blocks] })), [commit]);
  const duplicateBlock = useCallback((blockId: string): BuildingBlock => {
    const source = database.blocks.find((block) => block.id === blockId);
    if (!source) throw new Error("Building block not found");
    const duplicate: BuildingBlock = {
      ...structuredClone(source), id: newId("block"), code: `${source.code}-COPY`, lifecycle: "active",
      provenance: { kind: "organization", label: "Organization content", sourceReference: source.id },
      translations: {
        de: { ...source.translations.de, title: `${source.translations.de.title} (Kopie)` },
        en: { ...source.translations.en, title: `${source.translations.en.title} (copy)` },
      },
    };
    commit((current) => ({ ...current, blocks: [duplicate, ...current.blocks] }));
    return duplicate;
  }, [commit, database.blocks]);
  const archiveBlock = useCallback((blockId: string) => commit((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === blockId ? { ...block, lifecycle: "archived" } : block) })), [commit]);
  const restoreBlock = useCallback((blockId: string) => commit((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === blockId ? { ...block, lifecycle: "active" } : block) })), [commit]);
  const saveCategory = useCallback((category: BuildingBlockCategory) => commit((current) => ({ ...current, categories: current.categories.some((candidate) => candidate.id === category.id) ? current.categories.map((candidate) => candidate.id === category.id ? category : candidate) : [...current.categories, category] })), [commit]);
  const archiveCategory = useCallback((categoryId: string) => commit((current) => ({ ...current, categories: current.categories.map((category) => category.id === categoryId ? { ...category, lifecycle: "archived" } : category) })), [commit]);
  const restoreCategory = useCallback((categoryId: string) => commit((current) => ({ ...current, categories: current.categories.map((category) => category.id === categoryId ? { ...category, lifecycle: "active" } : category) })), [commit]);
  const applyTemplatesToProject = useCallback((projectId: string, templateIds: string[]) => {
    commit((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === projectId
        ? { ...applyProjectTemplates(project, templateIds, current.overviewTemplates), updatedAt: new Date().toISOString() }
        : project),
    }));
  }, [commit]);
  const saveOverviewTemplate = useCallback((template: OverviewTemplate) => commit((current) => ({ ...current, overviewTemplates: current.overviewTemplates.some((candidate) => candidate.id === template.id) ? current.overviewTemplates.map((candidate) => candidate.id === template.id ? template : candidate) : [template, ...current.overviewTemplates] })), [commit]);
  const duplicateOverviewTemplate = useCallback((templateId: string): OverviewTemplate => {
    const source = database.overviewTemplates.find((template) => template.id === templateId);
    if (!source) throw new Error("Overview template not found");
    const now = new Date().toISOString();
    const duplicate = { ...structuredClone(source), id: newId("overview-template"), name: `${source.name} – Copy`, lifecycle: "active" as const, createdAt: now, updatedAt: now };
    commit((current) => ({ ...current, overviewTemplates: [duplicate, ...current.overviewTemplates] }));
    return duplicate;
  }, [commit, database.overviewTemplates]);
  const deleteOverviewTemplate = useCallback((templateId: string) => commit((current) => ({ ...current, overviewTemplates: current.overviewTemplates.filter((template) => template.id !== templateId) })), [commit]);
  const saveDocumentTemplate = useCallback((template: DocumentTemplate) => commit((current) => {
    const existing = current.documentTemplates.find((candidate) => candidate.id === template.id);
    const saved = { ...template, lifecycle: template.lifecycle ?? "active" as const, revision: existing && existing.blobId !== template.blobId ? (existing.revision ?? 1) + 1 : template.revision ?? 1 };
    return { ...current, documentTemplates: existing ? current.documentTemplates.map((candidate) => candidate.id === template.id ? saved : candidate) : [saved, ...current.documentTemplates] };
  }), [commit]);
  const deleteDocumentTemplate = useCallback((templateId: string) => commit((current) => {
    const referenced = current.documentConfigurations.some((configuration) => configuration.templateId === templateId)
      || current.generatedDocuments.some((document) => document.templateId === templateId)
      || current.revisions.some((revision) => revision.snapshot.documentConfigurations.some((configuration) => configuration.templateId === templateId));
    return {
      ...current,
      documentTemplates: referenced
        ? current.documentTemplates.map((template) => template.id === templateId ? { ...template, lifecycle: "archived" } : template)
        : current.documentTemplates.filter((template) => template.id !== templateId),
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
    database, setLocale, createProject, updateProject, saveAssessment, createPlan, updatePlan, publishPlan,
    saveBlock, duplicateBlock, archiveBlock, restoreBlock, saveCategory, archiveCategory, restoreCategory,
    applyOverviewTemplates: applyTemplatesToProject, saveOverviewTemplate, duplicateOverviewTemplate, deleteOverviewTemplate,
    saveDocumentTemplate, deleteDocumentTemplate, setDocumentTemplate, addGeneratedDocument, resetDemo,
    migrationRecovery: {
      available: repository.current.hasBackup(),
      error: repository.current.getMigrationError(),
    },
    restoreMigrationBackup, downloadMigrationBackup,
    getProject: (projectId) => database.projects.find((project) => project.id === projectId),
    getPlanForProject: (projectId) => database.plans.find((plan) => plan.projectId === projectId),
    getAssessment: (projectId) => database.assessments[projectId] ?? { ...defaultAssessmentAnswers },
  }), [database, setLocale, createProject, updateProject, saveAssessment, createPlan, updatePlan, publishPlan, saveBlock, duplicateBlock, archiveBlock, restoreBlock, saveCategory, archiveCategory, restoreCategory, applyTemplatesToProject, saveOverviewTemplate, duplicateOverviewTemplate, deleteOverviewTemplate, saveDocumentTemplate, deleteDocumentTemplate, setDocumentTemplate, addGeneratedDocument, restoreMigrationBackup, downloadMigrationBackup, resetDemo]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
