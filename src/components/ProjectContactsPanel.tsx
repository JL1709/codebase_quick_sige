import { Pencil, Plus, Trash2, UserPlus, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { companyForContact, contactDisplayName, primaryEmail, primaryPhone, projectContactRoleFromKey, projectContactRoleKey } from "../domain/contacts";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";
import { invalidProjectSectionIds } from "../domain/projectOverview";
import { PROJECT_PARTICIPANTS_SECTION_ID } from "../domain/projectOverviewOrder";
import { ContactFormModal } from "./ContactFormModal";
import { ProjectContactPicker } from "./ProjectContactPicker";
import { ProjectRolePicker } from "./ProjectRolePicker";
import { Button, EmptyState, Modal } from "./Ui";

interface ProjectContactsPanelProps {
  projectId: string;
  title?: string;
  titleEditing?: boolean;
  onTitleChange?: (title: string) => void;
  onRemoveSection?: () => void;
}

export function ProjectContactsPanel({ projectId, title, titleEditing = false, onTitleChange, onRemoveSection }: ProjectContactsPanelProps) {
  const { database, saveProjectContactAssignment, removeProjectContactAssignment, createProjectRoleDefinition } = useApp();
  const { t } = useI18n();
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [roleKeys, setRoleKeys] = useState<string[]>([]);
  const [assignmentToRemoveId, setAssignmentToRemoveId] = useState("");
  const [titleEditorOpen, setTitleEditorOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const newlyCreatedRoleLabels = useRef(new Map<string, string>());
  const canManageContacts = database.user.role !== "viewer";
  const sectionTitle = title ?? t("project.participants");
  const project = database.projects.find((candidate) => candidate.id === projectId);
  const titleValid = project
    ? !invalidProjectSectionIds({ ...project, participantsSectionName: titleEditorOpen ? titleDraft : sectionTitle }).has(PROJECT_PARTICIPANTS_SECTION_ID)
    : Boolean((titleEditorOpen ? titleDraft : sectionTitle).trim());
  const assignments = database.projectContactAssignments.filter((assignment) => assignment.projectId === projectId && assignment.lifecycle === "active");
  const selectedContact = database.contacts.find((contact) => contact.id === contactId);
  const assignmentToRemove = assignments.find((assignment) => assignment.id === assignmentToRemoveId);
  const contactToRemove = assignmentToRemove ? database.contacts.find((contact) => contact.id === assignmentToRemove.contactId) : undefined;

  useEffect(() => {
    if (!titleEditorOpen) setTitleDraft(sectionTitle);
  }, [sectionTitle, titleEditorOpen]);

  const openAssignmentModal = () => {
    setContactId("");
    setRoleKeys([]);
    setAssignmentOpen(true);
  };

  const addAssignment = () => {
    const selectedRoles = roleKeys.flatMap((roleKey) => {
      const role = projectContactRoleFromKey(database, roleKey, newId("role"), projectId);
      return role ? [role] : [];
    });
    if (!contactId) return;
    const now = new Date().toISOString();
    saveProjectContactAssignment({
      id: newId("assignment"), organizationId: database.organization.id, projectId, contactId,
      roles: selectedRoles,
      lifecycle: "active", createdAt: now, updatedAt: now,
    });
    setAssignmentOpen(false);
    setContactId("");
    setRoleKeys([]);
  };
  const updateAssignmentRoles = (assignmentId: string, selectedRoleKeys: string[]) => {
    const assignment = assignments.find((candidate) => candidate.id === assignmentId);
    if (!assignment) return;
    const roles = selectedRoleKeys.flatMap((selectedRoleKey) => {
      const existingRole = assignment.roles.find((currentRole) => projectContactRoleKey(currentRole) === selectedRoleKey);
      const role = projectContactRoleFromKey(database, selectedRoleKey, existingRole?.id ?? newId("role"), projectId);
      if (role) return [role];
      const definitionId = selectedRoleKey.startsWith("custom:") ? selectedRoleKey.slice("custom:".length) : "";
      const customLabel = newlyCreatedRoleLabels.current.get(definitionId);
      return definitionId && customLabel
        ? [{ id: newId("role"), role: "custom" as const, roleDefinitionId: definitionId, customLabel }]
        : [];
    });
    saveProjectContactAssignment({ ...assignment, roles });
  };

  const createRole = (name: string, reusable: boolean): string | undefined => {
    const definition = createProjectRoleDefinition(name, reusable ? undefined : projectId);
    if (definition) newlyCreatedRoleLabels.current.set(definition.id, definition.name);
    return definition ? `custom:${definition.id}` : undefined;
  };

  return <section className="panel project-contacts-panel overview-span-two">
    <div className="panel-header"><div>{titleEditing || titleEditorOpen
      ? <input className="project-section-title-input" aria-label={t("project.sectionTitle")} value={titleEditing ? sectionTitle : titleDraft} onChange={(event) => titleEditing ? onTitleChange?.(event.target.value) : setTitleDraft(event.target.value)} />
      : <h2>{sectionTitle}</h2>}<p>{t("contacts.projectPanelHelp")}</p>{(titleEditing || titleEditorOpen) && !titleValid && <small className="field-error" role="alert">{t("project.sectionNameUnique")}</small>}</div><div className="row-actions">{onTitleChange && !titleEditing && (titleEditorOpen ? <><Button type="button" size="small" variant="ghost" onClick={() => { setTitleDraft(sectionTitle); setTitleEditorOpen(false); }}>{t("common.cancel")}</Button><Button type="button" size="small" disabled={!titleValid} onClick={() => { onTitleChange(titleDraft.trim()); setTitleEditorOpen(false); }}>{t("common.save")}</Button></> : <button type="button" className="icon-button" disabled={!canManageContacts} aria-label={`${t("project.editSectionTitle")}: ${sectionTitle}`} onClick={() => setTitleEditorOpen(true)}><Pencil size={14} /></button>)}<Button type="button" size="small" variant="secondary" disabled={!canManageContacts} onClick={() => setContactFormOpen(true)}><Plus size={14} />{t("contacts.newContact")}</Button><Button type="button" size="small" disabled={!canManageContacts} onClick={openAssignmentModal}><UserPlus size={14} />{t("contacts.addToProject")}</Button>{onRemoveSection && <Button type="button" size="small" variant="ghost" onClick={onRemoveSection}><Trash2 size={14} />{t("common.remove")}</Button>}</div></div>
    <div className="panel-body">{assignments.length === 0 ? <EmptyState icon={<Users />} title={t("contacts.noProjectContacts")} text={t("contacts.noProjectContactsText")} /> : <div className="project-contact-list">{assignments.map((assignment) => {
      const contact = database.contacts.find((candidate) => candidate.id === assignment.contactId);
      const company = contact ? companyForContact(database, contact.id) : undefined;
      if (!contact) return null;
      return <article key={assignment.id}><span className="participant-avatar">{contactDisplayName(contact).slice(0, 1).toUpperCase()}</span><span><strong>{contactDisplayName(contact)}</strong><small>{[company?.name, primaryEmail(contact)?.value, primaryPhone(contact)?.value].filter(Boolean).join(" · ")}</small></span><ProjectRolePicker projectId={projectId} selectedRoleKeys={assignment.roles.map(projectContactRoleKey)} onChange={(selectedRoleKeys) => updateAssignmentRoles(assignment.id, selectedRoleKeys)} onCreateRole={createRole} disabled={!canManageContacts} /><span className="row-actions"><button type="button" className="icon-button danger-icon" disabled={!canManageContacts} aria-label={t("contacts.removeFromProject")} onClick={() => setAssignmentToRemoveId(assignment.id)}><Trash2 size={14} /></button></span></article>;
    })}</div>}</div>

    <Modal open={assignmentOpen} title={t("contacts.addToProject")} onClose={() => setAssignmentOpen(false)}>
      <div className="modal-body contact-assignment-form">
        <ProjectContactPicker
          excludedContactIds={[...assignments.map((assignment) => assignment.contactId), ...(contactId ? [contactId] : [])]}
          onSelect={setContactId}
          onCreateContact={() => { setAssignmentOpen(false); setContactFormOpen(true); }}
        />
        {selectedContact && <div className="project-contact-picker-selection">
          <span className="participant-avatar">{contactDisplayName(selectedContact).slice(0, 1).toUpperCase()}</span>
          <span><strong>{contactDisplayName(selectedContact)}</strong><small>{[companyForContact(database, selectedContact.id)?.name, primaryEmail(selectedContact)?.value, primaryPhone(selectedContact)?.value].filter(Boolean).join(" · ")}</small></span>
          <button type="button" className="icon-button" aria-label={`${t("common.remove")}: ${contactDisplayName(selectedContact)}`} onClick={() => setContactId("")}><X size={14} /></button>
        </div>}
        <ProjectRolePicker projectId={projectId} selectedRoleKeys={roleKeys} onChange={setRoleKeys} onCreateRole={createRole} />
      </div>
      <div className="modal-footer"><Button type="button" variant="secondary" onClick={() => setAssignmentOpen(false)}>{t("common.cancel")}</Button><Button type="button" disabled={!contactId} onClick={addAssignment}>{t("common.add")}</Button></div>
    </Modal>
    <Modal open={Boolean(assignmentToRemoveId)} title={t("contacts.removeFromProjectTitle")} onClose={() => setAssignmentToRemoveId("")}>
      <div className="modal-body"><p>{t("contacts.removeFromProjectHelp", { name: contactToRemove ? contactDisplayName(contactToRemove) : "" })}</p></div>
      <div className="modal-footer"><Button type="button" variant="secondary" onClick={() => setAssignmentToRemoveId("")}>{t("common.cancel")}</Button><Button type="button" variant="danger" onClick={() => { if (assignmentToRemove) removeProjectContactAssignment(assignmentToRemove.id); setAssignmentToRemoveId(""); }}>{t("contacts.removeFromProject")}</Button></div>
    </Modal>
    {contactFormOpen && <ContactFormModal open projectParticipantContext onSaved={(contact) => { setContactId(contact.id); setAssignmentOpen(true); }} onClose={() => setContactFormOpen(false)} />}
  </section>;
}
