import { DndContext, DragOverlay, PointerSensor, closestCenter, type DragEndEvent, type DragStartEvent, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, GripVertical, LayoutTemplate, Plus, Trash2, Users } from "lucide-react";
import { type CSSProperties, type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ContactFormModal } from "../components/ContactFormModal";
import { ProjectContactPicker } from "../components/ProjectContactPicker";
import { ProjectContactsPanel } from "../components/ProjectContactsPanel";
import { ProjectRolePicker } from "../components/ProjectRolePicker";
import { invalidProjectOverviewEntryIds, ProjectOverviewFields } from "../components/ProjectOverviewFields";
import { Button, Modal, PageHeader } from "../components/Ui";
import { companyForContact, contactDisplayName, primaryEmail, primaryPhone, projectContactRoleFromKey } from "../domain/contacts";
import {
  countOverviewEntries,
  instantiateOverviewSection,
  localizeOverviewTemplate,
  uniqueProjectOverviewSectionName,
} from "../domain/overviewTemplates";
import { moveProjectOverviewSection, normalizeProjectOverviewSectionOrder, PROJECT_PARTICIPANTS_SECTION_ID } from "../domain/projectOverviewOrder";
import { validateProjectForm } from "../domain/projectValidation";
import { invalidProjectSectionIds } from "../domain/projectOverview";
import type { OverviewTemplate, OverviewTemplateEntry, ProjectOverviewSection, ProjectRoleDefinition } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";
import { NotFoundPage } from "./NotFoundPage";

