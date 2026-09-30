import { Pencil, Plus, Trash2, Upload, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { contactDisplayName, primaryEmail, primaryPhone, STANDARD_PROJECT_ROLES } from "../domain/contacts";
import type { ProjectParticipantRole } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";
import { ContactFormModal } from "./ContactFormModal";
import { ContactImportModal } from "./ContactImportModal";
import { Button, EmptyState, Modal } from "./Ui";

export function ProjectContactsPanel({ projectId }: { projectId: string }) {
  const { database, saveProjectContactAssignment, removeProjectContactAssignment } = useApp();
  const { t } = useI18n();
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [contactId, setContactId] = useState("");
  const [role, setRole] = useState<ProjectParticipantRole>("contractor");
  const [customRole, setCustomRole] = useState("");
  const [editingAssignmentId, setEditingAssignmentId] = useState("");
  const [editingRoles, setEditingRoles] = useState<ProjectParticipantRole[]>([]);
  const [editingCustomRole, setEditingCustomRole] = useState("");
  const [editingCompanyId, setEditingCompanyId] = useState("");
  const canManageContacts = database.user.role !== "viewer";
  const assignments = database.projectContactAssignments.filter((assignment) => assignment.projectId === projectId && assignment.lifecycle === "active");
  const availableContacts = useMemo(() => database.contacts.filter((contact) => (
    contact.lifecycle === "active"
    && !assignments.some((assignment) => assignment.contactId === contact.id)
    && (!query.trim() || [contactDisplayName(contact), ...contact.emails.map((email) => email.value)].join(" ").toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  )), [assignments, database.contacts, query]);

  const addAssignment = () => {
    if (!contactId || (role === "custom" && !customRole.trim())) return;
    const now = new Date().toISOString();
    const affiliation = database.contactAffiliations.find((candidate) => candidate.contactId === contactId && candidate.primary);
    saveProjectContactAssignment({
      id: newId("assignment"), organizationId: database.organization.id, projectId, contactId,
      companyId: affiliation?.companyId,
      roles: [{ id: newId("role"), role, customLabel: role === "custom" ? customRole.trim() : undefined }],
      lifecycle: "active", createdAt: now, updatedAt: now,
    });
    setAssignmentOpen(false);
    setContactId("");
    setCustomRole("");
  };
  const openAssignmentEditor = (assignmentId: string) => {
    const assignment = assignments.find((candidate) => candidate.id === assignmentId);
    if (!assignment) return;
    setEditingAssignmentId(assignment.id);
    setEditingRoles(assignment.roles.map((candidate) => candidate.role));
    setEditingCustomRole(assignment.roles.find((candidate) => candidate.role === "custom")?.customLabel ?? "");
    setEditingCompanyId(assignment.companyId ?? "");
  };
  const saveAssignmentChanges = () => {
    const assignment = assignments.find((candidate) => candidate.id === editingAssignmentId);
    if (!assignment || editingRoles.length === 0 || (editingRoles.includes("custom") && !editingCustomRole.trim())) return;
    saveProjectContactAssignment({
      ...assignment,
      companyId: editingCompanyId || undefined,
      roles: editingRoles.map((selectedRole) => ({
        id: assignment.roles.find((currentRole) => currentRole.role === selectedRole)?.id ?? newId("role"),
        role: selectedRole,
        customLabel: selectedRole === "custom" ? editingCustomRole.trim() : undefined,
      })),
    });
    setEditingAssignmentId("");
  };

  return <section className="panel project-contacts-panel overview-span-two">
    <div className="panel-header"><div><h2>{t("project.participants")}</h2><p>{t("contacts.projectPanelHelp")}</p></div><div className="row-actions"><Button size="small" variant="ghost" disabled={!canManageContacts} onClick={() => setImportOpen(true)}><Upload size={14} />{t("contacts.import.action")}</Button><Button size="small" variant="secondary" disabled={!canManageContacts} onClick={() => setContactFormOpen(true)}><Plus size={14} />{t("contacts.newContact")}</Button><Button size="small" disabled={!canManageContacts} onClick={() => setAssignmentOpen(true)}><UserPlus size={14} />{t("contacts.addToProject")}</Button></div></div>
    <div className="panel-body">{assignments.length === 0 ? <EmptyState icon={<Users />} title={t("contacts.noProjectContacts")} text={t("contacts.noProjectContactsText")} /> : <div className="project-contact-list">{assignments.map((assignment) => {
      const contact = database.contacts.find((candidate) => candidate.id === assignment.contactId);
      const company = assignment.companyId ? database.companies.find((candidate) => candidate.id === assignment.companyId) : undefined;
      if (!contact) return null;
      return <article key={assignment.id}><span className="participant-avatar">{contactDisplayName(contact).slice(0, 1).toUpperCase()}</span><span><strong>{contactDisplayName(contact)}</strong><small>{[company?.name, primaryEmail(contact)?.value, primaryPhone(contact)?.value].filter(Boolean).join(" · ")}</small></span><span className="project-contact-roles">{assignment.roles.map((candidateRole) => <span key={candidateRole.id}>{candidateRole.role === "custom" ? candidateRole.customLabel : t(`contacts.role.${candidateRole.role}`)}</span>)}</span><span className="row-actions"><button type="button" className="icon-button" disabled={!canManageContacts} aria-label={t("contacts.editAssignment")} onClick={() => openAssignmentEditor(assignment.id)}><Pencil size={14} /></button><button type="button" className="icon-button danger-icon" disabled={!canManageContacts} aria-label={t("common.remove")} onClick={() => removeProjectContactAssignment(assignment.id)}><Trash2 size={14} /></button></span></article>;
    })}</div>}</div>

    <Modal open={assignmentOpen} title={t("contacts.addToProject")} onClose={() => setAssignmentOpen(false)}>
      <div className="modal-body contact-assignment-form">
        <label className="field"><span>{t("common.search")}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("contacts.searchPlaceholder")} /></label>
        <label className="field"><span>{t("contacts.person")}</span><select size={Math.min(7, Math.max(3, availableContacts.length))} value={contactId} onChange={(event) => setContactId(event.target.value)}>{availableContacts.map((contact) => <option value={contact.id} key={contact.id}>{contactDisplayName(contact)}{primaryEmail(contact) ? ` · ${primaryEmail(contact)?.value}` : ""}</option>)}</select></label>
        {availableContacts.length === 0 && <p className="field-help">{t("contacts.noAvailableContacts")}</p>}
        <label className="field"><span>{t("contacts.role")}</span><select value={role} onChange={(event) => setRole(event.target.value as ProjectParticipantRole)}>{[...STANDARD_PROJECT_ROLES, "custom" as const].map((value) => <option key={value} value={value}>{t(`contacts.role.${value}`)}</option>)}</select></label>
        {role === "custom" && <label className="field"><span>{t("contacts.customRole")}</span><input value={customRole} onChange={(event) => setCustomRole(event.target.value)} /></label>}
      </div>
      <div className="modal-footer"><Button variant="secondary" onClick={() => setAssignmentOpen(false)}>{t("common.cancel")}</Button><Button disabled={!contactId || (role === "custom" && !customRole.trim())} onClick={addAssignment}>{t("common.add")}</Button></div>
    </Modal>
    <Modal open={Boolean(editingAssignmentId)} title={t("contacts.editAssignment")} onClose={() => setEditingAssignmentId("")}>
      <div className="modal-body contact-assignment-form">
        <fieldset className="contact-fieldset"><legend>{t("contacts.roles")}</legend><div className="role-checkboxes">{[...STANDARD_PROJECT_ROLES, "custom" as const].map((value) => <label key={value}><input type="checkbox" checked={editingRoles.includes(value)} onChange={(event) => setEditingRoles((current) => event.target.checked ? [...current, value] : current.filter((candidate) => candidate !== value))} />{t(`contacts.role.${value}`)}</label>)}</div></fieldset>
        {editingRoles.includes("custom") && <label className="field"><span>{t("contacts.customRole")}</span><input value={editingCustomRole} onChange={(event) => setEditingCustomRole(event.target.value)} /></label>}
        <label className="field"><span>{t("contacts.company")}</span><select value={editingCompanyId} onChange={(event) => setEditingCompanyId(event.target.value)}><option value="">—</option>{database.companies.filter((company) => company.lifecycle === "active").map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      </div>
      <div className="modal-footer"><Button variant="secondary" onClick={() => setEditingAssignmentId("")}>{t("common.cancel")}</Button><Button disabled={editingRoles.length === 0 || (editingRoles.includes("custom") && !editingCustomRole.trim())} onClick={saveAssignmentChanges}>{t("common.save")}</Button></div>
    </Modal>
    {contactFormOpen && <ContactFormModal open onSaved={(contact) => { setContactId(contact.id); setAssignmentOpen(true); }} onClose={() => setContactFormOpen(false)} />}
    {importOpen && <ContactImportModal open defaultProjectId={projectId} onClose={() => setImportOpen(false)} />}
  </section>;
}
