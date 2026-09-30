import { ArrowLeft, Check, ChevronDown, ChevronUp, Eye, LayoutTemplate, Plus, Trash2, Upload, Users } from "lucide-react";
import { type CSSProperties, type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { OverviewEntryBuilder } from "../components/OverviewEntryBuilder";
import { ProjectOverviewFields } from "../components/ProjectOverviewFields";
import { Button, PageHeader } from "../components/Ui";
import { ContactFormModal } from "../components/ContactFormModal";
import { ContactImportModal } from "../components/ContactImportModal";
import { countOverviewEntries, instantiateOverviewSection, localizeOverviewTemplate, validateOverviewTemplate } from "../domain/overviewTemplates";
import { validateProjectForm } from "../domain/projectValidation";
import { contactDisplayName, STANDARD_PROJECT_ROLES } from "../domain/contacts";
import type { OverviewTemplate, OverviewTemplateEntry, ProjectOverviewSection, ProjectParticipantRole } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";
import { NotFoundPage } from "./NotFoundPage";

export function ProjectFormPage() {
  const { projectId } = useParams();
  const { database, createProject, getProject, updateProject } = useApp();
  const { locale, t, formatDate } = useI18n();
  const navigate = useNavigate();
  const existingProject = projectId ? getProject(projectId) : undefined;
  const [name, setName] = useState(existingProject?.name ?? "");
  const [sections, setSections] = useState<ProjectOverviewSection[]>(() => structuredClone(existingProject?.overviewSections ?? []));
  const [additionalEntries, setAdditionalEntries] = useState<OverviewTemplateEntry[]>([]);
  const [previewedTemplateIds, setPreviewedTemplateIds] = useState<Set<string>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [projectContacts, setProjectContacts] = useState<Array<{ contactId: string; roles: ProjectParticipantRole[]; customLabel: string }>>([]);
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [contactImportOpen, setContactImportOpen] = useState(false);
  const additionalTemplate = useMemo<OverviewTemplate>(() => ({
    id: "project-additional-information",
    organizationId: database.organization.id,
    name: t("project.additionalInformation"),
    sourceLocale: locale,
    entries: additionalEntries,
    createdAt: "",
    updatedAt: "",
  }), [additionalEntries, database.organization.id, locale, t]);
  const additionalValidation = useMemo(() => validateOverviewTemplate(additionalTemplate, []), [additionalTemplate]);

  if (projectId && !existingProject) return <NotFoundPage />;

  const togglePreview = (templateId: string) => setPreviewedTemplateIds((current) => {
    const next = new Set(current);
    if (next.has(templateId)) next.delete(templateId); else next.add(templateId);
    return next;
  });
  const includeTemplate = (template: OverviewTemplate) => {
    if (sections.some((section) => section.templateId === template.id)) return;
    setSections((current) => [...current, instantiateOverviewSection(template, newId, locale)]);
  };
  const removeSection = (sectionId: string) => setSections((current) => current.filter((section) => section.id !== sectionId));
  const updateSection = (sectionId: string, entries: ProjectOverviewSection["entries"]) => setSections((current) => current.map((section) => section.id === sectionId ? { ...section, entries } : section));
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!name.trim() || !additionalValidation.valid) return;
    let overviewSections = sections;
    if (additionalEntries.length > 0) {
      const additionalSection = instantiateOverviewSection(additionalTemplate, newId, locale);
      const projectOnlySection = { ...additionalSection };
      Reflect.deleteProperty(projectOnlySection, "templateId");
      overviewSections = [...overviewSections, projectOnlySection];
    }
    const validation = validateProjectForm({ name, overviewSections });
    if (!validation.success) return;
    if (existingProject) {
      updateProject({ ...existingProject, name: validation.data.name, overviewSections: validation.data.overviewSections });
      navigate(`/projects/${existingProject.id}`);
      return;
    }
    const project = createProject(validation.data, projectContacts.map((selection) => ({
      contactId: selection.contactId,
      roles: selection.roles.map((role) => ({ role, customLabel: role === "custom" ? selection.customLabel.trim() || undefined : undefined })),
    })));
    navigate(`/projects/${project.id}/plan`);
  };

  return <div className="page page-narrow project-form-page">
    <PageHeader
      eyebrow={t("dashboard.eyebrow")}
      title={t(existingProject ? "project.editTitle" : "project.createTitle")}
      description={t(existingProject ? "project.editSubtitle" : "project.createSubtitle")}
      action={<Link to={existingProject ? `/projects/${existingProject.id}` : "/"}><Button variant="ghost"><ArrowLeft size={16} />{t("common.back")}</Button></Link>}
    />
    <form className="project-composer" onSubmit={handleSubmit}>
      <section className="panel project-name-panel project-additional-fields">
        <div className="panel-body">
          <label className="field"><span>{t("project.name")}</span><input autoFocus required aria-invalid={submitted && !name.trim()} aria-describedby={submitted && !name.trim() ? "project-name-error" : undefined} value={name} onChange={(event) => setName(event.target.value)} /></label>
          {submitted && !name.trim() && <small id="project-name-error" className="field-error" role="alert">{t("project.nameRequired")}</small>}
          <div className="project-details-builder"><OverviewEntryBuilder entries={additionalEntries} invalidEntryIds={additionalValidation.invalidEntryIds} onChange={setAdditionalEntries} t={t} valueLabelKey="project.valueOptional" /></div>
        </div>
      </section>

      {!existingProject && <section className="panel project-create-contacts">
        <div className="panel-header"><div><h2>{t("project.participants")}</h2><p>{t("contacts.createProjectHelp")}</p></div><div className="row-actions"><Button type="button" size="small" variant="ghost" onClick={() => setContactImportOpen(true)}><Upload size={14} />{t("contacts.import.action")}</Button><Button type="button" size="small" variant="secondary" onClick={() => setContactFormOpen(true)}><Plus size={14} />{t("contacts.newContact")}</Button><Users size={19} /></div></div>
        <div className="panel-body">
          {database.contacts.filter((contact) => contact.lifecycle === "active").length === 0 ? <p className="field-help">{t("contacts.createProjectEmpty")}</p> : <>
            <label className="field"><span>{t("contacts.addPerson")}</span><select value="" onChange={(event) => { const selectedContactId = event.target.value; if (selectedContactId && !projectContacts.some((selection) => selection.contactId === selectedContactId)) setProjectContacts((current) => [...current, { contactId: selectedContactId, roles: ["contractor"], customLabel: "" }]); }}><option value="">{t("contacts.chooseContact")}</option>{database.contacts.filter((contact) => contact.lifecycle === "active" && !projectContacts.some((selection) => selection.contactId === contact.id)).map((contact) => <option value={contact.id} key={contact.id}>{contactDisplayName(contact)}</option>)}</select></label>
            <div className="project-create-contact-list">{projectContacts.map((selection) => {
              const contact = database.contacts.find((candidate) => candidate.id === selection.contactId);
              return <div key={selection.contactId}><strong>{contact ? contactDisplayName(contact) : "—"}</strong><fieldset className="role-checkboxes project-create-contact-roles"><legend>{t("contacts.roles")}</legend>{[...STANDARD_PROJECT_ROLES, "custom" as const].map((role) => <label key={role}><input type="checkbox" checked={selection.roles.includes(role)} onChange={(event) => setProjectContacts((current) => current.map((candidate) => candidate.contactId === selection.contactId ? { ...candidate, roles: event.target.checked ? [...candidate.roles, role] : candidate.roles.filter((currentRole) => currentRole !== role) } : candidate))} />{t(`contacts.role.${role}`)}</label>)}</fieldset>{selection.roles.includes("custom") && <input aria-label={t("contacts.customRole")} required value={selection.customLabel} onChange={(event) => setProjectContacts((current) => current.map((candidate) => candidate.contactId === selection.contactId ? { ...candidate, customLabel: event.target.value } : candidate))} />}<button type="button" className="icon-button danger-icon" aria-label={t("common.remove")} onClick={() => setProjectContacts((current) => current.filter((candidate) => candidate.contactId !== selection.contactId))}><Trash2 size={14} /></button></div>;
            })}</div>
          </>}
        </div>
      </section>}

      <section className="panel project-template-browser">
        <div className="panel-header"><div><h2>{t("project.useTemplates")}</h2><p>{t("project.useTemplatesText")}</p></div><LayoutTemplate size={19} /></div>
        <div className="panel-body project-template-cards">
          {database.overviewTemplates.filter((template) => template.id !== "overview-template-participants").map((template) => {
            const localizedTemplate = localizeOverviewTemplate(template, locale);
            const included = sections.some((section) => section.templateId === template.id);
            const previewed = previewedTemplateIds.has(template.id);
            return <article className={`project-template-card ${included ? "is-included" : ""}`} key={template.id}>
              <div className="project-template-card-heading"><div><strong>{localizedTemplate.name}</strong><span>{countOverviewEntries(localizedTemplate.entries)} {t("overview.entries")}</span></div><div className="row-actions"><Button type="button" size="small" variant="ghost" onClick={() => togglePreview(template.id)}><Eye size={14} />{previewed ? t("project.hidePreview") : t("project.previewTemplate")}{previewed ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</Button><Button type="button" size="small" variant={included ? "secondary" : "primary"} disabled={included} onClick={() => includeTemplate(template)}>{included ? <><Check size={14} />{t("project.included")}</> : <><Plus size={14} />{t("project.includeTemplate")}</>}</Button></div></div>
              {previewed && <TemplatePreview entries={localizedTemplate.entries} t={t} />}
            </article>;
          })}
        </div>
      </section>

      {sections.map((section) => <section className="panel project-included-section" key={section.id}>
        <div className="panel-header"><div><h2>{section.name}</h2><p>{t("project.completeBeforeCreate")}</p></div><Button type="button" size="small" variant="ghost" onClick={() => removeSection(section.id)}><Trash2 size={14} />{t("common.remove")}</Button></div>
        <div className="panel-body"><ProjectOverviewFields entries={section.entries} editing onChange={(entries) => updateSection(section.id, entries)} t={t} formatDate={formatDate} /></div>
      </section>)}

      <div className="project-composer-footer"><Link to={existingProject ? `/projects/${existingProject.id}` : "/"}><Button type="button" variant="secondary">{t("common.cancel")}</Button></Link><Button type="submit" disabled={!name.trim() || !additionalValidation.valid || projectContacts.some((selection) => selection.roles.length === 0 || (selection.roles.includes("custom") && !selection.customLabel.trim()))}>{existingProject ? t("common.save") : t("project.createAction")}</Button></div>
    </form>
    {contactFormOpen && <ContactFormModal open onSaved={(contact) => setProjectContacts((current) => current.some((selection) => selection.contactId === contact.id) ? current : [...current, { contactId: contact.id, roles: ["contractor"], customLabel: "" }])} onClose={() => setContactFormOpen(false)} />}
    {contactImportOpen && <ContactImportModal open onImported={(contactIds) => setProjectContacts((current) => [
      ...current,
      ...contactIds.filter((contactId) => !current.some((selection) => selection.contactId === contactId)).map((contactId) => ({ contactId, roles: ["contractor" as const], customLabel: "" })),
    ])} onClose={() => setContactImportOpen(false)} />}
  </div>;
}

function TemplatePreview({ entries, t, depth = 0 }: { entries: OverviewTemplateEntry[]; t: (key: string) => string; depth?: number }) {
  return <div className="project-template-preview">{entries.map((entry) => <div className="project-template-preview-entry" style={{ "--preview-depth": depth } as CSSProperties} key={entry.id}><span>{entry.label}</span><small>{t(`templates.entryType.${entry.type}`)}</small>{entry.children.length > 0 && <TemplatePreview entries={entry.children} t={t} depth={depth + 1} />}</div>)}</div>;
}
