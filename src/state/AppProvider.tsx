import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from "react";
import { contactsRepositorySnapshot, LocalStorageRepository, type AppRepository } from "../data/localRepository";
import { deleteBlob } from "../data/blobRepository";
import { defaultAssessmentAnswers } from "../data/seed";
import { createPlanFromAssessment } from "../domain/recommendationEngine";
import { buildRevisionSnapshot } from "../domain/revisionSnapshot";
import { activePlanForProject, createDraftFromCurrentPlan, createDraftFromRevision, normalizePlanReason, replaceActivePlan } from "../domain/planLifecycle";
import { categoryPlacementIds, normalizeCategoryColorOwnership } from "../domain/categoryTree";
import { instantiateOverviewSection, localizeOverviewTemplate, uniqueProjectOverviewSectionKey, validateOverviewTemplate } from "../domain/overviewTemplates";
import { ensureSinglePrimary, projectContactRoleKey, projectWithResolvedParticipants } from "../domain/contacts";
import { normalizeProjectOverviewSectionOrder, orderProjectOverviewSections } from "../domain/projectOverviewOrder";
import { commitContactImport as applyContactImport, type ContactImportCommitInput } from "../domain/contactImportCommit";
import type {
  AppDatabase, AssessmentAnswers, BuildingBlock, BuildingBlockCategory, Company, Contact, ContactCompanyAffiliation,
  ContactImportBatch, DocumentTemplate, GeneratedDocument, Locale, OverviewTemplate, Plan, PlanRevision, Project,
  ProjectAssessmentRun, ProjectContactAssignment, ProjectDocumentConfiguration, ProjectFormValues, ProjectRoleDefinition, ProjectStatus, Recommendation,
} from "../domain/types";

interface PublishInput { index: string; changeSummary: string; approvedBy: string }
export interface CreateProjectContactSelection {
  contactId: string;
  roles: Array<{ role: ProjectContactAssignment["roles"][number]["role"]; roleDefinitionId?: string; customLabel?: string }>;
}
export interface CreateProjectRoleDefinitionInput { id: string; name: string }
export type ContactMergeResolution = Partial<Pick<Contact, "prefix" | "givenName" | "familyName" | "suffix" | "displayName" | "notes">>;
export type CompanyMergeResolution = Partial<Pick<Company, "website" | "domain" | "email" | "phone" | "address" | "notes">>;
const ASSESSMENT_DEFINITION_VERSION = 1;

export type CreatePlanInput =
  | { method: "guided_assessment"; assessmentRunId: string; recommendations?: Recommendation[]; reason?: string }
  | { method: "blank"; reason?: string }
  | { method: "current_plan"; reason?: string }
  | { method: "revision"; revisionId: string; reason?: string };

interface AppContextValue {
  database: AppDatabase;
  setLocale: (locale: Locale) => void;
  createProject: (values: ProjectFormValues, contactSelections?: CreateProjectContactSelection[], projectRoleDefinitions?: CreateProjectRoleDefinitionInput[]) => Project;
  deleteProject: (projectId: string) => Promise<void>;
  updateProject: (project: Project) => void;
  updateProjectStatus: (projectId: string, status: ProjectStatus) => void;
  saveContact: (contact: Contact) => void;
  archiveContact: (contactId: string) => void;
  restoreContact: (contactId: string) => void;
  deleteContact: (contactId: string) => boolean;
  mergeContacts: (survivorId: string, mergedId: string, resolution?: ContactMergeResolution) => void;
  assignContactsToProject: (contactIds: string[], projectId: string, role?: ProjectContactAssignment["roles"][number]["role"], customLabel?: string, roleDefinitionId?: string) => void;
  saveCompany: (company: Company) => void;
  mergeCompanies: (survivorId: string, mergedId: string, resolution?: CompanyMergeResolution) => void;
  archiveCompany: (companyId: string) => void;
  restoreCompany: (companyId: string) => void;
  deleteCompany: (companyId: string) => boolean;
  saveContactAffiliation: (affiliation: ContactCompanyAffiliation) => void;
  saveProjectContactAssignment: (assignment: ProjectContactAssignment) => void;
  removeProjectContactAssignment: (assignmentId: string) => void;
  createProjectRoleDefinition: (name: string, projectId?: string) => ProjectRoleDefinition | undefined;
  saveProjectRoleDefinition: (definition: ProjectRoleDefinition) => void;
  archiveProjectRoleDefinition: (definitionId: string) => void;
  reorderProjectRoleDefinitions: (orderedDefinitionIds: string[]) => void;
  addContactImportBatch: (batch: ContactImportBatch) => void;
  commitContactImport: (input: ContactImportCommitInput) => ContactImportBatch;
  undoContactImportBatch: (batchId: string) => { reverted: number; conflicts: number };
  recordContactExport: (format: "csv" | "vcard" | "json", count: number) => void;
  recordContactProviderEvent: (provider: "microsoft" | "google", event: "connected" | "disconnected" | "failed") => void;
  beginAssessment: (projectId: string, reason?: string) => ProjectAssessmentRun;
  saveAssessment: (projectId: string, assessmentRunId: string | undefined, answers: AssessmentAnswers, completed: boolean) => ProjectAssessmentRun;
  createPlan: (projectId: string, input: CreatePlanInput) => Plan;
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
  getAssessmentRun: (assessmentRunId: string) => ProjectAssessmentRun | undefined;
  getLatestAssessmentRun: (projectId: string) => ProjectAssessmentRun | undefined;
}

const AppContext = createContext<AppContextValue | null>(null);