export function ProjectFormPage() {
  const { projectId } = useParams();
  const { database, createProject, createProjectRoleDefinition, getProject, updateProject } = useApp();
  const { locale, t, formatDate } = useI18n();
  const navigate = useNavigate();
  const existingProject = projectId ? getProject(projectId) : undefined;
  const [name, setName] = useState(existingProject?.name ?? "");
  const [sections, setSections] = useState<ProjectOverviewSection[]>(() => structuredClone(existingProject?.overviewSections ?? []));
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => existingProject
    ? normalizeProjectOverviewSectionOrder(existingProject.overviewSectionOrder, existingProject.overviewSections)
    : []);
  const [participantsSectionName, setParticipantsSectionName] = useState(existingProject?.participantsSectionName ?? t("project.participants"));
  const [previewTemplate, setPreviewTemplate] = useState<OverviewTemplate | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [projectContacts, setProjectContacts] = useState<Array<{ contactId: string; roleKeys: string[] }>>([]);
  const [draftProjectRoles, setDraftProjectRoles] = useState<ProjectRoleDefinition[]>([]);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const sectionSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const availableTemplates = database.overviewTemplates.filter((template) => template.id !== "overview-template-participants");
  const participantsIncluded = sectionOrder.includes(PROJECT_PARTICIPANTS_SECTION_ID);
  const invalidSectionIds = new Set(sections
    .filter((section) => !section.name.trim() || invalidProjectOverviewEntryIds(section.entries).size > 0)
    .map((section) => section.id));
  const invalidSectionNameIds = invalidProjectSectionIds({ overviewSections: sections, overviewSectionOrder: sectionOrder, participantsSectionName });
  invalidSectionNameIds.forEach((id) => invalidSectionIds.add(id));
  const formValid = Boolean(name.trim())
    && Boolean(participantsSectionName.trim())
    && invalidSectionIds.size === 0;

  if (projectId && !existingProject) return <NotFoundPage />;

  const addParticipantsSection = () => {
    setSectionOrder((current) => current.includes(PROJECT_PARTICIPANTS_SECTION_ID)
      ? current
      : [...current, PROJECT_PARTICIPANTS_SECTION_ID]);
  };

  const appendFieldSection = (section: ProjectOverviewSection) => {
    setSections((current) => [...current, {
      ...section,
      name: uniqueProjectOverviewSectionName(section.name, participantsIncluded ? [...current, { id: PROJECT_PARTICIPANTS_SECTION_ID, name: participantsSectionName, entries: [] }] : current),
    }]);
    setSectionOrder((current) => [...current, section.id]);
  };

  const addTemplateSection = (template: OverviewTemplate) => {
    appendFieldSection(instantiateOverviewSection(template, newId, locale));
    setPreviewTemplate(null);
  };

  const addCustomSection = () => {
    appendFieldSection({
      id: newId("overview-section"),
      name: t("project.customSection"),
      entries: [],
    });
  };

  const removeSection = (sectionId: string) => {
    if (sectionId !== PROJECT_PARTICIPANTS_SECTION_ID) {
      setSections((current) => current.filter((section) => section.id !== sectionId));
    }
    setSectionOrder((current) => current.filter((id) => id !== sectionId));
  };

  const updateSection = (sectionId: string, update: Partial<Pick<ProjectOverviewSection, "name" | "entries">>) => {
    setSections((current) => current.map((section) => section.id === sectionId ? { ...section, ...update } : section));
  };

  const handleSectionDragStart = ({ active }: DragStartEvent) => setActiveSectionId(String(active.id));

  const handleSectionDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveSectionId(null);
    if (!over || active.id === over.id) return;
    setSectionOrder((current) => {
      const activeIndex = current.indexOf(String(active.id));
      const targetIndex = current.indexOf(String(over.id));
      return activeIndex < 0 || targetIndex < 0 ? current : arrayMove(current, activeIndex, targetIndex);
    });
  };

  const createRoleForNewProject = (roleName: string, reusable: boolean): string | undefined => {
    if (reusable) {
      const definition = createProjectRoleDefinition(roleName);
      return definition ? `custom:${definition.id}` : undefined;
    }
    const normalizedRoleName = roleName.trim();
    if (!normalizedRoleName) return undefined;
    const existingDefinition = draftProjectRoles.find((definition) => definition.name.toLocaleLowerCase() === normalizedRoleName.toLocaleLowerCase());
    if (existingDefinition) return `custom:${existingDefinition.id}`;
    const now = new Date().toISOString();
    const definition: ProjectRoleDefinition = {
      id: newId("project-role"),
      organizationId: database.organization.id,
      projectId: "draft-project",
      name: normalizedRoleName,
      lifecycle: "active",
      sortOrder: draftProjectRoles.length,
      createdAt: now,
      updatedAt: now,
    };
    setDraftProjectRoles((current) => [...current, definition]);
    return `custom:${definition.id}`;
  };

  const handleSubmit = () => {
    setSubmitted(true);
    if (!formValid) return;
    const overviewSectionOrder = normalizeProjectOverviewSectionOrder(sectionOrder, sections);
    const validation = validateProjectForm({
      name,
      participantsSectionName,
      overviewSections: sections,
      overviewSectionOrder,
    });
    if (!validation.success) return;
    if (existingProject) {
      updateProject({ ...existingProject, ...validation.data });
      navigate(`/projects/${existingProject.id}`);
      return;
    }
    const project = createProject(validation.data, projectContacts.map((selection) => ({
      contactId: selection.contactId,
      roles: selection.roleKeys.flatMap((roleKey) => {
        const draftDefinition = roleKey.startsWith("custom:")
          ? draftProjectRoles.find((definition) => definition.id === roleKey.slice("custom:".length))
          : undefined;
        const role = draftDefinition
          ? { id: newId("role"), role: "custom" as const, roleDefinitionId: draftDefinition.id, customLabel: draftDefinition.name }
          : projectContactRoleFromKey(database, roleKey, newId("role"));
        return role ? [{ role: role.role, roleDefinitionId: role.roleDefinitionId, customLabel: role.customLabel }] : [];
      }),
    })), draftProjectRoles.map(({ id, name: roleName }) => ({ id, name: roleName })));
    navigate(`/projects/${project.id}/plan`);
  };

  const localizedPreviewTemplate = previewTemplate ? localizeOverviewTemplate(previewTemplate, locale) : null;

  return <div className="page project-form-page">
    <PageHeader
      eyebrow={t("dashboard.eyebrow")}
      title={t(existingProject ? "project.editTitle" : "project.createTitle")}
      description={t(existingProject ? "project.editSubtitle" : "project.createSubtitle")}
      action={<Link to={existingProject ? `/projects/${existingProject.id}` : "/"}><Button variant="ghost"><ArrowLeft size={16} />{t("common.back")}</Button></Link>}
    />

    <div className="project-create-layout">
      <aside className="panel project-section-library" aria-label={t("project.sectionLibraryTitle")}>
        <div className="project-section-library-header"><LayoutTemplate size={18} /><div><h2>{t("project.sectionLibraryTitle")}</h2><p>{t("project.sectionLibraryText")}</p></div></div>
        <div className="project-section-library-group">
          <h3>{t("project.projectSections")}</h3>
          <button type="button" className="project-section-library-action" disabled={participantsIncluded} onClick={addParticipantsSection}><Users size={16} /><span><strong>{t("project.participants")}</strong><small>{participantsIncluded ? t("project.sectionAdded") : t("project.addParticipantsText")}</small></span><Plus size={14} /></button>
          <button type="button" className="project-section-library-action" onClick={addCustomSection}><Plus size={16} /><span><strong>{t("project.customSection")}</strong><small>{t("project.addCustomSectionText")}</small></span><Plus size={14} /></button>
        </div>
        <div className="project-section-library-group">
          <h3>{t("project.templates")}</h3>
          <div className="project-section-template-list">{availableTemplates.map((template) => {
            const localizedTemplate = localizeOverviewTemplate(template, locale);
            return <article key={template.id}>
              <button type="button" className="project-template-preview-trigger" onClick={() => setPreviewTemplate(template)}><span><strong>{localizedTemplate.name}</strong><small>{countOverviewEntries(localizedTemplate.entries)} {t("overview.entries")}</small></span><Eye size={14} /></button>
              <button type="button" className="icon-button" aria-label={`${t("project.addTemplate")}: ${localizedTemplate.name}`} onClick={() => addTemplateSection(template)}><Plus size={14} /></button>
            </article>;
          })}</div>
        </div>
      </aside>

      <div className="project-composer">
        <section className="panel project-name-panel">
          <div className="panel-body">
            <label className="field"><span>{t("project.name")}</span><input autoFocus required aria-invalid={submitted && !name.trim()} aria-describedby={submitted && !name.trim() ? "project-name-error" : undefined} value={name} onChange={(event) => setName(event.target.value)} /></label>
            {submitted && !name.trim() && <small id="project-name-error" className="field-error" role="alert">{t("project.nameRequired")}</small>}
            <p className="project-section-library-hint">{t("project.sectionLibraryHint")}</p>
          </div>
        </section>

        {sectionOrder.length === 0 ? <section className="project-composer-empty"><LayoutTemplate size={22} /><strong>{t("project.noSectionsTitle")}</strong><p>{t("project.noSectionsText")}</p></section> : <>
          <div className="project-overview-order-heading"><h2>{t("project.overviewOrderTitle")}</h2><p>{t("project.overviewOrderText")}</p></div>
          <DndContext sensors={sectionSensors} collisionDetection={closestCenter} onDragStart={handleSectionDragStart} onDragCancel={() => setActiveSectionId(null)} onDragEnd={handleSectionDragEnd}>
            <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
              <div className="project-overview-order-list">{sectionOrder.map((sectionId, index) => {
              const section = sections.find((candidate) => candidate.id === sectionId);
              const sectionName = sectionId === PROJECT_PARTICIPANTS_SECTION_ID ? participantsSectionName : section?.name ?? "";
              const commonOrderProps = {
                id: sectionId,
                index,
                count: sectionOrder.length,
                name: sectionName,
                onMove: (direction: -1 | 1) => setSectionOrder((current) => moveProjectOverviewSection(current, sectionId, direction)),
                t,
              };
              if (sectionId === PROJECT_PARTICIPANTS_SECTION_ID) return <OrderedOverviewSection key={sectionId} {...commonOrderProps}>
                {existingProject ? <ProjectContactsPanel projectId={existingProject.id} title={participantsSectionName} titleEditing onTitleChange={setParticipantsSectionName} onRemoveSection={() => removeSection(sectionId)} /> : <section className="panel project-create-contacts">
                  <div className="panel-header"><div><input className="project-section-title-input" aria-label={t("project.sectionTitle")} value={participantsSectionName} onChange={(event) => setParticipantsSectionName(event.target.value)} /><p>{t("contacts.createProjectHelp")}</p></div><div className="row-actions"><Button type="button" size="small" variant="secondary" onClick={() => setContactFormOpen(true)}><Plus size={14} />{t("contacts.newContact")}</Button><button type="button" className="icon-button danger-icon" aria-label={`${t("common.remove")}: ${participantsSectionName}`} onClick={() => removeSection(sectionId)}><Trash2 size={14} /></button></div></div>
                  <div className="panel-body">
                    <ProjectContactPicker
                      excludedContactIds={projectContacts.map((selection) => selection.contactId)}
                      onSelect={(selectedContactId) => setProjectContacts((current) => current.some((selection) => selection.contactId === selectedContactId) ? current : [...current, { contactId: selectedContactId, roleKeys: [] }])}
                      onCreateContact={() => setContactFormOpen(true)}
                    />
                    <div className="project-create-contact-list">{projectContacts.map((selection) => {
                        const contact = database.contacts.find((candidate) => candidate.id === selection.contactId);
                        const contactDetails = contact
                          ? [companyForContact(database, contact.id)?.name, primaryEmail(contact)?.value, primaryPhone(contact)?.value].filter(Boolean).join(" · ")
                          : "";
                        return <div key={selection.contactId}>
                          <span className="project-create-contact-identity"><span className="participant-avatar">{contact ? contactDisplayName(contact).slice(0, 1).toUpperCase() : "—"}</span><span><strong>{contact ? contactDisplayName(contact) : "—"}</strong>{contactDetails && <small>{contactDetails}</small>}</span></span>
                          <ProjectRolePicker
                            selectedRoleKeys={selection.roleKeys}
                            additionalDefinitions={draftProjectRoles}
                            onChange={(roleKeys) => setProjectContacts((current) => current.map((candidate) => candidate.contactId === selection.contactId ? { ...candidate, roleKeys } : candidate))}
                            onCreateRole={createRoleForNewProject}
                          />
                          <button type="button" className="icon-button danger-icon" aria-label={`${t("common.remove")}: ${contact ? contactDisplayName(contact) : ""}`} onClick={() => setProjectContacts((current) => current.filter((candidate) => candidate.contactId !== selection.contactId))}><Trash2 size={14} /></button>
                        </div>;
                    })}</div>
                  </div>
                </section>}
              </OrderedOverviewSection>;
              if (!section) return null;
              const invalidEntryIds = invalidProjectOverviewEntryIds(section.entries);
              return <OrderedOverviewSection key={sectionId} {...commonOrderProps}><section className="panel project-included-section">
                <div className="panel-header"><div><input className="project-section-title-input" aria-label={t("project.sectionTitle")} aria-invalid={invalidSectionNameIds.has(section.id)} value={section.name} onChange={(event) => updateSection(section.id, { name: event.target.value })} /><p>{t("project.projectOwnedSectionText")}</p>{invalidSectionNameIds.has(section.id) && <small className="field-error" role="alert">{t("project.sectionNameUnique")}</small>}</div><button type="button" className="icon-button danger-icon" aria-label={`${t("common.remove")}: ${section.name}`} onClick={() => removeSection(section.id)}><Trash2 size={14} /></button></div>
                <div className="panel-body"><ProjectOverviewFields entries={section.entries} editing structureEditing invalidEntryIds={invalidEntryIds} onChange={(entries) => updateSection(section.id, { entries })} t={t} formatDate={formatDate} /></div>
              </section></OrderedOverviewSection>;
              })}</div>
            </SortableContext>
            <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(.2,.8,.2,1)" }}>
              {activeSectionId && <div className="project-section-drag-overlay"><GripVertical size={16} /><span><strong>{activeSectionId === PROJECT_PARTICIPANTS_SECTION_ID ? participantsSectionName : sections.find((section) => section.id === activeSectionId)?.name}</strong><small>{t("project.reorderSection")}</small></span></div>}
            </DragOverlay>
          </DndContext>
        </>}

        <div className="project-composer-footer"><Link to={existingProject ? `/projects/${existingProject.id}` : "/"}><Button type="button" variant="secondary">{t("common.cancel")}</Button></Link><Button type="button" onClick={handleSubmit} disabled={!formValid}>{existingProject ? t("common.save") : t("project.createAction")}</Button></div>
      </div>
    </div>

    <Modal open={Boolean(localizedPreviewTemplate)} title={localizedPreviewTemplate?.name ?? t("project.previewTemplate")} onClose={() => setPreviewTemplate(null)}>
      <div className="modal-body project-template-preview-modal">{localizedPreviewTemplate && <><p>{t("project.templatePreviewText")}</p><TemplatePreview entries={localizedPreviewTemplate.entries} t={t} /></>}</div>
      <div className="modal-footer"><Button type="button" variant="secondary" onClick={() => setPreviewTemplate(null)}>{t("common.cancel")}</Button><Button type="button" disabled={!previewTemplate} onClick={() => { if (previewTemplate) addTemplateSection(previewTemplate); }}><Plus size={14} />{t("project.addToProject")}</Button></div>
    </Modal>
    {contactFormOpen && <ContactFormModal open projectParticipantContext onSaved={(contact) => setProjectContacts((current) => current.some((selection) => selection.contactId === contact.id) ? current : [...current, { contactId: contact.id, roleKeys: [] }])} onClose={() => setContactFormOpen(false)} />}
  </div>;
}