export function newId(prefix: string): string {
  const randomId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${randomId}`;
}

function applyProjectTemplates(project: Project, templateIds: string[], templates: OverviewTemplate[], locale: Locale): Project {
  return templateIds.reduce((current, templateId) => {
    const template = templates.find((candidate) => candidate.id === templateId);
    if (!template) return current;
    const instantiatedSection = instantiateOverviewSection(template, newId, locale);
    const section = {
      ...instantiatedSection,
      placeholderKey: uniqueProjectOverviewSectionKey(instantiatedSection.name, current.overviewSections),
    };
    const overviewSections = [...current.overviewSections, section];
    return {
      ...current,
      overviewSections,
      overviewSectionOrder: normalizeProjectOverviewSectionOrder([...current.overviewSectionOrder, section.id], overviewSections),
    };
  }, project);
}

function touchContactProjects(current: AppDatabase, contactIds: Set<string>, now: string): AppDatabase {
  const projectIds = new Set(current.projectContactAssignments
    .filter((assignment) => contactIds.has(assignment.contactId) && assignment.lifecycle === "active")
    .map((assignment) => assignment.projectId));
  return {
    ...current,
    projects: current.projects.map((project) => projectIds.has(project.id) ? { ...project, updatedAt: now } : project),
    plans: current.plans.map((plan) => projectIds.has(plan.projectId) && !plan.supersededAt ? { ...plan, status: "draft", updatedAt: now } : plan),
    generatedDocuments: current.generatedDocuments.map((document) => projectIds.has(document.projectId) ? { ...document, stale: true } : document),
  };
}

export function AppProvider({ children, repository: providedRepository }: { children: ReactNode; repository?: AppRepository }) {
  const repository = useRef<AppRepository>(providedRepository ?? new LocalStorageRepository());
  const [database, setDatabase] = useState<AppDatabase>(() => repository.current.load());
  const commit = useCallback((updater: (current: AppDatabase) => AppDatabase) => {
    setDatabase((current) => { const next = updater(current); repository.current.save(next); return next; });
  }, []);
  const commitContacts = useCallback((updater: (current: AppDatabase) => AppDatabase) => {
    setDatabase((current) => {
      const next = updater(current);
      repository.current.saveContacts(contactsRepositorySnapshot(next));
      return next;
    });
  }, []);

  const setLocale = useCallback((locale: Locale) => commit((current) => ({
    ...current,
    user: { ...current.user, preferredLocale: locale },
    generatedDocuments: current.generatedDocuments.map((document) => ({ ...document, stale: true })),
  })), [commit]);
  const createProject = useCallback((
    values: ProjectFormValues,
    contactSelections: CreateProjectContactSelection[] = [],
    projectRoleDefinitions: CreateProjectRoleDefinitionInput[] = [],
  ): Project => {
    if (database.user.role === "viewer") throw new Error("forbidden");
    const normalizedProjectRoleDefinitions = projectRoleDefinitions.map((definition) => ({
      id: definition.id,
      name: definition.name.trim(),
    })).filter((definition, index, definitions) => (
      Boolean(definition.id && definition.name)
      && !definitions.some((candidate, candidateIndex) => candidateIndex < index && (
        candidate.id === definition.id || candidate.name.toLocaleLowerCase() === definition.name.toLocaleLowerCase()
      ))
    ));
    if (normalizedProjectRoleDefinitions.length !== projectRoleDefinitions.length) throw new Error("invalid_project_role_definition");
    const projectRoleDefinitionById = new Map(normalizedProjectRoleDefinitions.map((definition) => [definition.id, definition]));
    const selectionsByContact = new Map<string, CreateProjectContactSelection>();
    for (const selection of contactSelections) {
      const contact = database.contacts.find((candidate) => candidate.id === selection.contactId && candidate.organizationId === database.organization.id);
      const validRoles = selection.roles.flatMap<CreateProjectContactSelection["roles"][number]>((role) => {
        if (role.role !== "custom") return [{ role: role.role }];
        const definition = database.projectRoleDefinitions.find((candidate) => (
          candidate.id === role.roleDefinitionId
          && candidate.organizationId === database.organization.id
          && !candidate.projectId
          && candidate.lifecycle === "active"
        )) ?? (role.roleDefinitionId ? projectRoleDefinitionById.get(role.roleDefinitionId) : undefined);
        return definition ? [{ role: role.role, roleDefinitionId: definition.id, customLabel: definition.name }] : [];
      });
      if (!contact || validRoles.length !== selection.roles.length) throw new Error("invalid_project_contact_assignment");
      const existing = selectionsByContact.get(selection.contactId);
      selectionsByContact.set(selection.contactId, { contactId: selection.contactId, roles: [...(existing?.roles ?? []), ...validRoles] });
    }
    const normalizedSelections = [...selectionsByContact.values()];
    const now = new Date().toISOString();
    const overviewSectionOrder = normalizeProjectOverviewSectionOrder(values.overviewSectionOrder, values.overviewSections);
    const initialProject: Project = {
      id: newId("project"), organizationId: database.organization.id,
      name: values.name,
      status: "draft",
      participants: [], emergencyContacts: [], customFields: [], customSections: [],
      participantsSectionName: values.participantsSectionName,
      overviewSections: orderProjectOverviewSections(values.overviewSections, overviewSectionOrder),
      overviewSectionOrder,
      assets: [], documentFolders: [], createdAt: now, updatedAt: now,
    };
    const project = initialProject;
    const scopedRoleDefinitions: ProjectRoleDefinition[] = normalizedProjectRoleDefinitions.map((definition, sortOrder) => ({
      ...definition,
      organizationId: database.organization.id,
      projectId: project.id,
      lifecycle: "active",
      sortOrder,
      createdAt: now,
      updatedAt: now,
    }));
    commit((current) => {
      const assignments = normalizedSelections.flatMap((selection) => {
        const contact = current.contacts.find((candidate) => candidate.id === selection.contactId && candidate.organizationId === current.organization.id);
        const roles = selection.roles.filter((role, index, candidates) => (
          !candidates.some((candidate, candidateIndex) => candidateIndex < index
            && candidate.role === role.role
            && candidate.roleDefinitionId === role.roleDefinitionId)
        ));
        if (!contact) return [];
        return [{
          id: newId("assignment"), organizationId: current.organization.id, projectId: project.id, contactId: contact.id,
          roles: roles.map((role) => ({ id: newId("role"), role: role.role, roleDefinitionId: role.role === "custom" ? role.roleDefinitionId : undefined, customLabel: role.role === "custom" ? role.customLabel?.trim() : undefined })),
          lifecycle: "active" as const, createdAt: now, updatedAt: now,
        }];
      });
      return {
        ...current,
        projects: [project, ...current.projects],
        projectRoleDefinitions: [...current.projectRoleDefinitions, ...scopedRoleDefinitions],
        projectContactAssignments: [...assignments, ...current.projectContactAssignments],
        auditEvents: [
          ...current.auditEvents,
          { id: newId("audit"), projectId: project.id, action: "project.created", actorName: current.user.name, createdAt: now, details: project.name },
          ...assignments.map((assignment) => ({ id: newId("audit"), projectId: project.id, action: "project_contact.created", actorName: current.user.name, createdAt: now, details: assignment.id })),
        ],
      };
    });
    return project;
  }, [commit, database.contacts, database.organization.id, database.projectRoleDefinitions, database.user.role]);

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
      return {
        ...current,
        projects: current.projects.filter((candidate) => candidate.id !== projectId),
        projectRoleDefinitions: current.projectRoleDefinitions.filter((definition) => definition.projectId !== projectId),
        projectContactAssignments: current.projectContactAssignments.filter((assignment) => assignment.projectId !== projectId),
        assessmentRuns: current.assessmentRuns.filter((run) => run.projectId !== projectId),
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
    const overviewSectionOrder = normalizeProjectOverviewSectionOrder(project.overviewSectionOrder, project.overviewSections);
    const canonicalProject = {
      ...project,
      participants: [],
      overviewSections: orderProjectOverviewSections(project.overviewSections, overviewSectionOrder),
      overviewSectionOrder,
    };
    commit((current) => ({
      ...current,
      projects: current.projects.map((candidate) => candidate.id === project.id ? { ...canonicalProject, updatedAt: now } : candidate),
      plans: current.plans.map((plan) => plan.projectId === project.id && !plan.supersededAt ? { ...plan, status: "draft", updatedAt: now } : plan),
      generatedDocuments: current.generatedDocuments.map((document) => document.projectId === project.id ? { ...document, stale: true } : document),
    }));
  }, [commit]);

  const saveContact = useCallback((contact: Contact) => {
    const now = new Date().toISOString();
    commitContacts((current) => {
      if (current.user.role === "viewer" || contact.organizationId !== current.organization.id) return current;
      const exists = current.contacts.some((candidate) => candidate.id === contact.id);
      const next = touchContactProjects({
        ...current,
        contacts: exists
          ? current.contacts.map((candidate) => candidate.id === contact.id ? { ...contact, updatedAt: now } : candidate)
          : [{ ...contact, createdAt: contact.createdAt || now, updatedAt: now }, ...current.contacts],
        auditEvents: [...current.auditEvents, {
          id: newId("audit"), action: exists ? "contact.updated" : "contact.created", actorName: current.user.name,
          createdAt: now, details: contact.id,
        }],
      }, new Set([contact.id]), now);
      return next;
    });
  }, [commitContacts]);

  const setContactLifecycle = useCallback((contactId: string, lifecycle: "active" | "archived") => {
    const now = new Date().toISOString();
    commitContacts((current) => {
      if (current.user.role === "viewer") return current;
      return touchContactProjects({
        ...current,
        contacts: current.contacts.map((contact) => contact.id === contactId ? { ...contact, lifecycle, updatedAt: now } : contact),
        auditEvents: [...current.auditEvents, { id: newId("audit"), action: `contact.${lifecycle}`, actorName: current.user.name, createdAt: now, details: contactId }],
      }, new Set([contactId]), now);
    });
  }, [commitContacts]);
  const archiveContact = useCallback((contactId: string) => setContactLifecycle(contactId, "archived"), [setContactLifecycle]);
  const restoreContact = useCallback((contactId: string) => setContactLifecycle(contactId, "active"), [setContactLifecycle]);

  const deleteContact = useCallback((contactId: string): boolean => {
    if (database.user.role === "viewer") return false;
    const contact = database.contacts.find((candidate) => candidate.id === contactId && candidate.organizationId === database.organization.id);
    const referenced = !contact
      || contact.lifecycle !== "archived"
      || database.contactAffiliations.some((affiliation) => affiliation.contactId === contactId)
      || database.projectContactAssignments.some((assignment) => assignment.contactId === contactId)
      || database.externalContactIdentities.some((identity) => identity.contactId === contactId)
      || database.contactImportBatches.some((batch) => batch.items.some((item) => item.contactId === contactId))
      || database.revisions.some((revision) => revision.snapshot.project.participants.some((participant) => participant.id === contactId));
    if (referenced) return false;
    const now = new Date().toISOString();
    commitContacts((current) => ({
      ...current,
      contacts: current.contacts.filter((candidate) => candidate.id !== contactId),
      auditEvents: [...current.auditEvents, { id: newId("audit"), action: "contact.deleted", actorName: current.user.name, createdAt: now, details: contactId }],
    }));
    return true;
  }, [commitContacts, database]);

  const mergeContacts = useCallback((survivorId: string, mergedId: string, resolution: ContactMergeResolution = {}) => {
    if (survivorId === mergedId) return;
    const now = new Date().toISOString();
    commitContacts((current) => {
      if (current.user.role === "viewer") return current;
      const survivor = current.contacts.find((contact) => contact.id === survivorId);
      const merged = current.contacts.find((contact) => contact.id === mergedId);
      if (!survivor || !merged || survivor.organizationId !== merged.organizationId || survivor.organizationId !== current.organization.id) return current;
      const emailValues = new Set(survivor.emails.map((email) => email.normalizedValue));
      const phoneValues = new Set(survivor.phones.map((phone) => phone.normalizedValue));
      const contacts = current.contacts.map((contact) => {
        if (contact.id === survivorId) return {
          ...contact,
          ...resolution,
          emails: ensureSinglePrimary([...contact.emails, ...merged.emails.filter((email) => !emailValues.has(email.normalizedValue))]),
          phones: ensureSinglePrimary([...contact.phones, ...merged.phones.filter((phone) => !phoneValues.has(phone.normalizedValue))]),
          addresses: ensureSinglePrimary([...contact.addresses, ...merged.addresses.filter((address) => !contact.addresses.some((candidate) => candidate.id === address.id))]),
          tags: [...new Set([...contact.tags, ...merged.tags])],
          notes: resolution.notes ?? [contact.notes, merged.notes].filter(Boolean).join("\n\n"),
          updatedAt: now,
        };
        if (contact.id === mergedId) return { ...contact, lifecycle: "archived" as const, mergedIntoId: survivorId, updatedAt: now };
        return contact;
      });
      const assignments = current.projectContactAssignments.map((assignment) => assignment.contactId === mergedId ? { ...assignment, contactId: survivorId, updatedAt: now } : assignment);
      const deduplicatedAssignments = assignments.filter((assignment, index) => !assignments.some((candidate, candidateIndex) => (
        candidateIndex < index && candidate.projectId === assignment.projectId && candidate.contactId === assignment.contactId
      ))).map((assignment) => {
        const duplicates = assignments.filter((candidate) => candidate.projectId === assignment.projectId && candidate.contactId === assignment.contactId);
        return duplicates.length < 2 ? assignment : {
          ...assignment,
          roles: duplicates.flatMap((candidate) => candidate.roles).filter((role, index, roles) => !roles.some((candidate, candidateIndex) => candidateIndex < index && projectContactRoleKey(candidate) === projectContactRoleKey(role))),
        };
      });
      const rewiredAffiliations = current.contactAffiliations.map((affiliation) => affiliation.contactId === mergedId ? { ...affiliation, contactId: survivorId, updatedAt: now } : affiliation);
      const survivorAffiliations = ensureSinglePrimary(rewiredAffiliations
        .filter((affiliation, index) => affiliation.contactId === survivorId && !rewiredAffiliations.some((candidate, candidateIndex) => candidateIndex < index && candidate.contactId === survivorId && candidate.companyId === affiliation.companyId)));
      const survivorAffiliationIds = new Set(survivorAffiliations.map((affiliation) => affiliation.id));
      const externalIdentities = current.externalContactIdentities
        .map((identity) => identity.contactId === mergedId ? { ...identity, contactId: survivorId } : identity)
        .filter((identity, index, identities) => !identities.some((candidate, candidateIndex) => candidateIndex < index
          && candidate.provider === identity.provider
          && candidate.providerAccountId === identity.providerAccountId
          && candidate.externalContactId === identity.externalContactId));
      return touchContactProjects({
        ...current,
        contacts,
        contactAffiliations: [...rewiredAffiliations.filter((affiliation) => affiliation.contactId !== survivorId), ...rewiredAffiliations.filter((affiliation) => survivorAffiliationIds.has(affiliation.id)).map((affiliation) => survivorAffiliations.find((candidate) => candidate.id === affiliation.id)!)],
        projectContactAssignments: deduplicatedAssignments,
        externalContactIdentities: externalIdentities,
        auditEvents: [...current.auditEvents, { id: newId("audit"), action: "contact.merged", actorName: current.user.name, createdAt: now, details: `${mergedId}->${survivorId}` }],
      }, new Set([survivorId, mergedId]), now);
    });
  }, [commitContacts]);

  const assignContactsToProject = useCallback((
    contactIds: string[],
    projectId: string,
    role?: ProjectContactAssignment["roles"][number]["role"],
    _customLabel?: string,
    roleDefinitionId?: string,
  ) => {
    const roleDefinition = roleDefinitionId ? database.projectRoleDefinitions.find((definition) => (
      definition.id === roleDefinitionId
      && definition.lifecycle === "active"
      && (!definition.projectId || definition.projectId === projectId)
    )) : undefined;
    if (database.user.role === "viewer" || (role === "custom" && !roleDefinition)) return;
    const project = database.projects.find((candidate) => candidate.id === projectId && candidate.organizationId === database.organization.id);
    const allowedContactIds = new Set(database.contacts
      .filter((contact) => contactIds.includes(contact.id) && contact.organizationId === database.organization.id)
      .map((contact) => contact.id));
    if (!project || allowedContactIds.size === 0) return;
    const now = new Date().toISOString();
    commitContacts((current) => {
      const assignments = [...current.projectContactAssignments];
      for (const contactId of allowedContactIds) {
        const existingIndex = assignments.findIndex((assignment) => assignment.projectId === projectId && assignment.contactId === contactId);
        const existing = assignments[existingIndex];
        const roleExists = !role || existing?.roles.some((candidate) => candidate.role === role && candidate.roleDefinitionId === roleDefinition?.id);
        if (existing && role && !roleExists) assignments[existingIndex] = {
          ...existing,
          roles: [...existing.roles, { id: newId("role"), role, roleDefinitionId: roleDefinition?.id, customLabel: role === "custom" ? roleDefinition?.name : undefined }],
          lifecycle: "active",
          updatedAt: now,
        };
        else if (existing && existing.lifecycle !== "active") assignments[existingIndex] = { ...existing, lifecycle: "active", updatedAt: now };
        else if (!existing) {
          assignments.unshift({
            id: newId("assignment"), organizationId: current.organization.id, projectId, contactId,
            roles: role ? [{ id: newId("role"), role, roleDefinitionId: roleDefinition?.id, customLabel: role === "custom" ? roleDefinition?.name : undefined }] : [],
            lifecycle: "active", createdAt: now, updatedAt: now,
          });
        }
      }
      return touchContactProjects({
        ...current,
        projectContactAssignments: assignments,
        auditEvents: [...current.auditEvents, {
          id: newId("audit"), projectId, action: "project_contacts.bulk_assigned", actorName: current.user.name,
          createdAt: now, details: `${allowedContactIds.size}:${role ?? "no-role"}`,
        }],
      }, allowedContactIds, now);
    });
  }, [commitContacts, database]);

  const saveCompany = useCallback((company: Company) => {
    const now = new Date().toISOString();
    commitContacts((current) => {
      if (current.user.role === "viewer" || company.organizationId !== current.organization.id) return current;
      const exists = current.companies.some((candidate) => candidate.id === company.id);
      const contactIds = new Set(current.contactAffiliations.filter((affiliation) => affiliation.companyId === company.id).map((affiliation) => affiliation.contactId));
      return touchContactProjects({
        ...current,
        companies: exists ? current.companies.map((candidate) => candidate.id === company.id ? { ...company, updatedAt: now } : candidate) : [{ ...company, createdAt: company.createdAt || now, updatedAt: now }, ...current.companies],
        auditEvents: [...current.auditEvents, { id: newId("audit"), action: exists ? "company.updated" : "company.created", actorName: current.user.name, createdAt: now, details: company.id }],
      }, contactIds, now);
    });
  }, [commitContacts]);

  const mergeCompanies = useCallback((survivorId: string, mergedId: string, resolution: CompanyMergeResolution = {}) => {
    if (survivorId === mergedId) return;
    const now = new Date().toISOString();
    commitContacts((current) => {
      if (current.user.role === "viewer") return current;
      const survivor = current.companies.find((company) => company.id === survivorId);
      const merged = current.companies.find((company) => company.id === mergedId);
      if (!survivor || !merged || survivor.organizationId !== current.organization.id || merged.organizationId !== current.organization.id) return current;
      const affectedContactIds = new Set([
        ...current.contactAffiliations.filter((affiliation) => affiliation.companyId === survivorId || affiliation.companyId === mergedId).map((affiliation) => affiliation.contactId),
      ]);
      const companies = current.companies.map((company) => {
        if (company.id === survivorId) return {
          ...company,
          website: resolution.website ?? (company.website || merged.website),
          domain: resolution.domain ?? (company.domain || merged.domain),
          email: resolution.email ?? (company.email || merged.email),
          phone: resolution.phone ?? (company.phone || merged.phone),
          address: resolution.address ?? company.address ?? merged.address,
          notes: resolution.notes ?? [company.notes, merged.notes].filter(Boolean).join("\n\n"),
          tags: [...new Set([...company.tags, ...merged.tags])],
          updatedAt: now,
        };
        if (company.id === mergedId) return { ...company, lifecycle: "archived" as const, mergedIntoId: survivorId, updatedAt: now };
        return company;
      });
      const rewiredAffiliations = current.contactAffiliations.map((affiliation) => affiliation.companyId === mergedId ? { ...affiliation, companyId: survivorId, updatedAt: now } : affiliation);
      const contactAffiliations = rewiredAffiliations.reduce<ContactCompanyAffiliation[]>((deduplicated, affiliation) => {
        const duplicateIndex = deduplicated.findIndex((candidate) => candidate.contactId === affiliation.contactId && candidate.companyId === affiliation.companyId);
        if (duplicateIndex < 0) return [...deduplicated, affiliation];
        const duplicate = deduplicated[duplicateIndex];
        return deduplicated.map((candidate, index) => index === duplicateIndex ? {
          ...duplicate,
          jobTitle: duplicate.jobTitle || affiliation.jobTitle,
          department: duplicate.department || affiliation.department,
          primary: duplicate.primary || affiliation.primary,
          lifecycle: duplicate.lifecycle === "active" || affiliation.lifecycle === "active" ? "active" : "archived",
          updatedAt: now,
        } : candidate);
      }, []);
      return touchContactProjects({
        ...current,
        companies,
        contactAffiliations,
        auditEvents: [...current.auditEvents, { id: newId("audit"), action: "company.merged", actorName: current.user.name, createdAt: now, details: `${mergedId}->${survivorId}` }],
      }, affectedContactIds, now);
    });
  }, [commitContacts]);

  const setCompanyLifecycle = useCallback((companyId: string, lifecycle: "active" | "archived") => {
    const now = new Date().toISOString();
    commitContacts((current) => {
      if (current.user.role === "viewer") return current;
      const contactIds = new Set(current.contactAffiliations.filter((affiliation) => affiliation.companyId === companyId).map((affiliation) => affiliation.contactId));
      return touchContactProjects({
        ...current,
        companies: current.companies.map((company) => company.id === companyId ? { ...company, lifecycle, updatedAt: now } : company),
        auditEvents: [...current.auditEvents, { id: newId("audit"), action: `company.${lifecycle}`, actorName: current.user.name, createdAt: now, details: companyId }],
      }, contactIds, now);
    });
  }, [commitContacts]);
  const archiveCompany = useCallback((companyId: string) => setCompanyLifecycle(companyId, "archived"), [setCompanyLifecycle]);
  const restoreCompany = useCallback((companyId: string) => setCompanyLifecycle(companyId, "active"), [setCompanyLifecycle]);

  const deleteCompany = useCallback((companyId: string): boolean => {
    if (database.user.role === "viewer") return false;
    const company = database.companies.find((candidate) => candidate.id === companyId && candidate.organizationId === database.organization.id);
    const referenced = !company
      || company.lifecycle !== "archived"
      || database.contactAffiliations.some((affiliation) => affiliation.companyId === companyId)
      || database.contactImportBatches.some((batch) => batch.items.some((item) => item.companyId === companyId));
    if (referenced) return false;
    const now = new Date().toISOString();
    commitContacts((current) => ({
      ...current,
      companies: current.companies.filter((candidate) => candidate.id !== companyId),
      auditEvents: [...current.auditEvents, { id: newId("audit"), action: "company.deleted", actorName: current.user.name, createdAt: now, details: companyId }],
    }));
    return true;
  }, [commitContacts, database]);

  const saveContactAffiliation = useCallback((affiliation: ContactCompanyAffiliation) => {
    const now = new Date().toISOString();
    commitContacts((current) => {
      if (current.user.role === "viewer" || affiliation.organizationId !== current.organization.id) return current;
      const existing = current.contactAffiliations.some((candidate) => candidate.id === affiliation.id);
      const affiliations = (existing
        ? current.contactAffiliations.map((candidate) => candidate.id === affiliation.id ? { ...affiliation, updatedAt: now } : candidate)
        : [{ ...affiliation, createdAt: affiliation.createdAt || now, updatedAt: now }, ...current.contactAffiliations])
        .map((candidate) => affiliation.primary && candidate.contactId === affiliation.contactId && candidate.id !== affiliation.id ? { ...candidate, primary: false, updatedAt: now } : candidate);
      return touchContactProjects({ ...current, contactAffiliations: affiliations }, new Set([affiliation.contactId]), now);
    });
  }, [commitContacts]);

  const saveProjectContactAssignment = useCallback((assignment: ProjectContactAssignment) => {
    const now = new Date().toISOString();
    commitContacts((current) => {
      if (current.user.role === "viewer" || assignment.organizationId !== current.organization.id) return current;
      const project = current.projects.find((candidate) => candidate.id === assignment.projectId);
      const contact = current.contacts.find((candidate) => candidate.id === assignment.contactId);
      if (!project || !contact || project.organizationId !== current.organization.id || contact.organizationId !== current.organization.id) return current;
      const resolvedRoles = assignment.roles.flatMap<ProjectContactAssignment["roles"][number]>((role) => {
        if (role.role !== "custom") return [{ ...role, roleDefinitionId: undefined, customLabel: undefined }];
        const definition = current.projectRoleDefinitions.find((candidate) => (
          candidate.id === role.roleDefinitionId
          && candidate.organizationId === current.organization.id
          && (!candidate.projectId || candidate.projectId === assignment.projectId)
        ));
        return definition ? [{ ...role, roleDefinitionId: definition.id, customLabel: definition.name }] : [];
      });
      if (resolvedRoles.length !== assignment.roles.length) return current;
      const normalizedRoles = resolvedRoles.filter((role, index, roles) => (
        !roles.some((candidate, candidateIndex) => candidateIndex < index && projectContactRoleKey(candidate) === projectContactRoleKey(role))
      ));
      const normalizedAssignment = { ...assignment, roles: normalizedRoles };
      const exists = current.projectContactAssignments.some((candidate) => candidate.id === assignment.id);
      return touchContactProjects({
        ...current,
        projectContactAssignments: exists
          ? current.projectContactAssignments.map((candidate) => candidate.id === assignment.id ? { ...normalizedAssignment, updatedAt: now } : candidate)
          : [{ ...normalizedAssignment, createdAt: assignment.createdAt || now, updatedAt: now }, ...current.projectContactAssignments],
        auditEvents: [...current.auditEvents, { id: newId("audit"), projectId: assignment.projectId, action: exists ? "project_contact.updated" : "project_contact.created", actorName: current.user.name, createdAt: now, details: assignment.id }],
      }, new Set([assignment.contactId]), now);
    });
  }, [commitContacts]);

  const removeProjectContactAssignment = useCallback((assignmentId: string) => {
    const now = new Date().toISOString();
    commitContacts((current) => {
      if (current.user.role === "viewer") return current;
      const assignment = current.projectContactAssignments.find((candidate) => candidate.id === assignmentId);
      if (!assignment) return current;
      return touchContactProjects({
        ...current,
        projectContactAssignments: current.projectContactAssignments.filter((candidate) => candidate.id !== assignmentId),
        auditEvents: [...current.auditEvents, { id: newId("audit"), projectId: assignment.projectId, action: "project_contact.removed", actorName: current.user.name, createdAt: now, details: assignmentId }],
      }, new Set([assignment.contactId]), now);
    });
  }, [commitContacts]);

  const saveProjectRoleDefinition = useCallback((definition: ProjectRoleDefinition) => {
    const now = new Date().toISOString();
    commitContacts((current) => {
      const name = definition.name.trim();
      const projectScopeIsValid = !definition.projectId || current.projects.some((project) => (
        project.id === definition.projectId && project.organizationId === current.organization.id
      ));
      if (current.user.role === "viewer" || definition.organizationId !== current.organization.id || !name || !projectScopeIsValid) return current;
      const nameConflict = current.projectRoleDefinitions.some((candidate) => (
        candidate.id !== definition.id
        && candidate.lifecycle === "active"
        && candidate.projectId === definition.projectId
        && candidate.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
      ));
      if (nameConflict) return current;
      const exists = current.projectRoleDefinitions.some((candidate) => candidate.id === definition.id);
      const savedDefinition = { ...definition, name, updatedAt: now, createdAt: definition.createdAt || now };
      const projectRoleDefinitions = exists
        ? current.projectRoleDefinitions.map((candidate) => candidate.id === definition.id ? savedDefinition : candidate)
        : [...current.projectRoleDefinitions, savedDefinition];
      const affectedContactIds = new Set(current.projectContactAssignments
        .filter((assignment) => assignment.roles.some((role) => role.roleDefinitionId === definition.id))
        .map((assignment) => assignment.contactId));
      return touchContactProjects({
        ...current,
        projectRoleDefinitions,
        projectContactAssignments: current.projectContactAssignments.map((assignment) => ({
          ...assignment,
          roles: assignment.roles.map((role) => role.roleDefinitionId === definition.id ? { ...role, customLabel: name } : role),
        })),
      }, affectedContactIds, now);
    });
  }, [commitContacts]);

  const archiveProjectRoleDefinition = useCallback((definitionId: string) => {
    const definition = database.projectRoleDefinitions.find((candidate) => candidate.id === definitionId);
    if (!definition || database.user.role === "viewer") return;
    saveProjectRoleDefinition({ ...definition, lifecycle: "archived" });
  }, [database.projectRoleDefinitions, database.user.role, saveProjectRoleDefinition]);

  const createProjectRoleDefinition = useCallback((name: string, projectId?: string): ProjectRoleDefinition | undefined => {
    const normalizedName = name.trim();
    if (!normalizedName || database.user.role === "viewer") return undefined;
    if (projectId && !database.projects.some((project) => project.id === projectId && project.organizationId === database.organization.id)) return undefined;
    const existing = database.projectRoleDefinitions.find((definition) => (
      definition.projectId === projectId
      && definition.name.trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
    ));
    if (existing) {
      if (existing.lifecycle === "archived") saveProjectRoleDefinition({ ...existing, lifecycle: "active" });
      return { ...existing, lifecycle: "active" };
    }
    const now = new Date().toISOString();
    const definition: ProjectRoleDefinition = {
      id: newId("project-role"), organizationId: database.organization.id, name: normalizedName,
      projectId,
      lifecycle: "active",
      sortOrder: database.projectRoleDefinitions.filter((candidate) => candidate.projectId === projectId).length,
      createdAt: now,
      updatedAt: now,
    };
    saveProjectRoleDefinition(definition);
    return definition;
  }, [database.organization.id, database.projectRoleDefinitions, database.projects, database.user.role, saveProjectRoleDefinition]);

  const reorderProjectRoleDefinitions = useCallback((orderedDefinitionIds: string[]) => {
    commitContacts((current) => {
      if (current.user.role === "viewer") return current;
      const knownIds = new Set(current.projectRoleDefinitions.filter((definition) => !definition.projectId).map((definition) => definition.id));
      if (orderedDefinitionIds.length !== knownIds.size || orderedDefinitionIds.some((id) => !knownIds.has(id))) return current;
      const sortOrderById = new Map(orderedDefinitionIds.map((id, index) => [id, index]));
      const now = new Date().toISOString();
      return {
        ...current,
        projectRoleDefinitions: current.projectRoleDefinitions.map((definition) => definition.projectId ? definition : ({
          ...definition,
          sortOrder: sortOrderById.get(definition.id) ?? definition.sortOrder,
          updatedAt: now,
        })),
      };
    });
  }, [commitContacts]);

  const addContactImportBatch = useCallback((batch: ContactImportBatch) => commitContacts((current) => current.user.role === "viewer" ? current : ({
    ...current,
    contactImportBatches: [batch, ...current.contactImportBatches],
    auditEvents: [...current.auditEvents, { id: newId("audit"), action: "contacts.imported", actorName: current.user.name, createdAt: batch.createdAt, details: batch.id }],
  })), [commitContacts]);

  const commitContactImport = useCallback((input: ContactImportCommitInput): ContactImportBatch => {
    const result = applyContactImport(database, input, newId);
    if (database.user.role !== "viewer") commitContacts(() => result.database);
    return result.batch;
  }, [commitContacts, database]);

  const undoContactImportBatch = useCallback((batchId: string): { reverted: number; conflicts: number } => {
    const result = { reverted: 0, conflicts: 0 };
    commitContacts((current) => {
      if (current.user.role === "viewer") return current;
      const batch = current.contactImportBatches.find((candidate) => candidate.id === batchId && candidate.status === "completed");
      if (!batch) return current;
      let contacts = [...current.contacts];
      let companies = [...current.companies];
      let projectContactAssignments = [...current.projectContactAssignments];
      let contactAffiliations = [...current.contactAffiliations];
      let externalContactIdentities = [...current.externalContactIdentities];
      const changedAfterImport = (timestamp: string | undefined) => Boolean(timestamp && timestamp > batch.createdAt);
      const createdCompanyIds = new Set<string>();
      const previousCompanies = new Map(batch.items.flatMap((item) => item.companyId && item.previousCompany ? [[item.companyId, item.previousCompany] as const] : []));

      for (const item of batch.items) {
        for (const assignmentId of item.assignmentIds ?? []) {
          const assignment = projectContactAssignments.find((candidate) => candidate.id === assignmentId);
          if (changedAfterImport(assignment?.updatedAt)) result.conflicts += 1;
          else projectContactAssignments = projectContactAssignments.filter((candidate) => candidate.id !== assignmentId);
        }
        for (const affiliationId of item.affiliationIds ?? []) {
          const affiliation = contactAffiliations.find((candidate) => candidate.id === affiliationId);
          if (changedAfterImport(affiliation?.updatedAt)) result.conflicts += 1;
          else contactAffiliations = contactAffiliations.filter((candidate) => candidate.id !== affiliationId);
        }
        for (const identityId of item.externalIdentityIds ?? []) {
          const identity = externalContactIdentities.find((candidate) => candidate.id === identityId);
          if (changedAfterImport(identity?.lastImportedAt)) result.conflicts += 1;
          else externalContactIdentities = externalContactIdentities.filter((candidate) => candidate.id !== identityId);
        }

        if (item.previousAffiliation) {
          const affiliation = contactAffiliations.find((candidate) => candidate.id === item.previousAffiliation!.id);
          if (!affiliation || changedAfterImport(affiliation.updatedAt)) result.conflicts += 1;
          else contactAffiliations = contactAffiliations.map((candidate) => candidate.id === affiliation.id ? item.previousAffiliation! : candidate);
        }
        if (item.previousAssignment) {
          const assignment = projectContactAssignments.find((candidate) => candidate.id === item.previousAssignment!.id);
          if (!assignment || changedAfterImport(assignment.updatedAt)) result.conflicts += 1;
          else projectContactAssignments = projectContactAssignments.map((candidate) => candidate.id === assignment.id ? item.previousAssignment! : candidate);
        }
        if (item.previousExternalIdentity) {
          const identity = externalContactIdentities.find((candidate) => candidate.id === item.previousExternalIdentity!.id);
          if (!identity || changedAfterImport(identity.lastImportedAt)) result.conflicts += 1;
          else externalContactIdentities = externalContactIdentities.map((candidate) => candidate.id === identity.id ? item.previousExternalIdentity! : candidate);
        }

        if (item.action === "created" && item.contactId) {
          const currentContact = contacts.find((contact) => contact.id === item.contactId);
          const referenced = projectContactAssignments.some((assignment) => assignment.contactId === item.contactId)
            || contactAffiliations.some((affiliation) => affiliation.contactId === item.contactId)
            || externalContactIdentities.some((identity) => identity.contactId === item.contactId);
          if (!currentContact || referenced || changedAfterImport(currentContact.updatedAt)) { result.conflicts += 1; continue; }
          contacts = contacts.filter((contact) => contact.id !== item.contactId);
          result.reverted += 1;
        } else if (item.previousContact && item.contactId) {
          const currentContact = contacts.find((contact) => contact.id === item.contactId);
          if (!currentContact || changedAfterImport(currentContact.updatedAt)) { result.conflicts += 1; continue; }
          contacts = contacts.map((contact) => contact.id === item.contactId ? item.previousContact! : contact);
          result.reverted += 1;
        }
        if (item.companyCreated && item.companyId) createdCompanyIds.add(item.companyId);
      }

      for (const [companyId, previousCompany] of previousCompanies) {
        const company = companies.find((candidate) => candidate.id === companyId);
        if (!company || changedAfterImport(company.updatedAt)) result.conflicts += 1;
        else companies = companies.map((candidate) => candidate.id === companyId ? previousCompany : candidate);
      }
      for (const companyId of createdCompanyIds) {
        const company = companies.find((candidate) => candidate.id === companyId);
        const referenced = contactAffiliations.some((affiliation) => affiliation.companyId === companyId);
        if (!company || referenced || changedAfterImport(company.updatedAt)) result.conflicts += 1;
        else companies = companies.filter((candidate) => candidate.id !== companyId);
      }
      const now = new Date().toISOString();
      return {
        ...current,
        contacts,
        companies,
        projectContactAssignments,
        contactAffiliations,
        externalContactIdentities,
        contactImportBatches: current.contactImportBatches.map((candidate) => candidate.id === batchId ? { ...candidate, status: result.conflicts > 0 ? "partially_undone" : "undone", undoneAt: now } : candidate),
        auditEvents: [...current.auditEvents, { id: newId("audit"), action: "contacts.import_undone", actorName: current.user.name, createdAt: now, details: `${batchId}:${result.reverted}:${result.conflicts}` }],
      };
    });
    return result;
  }, [commitContacts]);

  const recordContactExport = useCallback((format: "csv" | "vcard" | "json", count: number) => commitContacts((current) => current.user.role === "viewer" ? current : ({
    ...current,
    auditEvents: [...current.auditEvents, {
      id: newId("audit"), action: "contacts.exported", actorName: current.user.name,
      createdAt: new Date().toISOString(), details: `${format}:${count}`,
    }],
  })), [commitContacts]);

  const recordContactProviderEvent = useCallback((provider: "microsoft" | "google", event: "connected" | "disconnected" | "failed") => commitContacts((current) => current.user.role === "viewer" ? current : ({
    ...current,
    auditEvents: [...current.auditEvents, {
      id: newId("audit"), action: `contacts.provider_${event}`, actorName: current.user.name,
      createdAt: new Date().toISOString(), details: provider,
    }],
  })), [commitContacts]);

  const updateProjectStatus = useCallback((projectId: string, status: ProjectStatus) => {
    const now = new Date().toISOString();
    commit((current) => ({
      ...current,
      projects: current.projects.map((project) => project.id === projectId ? { ...project, status, updatedAt: now } : project),
    }));
  }, [commit]);

  const beginAssessment = useCallback((projectId: string, reason?: string): ProjectAssessmentRun => {
    const inProgressRun = database.assessmentRuns.find((run) => run.projectId === projectId && !run.completedAt);
    const normalizedReason = normalizePlanReason(reason);
    if (inProgressRun) {
      if (!normalizedReason || normalizedReason === inProgressRun.reason) return inProgressRun;
      const updatedRun = { ...inProgressRun, reason: normalizedReason, updatedAt: new Date().toISOString() };
      commit((current) => ({ ...current, assessmentRuns: current.assessmentRuns.map((run) => run.id === updatedRun.id ? updatedRun : run) }));
      return updatedRun;
    }
    const now = new Date().toISOString();
    const previousRun = database.assessmentRuns.find((run) => run.projectId === projectId && run.completedAt);
    const run: ProjectAssessmentRun = {
      id: newId("assessment"),
      projectId,
      definitionVersion: ASSESSMENT_DEFINITION_VERSION,
      answers: structuredClone(previousRun?.answers ?? defaultAssessmentAnswers),
      reason: normalizedReason,
      createdByName: database.user.name,
      createdAt: now,
      updatedAt: now,
    };
    commit((current) => ({ ...current, assessmentRuns: [run, ...current.assessmentRuns] }));
    return run;
  }, [commit, database.assessmentRuns, database.user.name]);

  const saveAssessment = useCallback((projectId: string, assessmentRunId: string | undefined, answers: AssessmentAnswers, completed: boolean): ProjectAssessmentRun => {
    const now = new Date().toISOString();
    const existingRun = database.assessmentRuns.find((run) => run.id === assessmentRunId && run.projectId === projectId && !run.completedAt);
    const savedRun: ProjectAssessmentRun = existingRun
      ? { ...existingRun, answers, updatedAt: now, completedAt: completed ? now : undefined }
      : {
        id: newId("assessment"),
        projectId,
        definitionVersion: ASSESSMENT_DEFINITION_VERSION,
        answers,
        createdByName: database.user.name,
        createdAt: now,
        updatedAt: now,
        completedAt: completed ? now : undefined,
      };
    commit((current) => ({
      ...current,
      assessmentRuns: current.assessmentRuns.some((run) => run.id === savedRun.id)
        ? current.assessmentRuns.map((run) => run.id === savedRun.id ? savedRun : run)
        : [savedRun, ...current.assessmentRuns],
      projects: current.projects.map((project) => project.id === projectId ? { ...project, updatedAt: now } : project),
      auditEvents: completed
        ? [...current.auditEvents, { id: newId("audit"), projectId, action: "assessment.completed", actorName: current.user.name, createdAt: now, details: savedRun.id }]
        : current.auditEvents,
    }));
    return savedRun;
  }, [commit, database.assessmentRuns, database.user.name]);

  const createPlan = useCallback((projectId: string, input: CreatePlanInput): Plan => {
    const project = database.projects.find((candidate) => candidate.id === projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);
    const now = new Date().toISOString();
    const planId = newId("plan");
    const currentPlan = activePlanForProject(database.plans, projectId);
    const assessmentRun = input.method === "guided_assessment"
      ? database.assessmentRuns.find((run) => run.id === input.assessmentRunId && run.projectId === projectId && run.completedAt)
      : undefined;
    const revision = input.method === "revision"
      ? database.revisions.find((candidate) => candidate.id === input.revisionId && candidate.projectId === projectId)
      : undefined;
    if (input.method === "guided_assessment" && !assessmentRun) throw new Error("Completed assessment not found");
    if (input.method === "current_plan" && !currentPlan) throw new Error("Current plan not found");
    if (input.method === "revision" && !revision) throw new Error("Revision not found");

    const plan = input.method === "guided_assessment" && assessmentRun
      ? {
        ...createPlanFromAssessment(project, assessmentRun.answers, database.blocks, database.categories, input.recommendations, {
          method: "guided_assessment",
          createdByName: database.user.name,
          reason: normalizePlanReason(input.reason) ?? assessmentRun.reason,
          sourceAssessmentRunId: assessmentRun.id,
        }),
        id: planId,
        createdAt: now,
        updatedAt: now,
      }
      : input.method === "current_plan" && currentPlan
        ? createDraftFromCurrentPlan(currentPlan, { id: planId, now, createdByName: database.user.name, reason: normalizePlanReason(input.reason) })
        : input.method === "revision" && revision
          ? createDraftFromRevision(revision, { id: planId, now, createdByName: database.user.name, reason: normalizePlanReason(input.reason) })
          : {
            ...createPlanFromAssessment(project, defaultAssessmentAnswers, database.blocks, database.categories, [], {
              method: "blank",
              createdByName: database.user.name,
              reason: normalizePlanReason(input.reason),
            }),
            id: planId,
            createdAt: now,
            updatedAt: now,
          };

    const revisionAssets = revision
      ? revision.snapshot.project.assets.filter((asset) => plan.includedAssetIds.includes(asset.id) || plan.layout.elements.some((element) => (element.kind === "image" || element.kind === "pdf_page") && element.assetId === asset.id))
      : [];
    commit((current) => ({
      ...current,
      plans: replaceActivePlan(current.plans, plan, now),
      projects: current.projects.map((candidate) => {
        if (candidate.id !== projectId) return candidate;
        const existingAssetIds = new Set(candidate.assets.map((asset) => asset.id));
        const restoredAssets = revisionAssets.filter((asset) => !existingAssetIds.has(asset.id));
        return { ...candidate, assets: [...candidate.assets, ...restoredAssets], updatedAt: now };
      }),
      generatedDocuments: current.generatedDocuments.map((document) => document.projectId === projectId ? { ...document, stale: true } : document),
      auditEvents: [...current.auditEvents, { id: newId("audit"), projectId, action: "plan.draft.created", actorName: current.user.name, createdAt: now, details: input.method }],
    }));
    return plan;
  }, [commit, database]);

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
    const blockWithoutLegacyColor = { ...block } as BuildingBlock & { color?: string };
    Reflect.deleteProperty(blockWithoutLegacyColor, "color");
    const normalizedBlock = {
      ...blockWithoutLegacyColor,
      categoryIds: categoryPlacementIds(block.primaryCategoryId, current.categories),
    };
    return { ...current, blocks: current.blocks.some((candidate) => candidate.id === block.id) ? current.blocks.map((candidate) => candidate.id === block.id ? normalizedBlock : candidate) : [normalizedBlock, ...current.blocks] };
  }), [commit]);
  const archiveBlock = useCallback((blockId: string) => commit((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === blockId ? { ...block, lifecycle: "archived" } : block) })), [commit]);
  const restoreBlock = useCallback((blockId: string) => commit((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === blockId ? { ...block, lifecycle: "active" } : block) })), [commit]);
  const saveCategory = useCallback((category: BuildingBlockCategory) => commit((current) => {
    const normalizedCategory = normalizeCategoryColorOwnership(category);
    const categories = current.categories.some((candidate) => candidate.id === category.id)
      ? current.categories.map((candidate) => candidate.id === category.id ? normalizedCategory : candidate)
      : [...current.categories, normalizedCategory];
    const blocks = current.blocks.map((block) => ({
      ...block,
      categoryIds: categoryPlacementIds(block.primaryCategoryId, categories),
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
    if (template.id === "overview-template-participants") return current;
    const validationLocale = locale ?? current.user.preferredLocale;
    const localizedTemplate = localizeOverviewTemplate(template, validationLocale);
    const localizedTemplates = current.overviewTemplates.map((candidate) => localizeOverviewTemplate(candidate, validationLocale));
    if (!validateOverviewTemplate(localizedTemplate, localizedTemplates).valid) return current;
    return { ...current, overviewTemplates: current.overviewTemplates.some((candidate) => candidate.id === template.id) ? current.overviewTemplates.map((candidate) => candidate.id === template.id ? template : candidate) : [template, ...current.overviewTemplates] };
  }), [commit]);
  const deleteOverviewTemplate = useCallback((templateId: string) => commit((current) => templateId === "overview-template-participants" ? current : ({ ...current, overviewTemplates: current.overviewTemplates.filter((template) => template.id !== templateId) })), [commit]);
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
    database, setLocale, createProject, deleteProject, updateProject, updateProjectStatus, beginAssessment, saveAssessment, createPlan, updatePlan, publishPlan,
    saveContact, archiveContact, restoreContact, deleteContact, mergeContacts, assignContactsToProject,
    saveCompany, mergeCompanies, archiveCompany, restoreCompany, deleteCompany,
    saveContactAffiliation, saveProjectContactAssignment, removeProjectContactAssignment, createProjectRoleDefinition, saveProjectRoleDefinition, archiveProjectRoleDefinition, reorderProjectRoleDefinitions, addContactImportBatch, commitContactImport, undoContactImportBatch, recordContactExport,
    recordContactProviderEvent,
    saveBlock, archiveBlock, restoreBlock, saveCategory, reorderCategories, archiveCategory, restoreCategory,
    applyOverviewTemplates: applyTemplatesToProject, saveOverviewTemplate, deleteOverviewTemplate,
    saveDocumentTemplate, deleteDocumentTemplate, setDocumentTemplate, addGeneratedDocument, resetDemo,
    migrationRecovery: {
      available: repository.current.hasBackup(),
      error: repository.current.getMigrationError(),
    },
    restoreMigrationBackup, downloadMigrationBackup,
    getProject: (projectId) => {
      const project = database.projects.find((candidate) => candidate.id === projectId);
      return project ? projectWithResolvedParticipants(database, project) : undefined;
    },
    getPlanForProject: (projectId) => activePlanForProject(database.plans, projectId),
    getAssessmentRun: (assessmentRunId) => database.assessmentRuns.find((run) => run.id === assessmentRunId),
    getLatestAssessmentRun: (projectId) => database.assessmentRuns.find((run) => run.projectId === projectId),
  }), [database, setLocale, createProject, deleteProject, updateProject, updateProjectStatus, saveContact, archiveContact, restoreContact, deleteContact, mergeContacts, assignContactsToProject, saveCompany, mergeCompanies, archiveCompany, restoreCompany, deleteCompany, saveContactAffiliation, saveProjectContactAssignment, removeProjectContactAssignment, createProjectRoleDefinition, saveProjectRoleDefinition, archiveProjectRoleDefinition, reorderProjectRoleDefinitions, addContactImportBatch, commitContactImport, undoContactImportBatch, recordContactExport, recordContactProviderEvent, beginAssessment, saveAssessment, createPlan, updatePlan, publishPlan, saveBlock, archiveBlock, restoreBlock, saveCategory, reorderCategories, archiveCategory, restoreCategory, applyTemplatesToProject, saveOverviewTemplate, deleteOverviewTemplate, saveDocumentTemplate, deleteDocumentTemplate, setDocumentTemplate, addGeneratedDocument, restoreMigrationBackup, downloadMigrationBackup, resetDemo]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used inside AppProvider");
  return context;
}