function OrderedOverviewSection({ id, index, count, name, onMove, t, children }: {
  id: string;
  index: number;
  count: number;
  name: string;
  onMove: (direction: -1 | 1) => void;
  t: (key: string) => string;
  children: ReactNode;
}) {
  const sortable = useSortable({ id });
  const stableTransform = sortable.transform ? { ...sortable.transform, scaleX: 1, scaleY: 1 } : null;
  return <div ref={sortable.setNodeRef} className={`project-ordered-section ${sortable.isDragging ? "is-dragging" : ""}`} style={{ transform: CSS.Transform.toString(stableTransform), transition: sortable.transition }}>
    <div className="project-section-order-toolbar">
      <button type="button" ref={sortable.setActivatorNodeRef} {...sortable.attributes} {...sortable.listeners} className="project-section-drag-handle" aria-label={`${t("project.reorderSection")}: ${name}`}><GripVertical size={15} /></button>
      <button type="button" className="icon-button" disabled={index === 0} onClick={() => onMove(-1)} aria-label={`${t("project.moveSectionUp")}: ${name}`}><ArrowUp size={14} /></button>
      <button type="button" className="icon-button" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={`${t("project.moveSectionDown")}: ${name}`}><ArrowDown size={14} /></button>
    </div>
    {children}
  </div>;
}

function TemplatePreview({ entries, t, depth = 0 }: { entries: OverviewTemplateEntry[]; t: (key: string) => string; depth?: number }) {
  return <div className="project-template-preview">{entries.map((entry) => <div className="project-template-preview-entry" style={{ "--preview-depth": depth } as CSSProperties} key={entry.id}><span>{entry.label}</span><small>{t(`templates.entryType.${entry.type}`)}</small>{entry.children.length > 0 && <TemplatePreview entries={entry.children} t={t} depth={depth + 1} />}</div>)}</div>;
}
