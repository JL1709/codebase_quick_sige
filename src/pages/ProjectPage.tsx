import { ArrowDown, ArrowUp, CalendarDays, Check, Copy, LayoutTemplate, MapPin, Pencil, PhoneCall, Plus, Trash2, UserRoundPlus, X } from "lucide-react";
import { Children, type FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button, Modal } from "../components/Ui";
import { countOverviewEntries, instantiateRepeatingItem, normalizeOverviewKey } from "../domain/overviewTemplates";
import type { CustomField, CustomSection, EmergencyContact, Participant, Project, ProjectOverviewEntry, ProjectOverviewSection } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";
import { NotFoundPage } from "./NotFoundPage";

const participantRoles: Participant["role"][] = ["client", "owner", "coordinator", "architect", "planner", "site_manager", "contractor"];
const emptyParticipant: Omit<Participant, "id"> = { role: "coordinator", company: "", name: "", email: "", phone: "" };
const emptyEmergency: Omit<EmergencyContact, "id"> = { label: "", name: "", phone: "" };

function toPlaceholderKey(label: string, fallback: string): string {
  const normalized = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return normalized || fallback;
}

export function ProjectPage() {
  const { projectId = "" } = useParams();
  const { database, getProject, updateProject, applyOverviewTemplates } = useApp();
  const { t, formatDate } = useI18n();
  const project = getProject(projectId);
  const [draft, setDraft] = useState<Project | null>(project ?? null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [participantOpen, setParticipantOpen] = useState(false);
  const [editingParticipantId, setEditingParticipantId] = useState<string | null>(null);
  const [participant, setParticipant] = useState(emptyParticipant);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [editingEmergencyId, setEditingEmergencyId] = useState<string | null>(null);
  const [emergencyContact, setEmergencyContact] = useState(emptyEmergency);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [sectionTitle, setSectionTitle] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateIds, setTemplateIds] = useState<string[]>([]);

  useEffect(() => { if (!editingDetails && project) setDraft(project); }, [editingDetails, project]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (!editingDetails) return; event.preventDefault(); };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [editingDetails]);
  if (!project || !draft) return <NotFoundPage />;

  const customFieldKeys = draft.customFields.map((field) => field.placeholderKey);
  const detailsValid = draft.customFields.every((field) => field.key.trim().length > 0)
    && new Set(customFieldKeys).size === customFieldKeys.length;
  const saveDetails = () => { if (!detailsValid) return; updateProject(draft); setEditingDetails(false); };
  const cancelDetails = () => { setDraft(project); setEditingDetails(false); };
  const updateDraft = <Key extends keyof Project>(key: Key, value: Project[Key]) => setDraft((current) => current ? { ...current, [key]: value } : current);
  const addField = () => updateDraft("customFields", [...draft.customFields, { id: newId("field"), key: "", value: "", placeholderKey: `field_${draft.customFields.length + 1}` }]);
  const updateField = (id: string, patch: Partial<CustomField>) => updateDraft("customFields", draft.customFields.map((field) => field.id === id ? { ...field, ...patch } : field));
  const moveCustomField = (index: number, direction: -1 | 1) => {
    const target = index + direction; if (target < 0 || target >= draft.customFields.length) return;
    const fields = [...draft.customFields]; [fields[index], fields[target]] = [fields[target], fields[index]]; updateDraft("customFields", fields);
  };
  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction; if (target < 0 || target >= project.customSections.length) return;
    const sections = [...project.customSections]; [sections[index], sections[target]] = [sections[target], sections[index]];
    updateProject({ ...project, customSections: sections });
  };

  const openParticipant = (entry?: Participant) => {
    setEditingParticipantId(entry?.id ?? null);
    setParticipant(entry ? { role: entry.role, company: entry.company, name: entry.name, email: entry.email, phone: entry.phone } : emptyParticipant);
    setParticipantOpen(true);
  };
  const saveParticipant = (event: FormEvent) => {
    event.preventDefault();
    const next = editingParticipantId
      ? project.participants.map((entry) => entry.id === editingParticipantId ? { ...participant, id: entry.id } : entry)
      : [...project.participants, { ...participant, id: newId("participant") }];
    updateProject({ ...project, participants: next });
    setParticipantOpen(false);
  };
  const openEmergency = (entry?: EmergencyContact) => {
    setEditingEmergencyId(entry?.id ?? null);
    setEmergencyContact(entry ? { label: entry.label, name: entry.name, phone: entry.phone } : emptyEmergency);
    setEmergencyOpen(true);
  };
  const saveEmergency = (event: FormEvent) => {
    event.preventDefault();
    const next = editingEmergencyId
      ? project.emergencyContacts.map((entry) => entry.id === editingEmergencyId ? { ...emergencyContact, id: entry.id } : entry)
      : [...project.emergencyContacts, { ...emergencyContact, id: newId("emergency") }];
    updateProject({ ...project, emergencyContacts: next });
    setEmergencyOpen(false);
  };
  const addSection = (event: FormEvent) => {
    event.preventDefault();
    const baseKey = toPlaceholderKey(sectionTitle, `section_${project.customSections.length + 1}`);
    const usedKeys = new Set(project.customSections.map((section) => section.placeholderKey));
    let placeholderKey = baseKey;
    let suffix = 2;
    while (usedKeys.has(placeholderKey)) { placeholderKey = `${baseKey}_${suffix}`; suffix += 1; }
    updateProject({ ...project, customSections: [...project.customSections, { id: newId("section"), title: sectionTitle, placeholderKey, fields: [] }] });
    setSectionTitle(""); setSectionOpen(false);
  };
  const updateSection = (section: CustomSection) => updateProject({ ...project, customSections: project.customSections.map((candidate) => candidate.id === section.id ? section : candidate) });

  return (
    <div className="workspace-page overview-page">
      <section className="overview-heading"><div><h1>{t("project.overview")}</h1><p>{t("project.editSubtitle")}</p></div><div className="row-actions"><Button variant="secondary" onClick={() => setTemplateOpen(true)}><LayoutTemplate size={15} />{t("overview.applyTemplate")}</Button><Button variant="secondary" onClick={() => setSectionOpen(true)}><Plus size={15} />{t("overview.addSection")}</Button></div></section>
      <div className="overview-grid">
        <section className="panel overview-span-two">
          <div className="panel-header"><h2>{t("project.details")}</h2><div className="inline-actions">{editingDetails ? <><Button size="small" variant="ghost" onClick={cancelDetails}><X size={14} />{t("common.cancel")}</Button><Button size="small" disabled={!detailsValid} onClick={saveDetails}><Check size={14} />{t("common.save")}</Button></> : <Button size="small" variant="secondary" onClick={() => setEditingDetails(true)}><Pencil size={14} />{t("common.edit")}</Button>}</div></div>
          {!detailsValid && editingDetails && <div className="form-error overview-form-error">{t("overview.keyError")}</div>}
          <div className="panel-body details-grid">
            <DetailField editing={editingDetails} label={t("project.number")} value={draft.projectNumber} onChange={(value) => updateDraft("projectNumber", value)} />
            <DetailField editing={editingDetails} label={t("project.name")} value={draft.name} onChange={(value) => updateDraft("name", value)} />
            <DetailField editing={editingDetails} label={t("project.type")} value={editingDetails ? draft.constructionType : t(`project.type.${draft.constructionType}`)} onChange={(value) => updateDraft("constructionType", value as Project["constructionType"])} selectOptions={["new_build", "renovation", "demolition"].map((value) => ({ value, label: t(`project.type.${value}`) }))} />
            <DetailField editing={editingDetails} label={t("project.documentLanguage")} value={editingDetails ? draft.documentLocale : t(`common.language.${draft.documentLocale}`)} onChange={(value) => updateDraft("documentLocale", value as Project["documentLocale"])} selectOptions={[{ value: "de", label: t("common.language.de") }, { value: "en", label: t("common.language.en") }]} />
            <DetailField editing={editingDetails} label={t("project.start")} value={editingDetails ? draft.startDate : formatDate(draft.startDate)} type="date" icon={<CalendarDays size={13} />} onChange={(value) => updateDraft("startDate", value)} />
            <DetailField editing={editingDetails} label={t("project.end")} value={editingDetails ? draft.endDate : formatDate(draft.endDate)} type="date" icon={<CalendarDays size={13} />} onChange={(value) => updateDraft("endDate", value)} />
            <DetailField editing={editingDetails} label={t("project.address")} value={draft.address} icon={<MapPin size={13} />} onChange={(value) => updateDraft("address", value)} />
            <DetailField editing={editingDetails} label={t("project.city")} value={draft.city} onChange={(value) => updateDraft("city", value)} />
            <DetailField editing={editingDetails} label={t("project.description")} value={draft.description} onChange={(value) => updateDraft("description", value)} textarea />
            {draft.customFields.map((field, index) => <div className="detail-item custom-detail-row" key={field.id}>{editingDetails ? <><input required aria-label={t("overview.fieldKey")} value={field.key} onChange={(event) => updateField(field.id, { key: event.target.value })} placeholder={t("overview.fieldKey")} /><input aria-label={t("overview.fieldValue")} value={field.value} onChange={(event) => updateField(field.id, { value: event.target.value })} placeholder={t("overview.fieldValue")} /><button className="icon-button" onClick={() => moveCustomField(index, -1)} disabled={index === 0} aria-label={t("common.moveUp")}><ArrowUp size={14} /></button><button className="icon-button" onClick={() => moveCustomField(index, 1)} disabled={index === draft.customFields.length - 1} aria-label={t("common.moveDown")}><ArrowDown size={14} /></button><button className="icon-button" onClick={() => updateDraft("customFields", draft.customFields.filter((candidate) => candidate.id !== field.id))} aria-label={t("common.deletePermanently")}><Trash2 size={14} /></button><button className="field-placeholder copy-token" onClick={() => void navigator.clipboard.writeText(`{{INS qs.overview.${field.placeholderKey}}}`)}><code>{`{{INS qs.overview.${field.placeholderKey}}}`}</code><Copy size={12} /></button></> : <><label>{field.key}</label><p>{field.value || "—"}</p></>}</div>)}
            {editingDetails && <button className="add-inline-field" onClick={addField}><Plus size={14} />{t("overview.addField")}</button>}
          </div>
        </section>

        <EntitySection title={t("project.emergency")} addLabel={t("overview.addContact")} onAdd={() => openEmergency()} addIcon={<PhoneCall size={14} />}>
          {project.emergencyContacts.map((contact) => <EntityRow key={contact.id} title={contact.label} lines={[contact.name, contact.phone]} editLabel={t("common.edit")} deleteLabel={t("common.deletePermanently")} onEdit={() => openEmergency(contact)} onDelete={() => { if (window.confirm(t("common.confirmDelete"))) updateProject({ ...project, emergencyContacts: project.emergencyContacts.filter((entry) => entry.id !== contact.id) }); }} icon={<PhoneCall size={15} />} />)}
        </EntitySection>
        <EntitySection title={t("project.participants")} addLabel={t("overview.addParticipant")} onAdd={() => openParticipant()} addIcon={<UserRoundPlus size={14} />}>
          {project.participants.map((entry) => <EntityRow key={entry.id} title={entry.name} lines={[`${entry.company} · ${t(`participant.role.${entry.role}`)}`, [entry.phone, entry.email].filter(Boolean).join(" · ")]} editLabel={t("common.edit")} deleteLabel={t("common.deletePermanently")} onEdit={() => openParticipant(entry)} onDelete={() => { if (window.confirm(t("common.confirmDelete"))) updateProject({ ...project, participants: project.participants.filter((candidate) => candidate.id !== entry.id) }); }} />)}
        </EntitySection>

        {project.customSections.map((section, index) => <CustomSectionCard key={section.id} section={section} onChange={updateSection} onMoveUp={() => moveSection(index, -1)} onMoveDown={() => moveSection(index, 1)} canMoveUp={index > 0} canMoveDown={index < project.customSections.length - 1} onDelete={() => { if (window.confirm(t("common.confirmDelete"))) updateProject({ ...project, customSections: project.customSections.filter((candidate) => candidate.id !== section.id) }); }} t={t} />)}
        {project.overviewSections.map((section) => <OverviewSectionCard key={section.id} section={section} onChange={(nextSection) => updateProject({ ...project, overviewSections: project.overviewSections.map((candidate) => candidate.id === nextSection.id ? nextSection : candidate) })} onDelete={() => { if (window.confirm(t("common.confirmDelete"))) updateProject({ ...project, overviewSections: project.overviewSections.filter((candidate) => candidate.id !== section.id) }); }} t={t} formatDate={formatDate} />)}
      </div>

      <Modal open={participantOpen} title={editingParticipantId ? t("overview.editParticipant") : t("overview.addParticipant")} onClose={() => setParticipantOpen(false)}>
        <form onSubmit={saveParticipant}><div className="modal-body form-grid">
          <label className="field"><span>{t("participant.role")}</span><select value={participant.role} onChange={(event) => setParticipant((current) => ({ ...current, role: event.target.value as Participant["role"] }))}>{participantRoles.map((role) => <option key={role} value={role}>{t(`participant.role.${role}`)}</option>)}</select></label>
          <label className="field"><span>{t("participant.company")}</span><input required value={participant.company} onChange={(event) => setParticipant((current) => ({ ...current, company: event.target.value }))} /></label>
          <label className="field"><span>{t("participant.name")}</span><input required value={participant.name} onChange={(event) => setParticipant((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="field"><span>{t("participant.email")}</span><input type="email" value={participant.email} onChange={(event) => setParticipant((current) => ({ ...current, email: event.target.value }))} /></label>
          <label className="field span-two"><span>{t("participant.phone")}</span><input value={participant.phone} onChange={(event) => setParticipant((current) => ({ ...current, phone: event.target.value }))} /></label>
        </div><ModalFooter close={() => setParticipantOpen(false)} t={t} /></form>
      </Modal>
      <Modal open={emergencyOpen} title={editingEmergencyId ? t("overview.editContact") : t("overview.addContact")} onClose={() => setEmergencyOpen(false)}>
        <form onSubmit={saveEmergency}><div className="modal-body form-grid">
          <label className="field"><span>{t("emergency.label")}</span><input required value={emergencyContact.label} onChange={(event) => setEmergencyContact((current) => ({ ...current, label: event.target.value }))} /></label>
          <label className="field"><span>{t("emergency.name")}</span><input value={emergencyContact.name} onChange={(event) => setEmergencyContact((current) => ({ ...current, name: event.target.value }))} /></label>
          <label className="field span-two"><span>{t("emergency.phone")}</span><input value={emergencyContact.phone} onChange={(event) => setEmergencyContact((current) => ({ ...current, phone: event.target.value }))} /></label>
        </div><ModalFooter close={() => setEmergencyOpen(false)} t={t} /></form>
      </Modal>
      <Modal open={sectionOpen} title={t("overview.addSection")} onClose={() => setSectionOpen(false)}><form onSubmit={addSection}><div className="modal-body"><label className="field"><span>{t("overview.sectionTitle")}</span><input required value={sectionTitle} onChange={(event) => setSectionTitle(event.target.value)} /></label></div><ModalFooter close={() => setSectionOpen(false)} t={t} /></form></Modal>
      <Modal open={templateOpen} title={t("overview.applyTemplate")} onClose={() => setTemplateOpen(false)}><div className="modal-body"><p className="page-description">{t("overview.applyTemplateText")}</p><div className="template-picker-preview">{database.overviewTemplates.filter((template) => !project.overviewSections.some((section) => section.templateId === template.id || section.placeholderKey === normalizeOverviewKey(template.name, "template"))).map((template) => <label key={template.id}><input type="checkbox" checked={templateIds.includes(template.id)} onChange={(event) => setTemplateIds((current) => event.target.checked ? [...current, template.id] : current.filter((id) => id !== template.id))} /><span><strong>{template.name}</strong><small>{countOverviewEntries(template.entries)} {t("overview.entries")}</small></span></label>)}</div>{database.overviewTemplates.every((template) => project.overviewSections.some((section) => section.templateId === template.id || section.placeholderKey === normalizeOverviewKey(template.name, "template"))) && <p className="template-empty">{t("overview.allTemplatesApplied")}</p>}</div><div className="modal-footer"><Button variant="secondary" onClick={() => setTemplateOpen(false)}>{t("common.cancel")}</Button><Button disabled={!templateIds.length} onClick={() => { applyOverviewTemplates(project.id, templateIds); setTemplateIds([]); setTemplateOpen(false); }}>{t("overview.applySelected")}</Button></div></Modal>
    </div>
  );
}

function updateProjectOverviewEntry(entries: ProjectOverviewEntry[], entryId: string, update: (entry: ProjectOverviewEntry) => ProjectOverviewEntry): ProjectOverviewEntry[] {
  return entries.map((entry) => {
    const nestedEntry = {
      ...entry,
      children: updateProjectOverviewEntry(entry.children, entryId, update),
      items: entry.items.map((item) => updateProjectOverviewEntry(item, entryId, update)),
    };
    return entry.id === entryId ? update(nestedEntry) : nestedEntry;
  });
}

function OverviewSectionCard({ section, onChange, onDelete, t, formatDate }: {
  section: ProjectOverviewSection;
  onChange: (section: ProjectOverviewSection) => void;
  onDelete: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatDate: (value: string) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => structuredClone(section));
  useEffect(() => { if (!editing) setDraft(structuredClone(section)); }, [editing, section]);
  const updateEntry = (entryId: string, update: (entry: ProjectOverviewEntry) => ProjectOverviewEntry) => setDraft((current) => ({ ...current, entries: updateProjectOverviewEntry(current.entries, entryId, update) }));

  return <section className="panel overview-template-section overview-span-two">
    <div className="panel-header"><div><h2>{section.name}</h2><span className="panel-kicker">{countProjectOverviewValues(section.entries)} {t("overview.entries")}</span></div><div className="row-actions">{editing ? <><Button size="small" variant="ghost" onClick={() => { setDraft(structuredClone(section)); setEditing(false); }}><X size={14} />{t("common.cancel")}</Button><Button size="small" onClick={() => { onChange(draft); setEditing(false); }}><Check size={14} />{t("common.save")}</Button></> : <Button size="small" variant="secondary" onClick={() => setEditing(true)}><Pencil size={14} />{t("common.edit")}</Button>}<button type="button" className="icon-button danger-icon" onClick={onDelete} aria-label={t("common.deletePermanently")}><Trash2 size={14} /></button></div></div>
    <div className="panel-body overview-template-values">{draft.entries.map((entry) => <ProjectOverviewEntryView key={entry.id} entry={entry} editing={editing} onUpdate={updateEntry} t={t} formatDate={formatDate} />)}</div>
  </section>;
}

function countProjectOverviewValues(entries: ProjectOverviewEntry[]): number {
  return entries.reduce((total, entry) => {
    if (entry.type === "repeating_group") return total + 1 + entry.items.reduce((itemTotal, item) => itemTotal + countProjectOverviewValues(item), 0);
    return total + 1 + countProjectOverviewValues(entry.children);
  }, 0);
}

function ProjectOverviewEntryView({ entry, editing, onUpdate, t, formatDate }: {
  entry: ProjectOverviewEntry;
  editing: boolean;
  onUpdate: (entryId: string, update: (entry: ProjectOverviewEntry) => ProjectOverviewEntry) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  formatDate: (value: string) => string;
}) {
  if (entry.type === "text" || entry.type === "date") return <div className="detail-item overview-template-value"><label>{entry.label}</label>{editing ? <input aria-label={entry.label} type={entry.type === "date" ? "date" : "text"} value={entry.value} onChange={(event) => onUpdate(entry.id, (candidate) => ({ ...candidate, value: event.target.value }))} /> : <p>{entry.type === "date" && entry.value ? formatDate(entry.value) : entry.value || "—"}</p>}</div>;
  if (entry.type === "group") return <section className="overview-value-group"><h3>{entry.label}</h3><div className="overview-value-grid">{entry.children.map((child) => <ProjectOverviewEntryView key={child.id} entry={child} editing={editing} onUpdate={onUpdate} t={t} formatDate={formatDate} />)}</div></section>;
  return <section className="overview-value-group overview-repeat-group"><div className="overview-value-group-header"><h3>{entry.label}</h3>{editing && <Button size="small" variant="secondary" onClick={() => onUpdate(entry.id, (candidate) => ({ ...candidate, items: [...candidate.items, instantiateRepeatingItem(candidate, newId)] }))}><Plus size={13} />{t("overview.addRecord")}</Button>}</div><div className="overview-repeat-items">{entry.items.map((item, index) => <article className="overview-repeat-item" key={`${entry.id}-${index}`}><div className="overview-repeat-item-header"><strong>{t("overview.record", { index: index + 1 })}</strong>{editing && <button type="button" className="icon-button danger-icon" aria-label={t("overview.removeRecord")} onClick={() => onUpdate(entry.id, (candidate) => ({ ...candidate, items: candidate.items.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={14} /></button>}</div><div className="overview-value-grid">{item.map((child) => <ProjectOverviewEntryView key={child.id} entry={child} editing={editing} onUpdate={onUpdate} t={t} formatDate={formatDate} />)}</div></article>)}</div></section>;
}

function DetailField({ editing, label, value, onChange, type = "text", textarea, icon, selectOptions }: { editing: boolean; label: string; value: string; onChange: (value: string) => void; type?: string; textarea?: boolean; icon?: React.ReactNode; selectOptions?: Array<{ value: string; label: string }> }) {
  return <div className={`detail-item ${textarea ? "detail-span-two" : ""}`}><label>{label}</label>{editing ? selectOptions ? <select value={value} onChange={(event) => onChange(event.target.value)}>{selectOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : textarea ? <textarea value={value} onChange={(event) => onChange(event.target.value)} /> : <input type={type} value={value} onChange={(event) => onChange(event.target.value)} /> : <p>{icon}{value || "—"}</p>}</div>;
}

function EntitySection({ title, addLabel, onAdd, addIcon, children }: { title: string; addLabel: string; onAdd: () => void; addIcon: React.ReactNode; children: React.ReactNode }) {
  return <section className="panel"><div className="panel-header"><h2>{title}</h2><Button size="small" variant="secondary" onClick={onAdd}>{addIcon}{addLabel}</Button></div><div className="panel-body participant-list">{Children.count(children) ? children : <button className="add-inline-field" onClick={onAdd}>{addIcon}{addLabel}</button>}</div></section>;
}

function EntityRow({ title, lines, onEdit, onDelete, editLabel, deleteLabel, icon }: { title: string; lines: string[]; onEdit: () => void; onDelete: () => void; editLabel: string; deleteLabel: string; icon?: React.ReactNode }) {
  return <div className="participant editable-row"><span className="participant-avatar">{icon ?? title.slice(0, 1).toUpperCase()}</span><span><strong>{title}</strong>{lines.filter(Boolean).map((line) => <span key={line}>{line}</span>)}</span><div className="row-actions"><button className="icon-button" onClick={onEdit} aria-label={`${editLabel}: ${title}`}><Pencil size={14} /></button><button className="icon-button danger-icon" onClick={onDelete} aria-label={`${deleteLabel}: ${title}`}><Trash2 size={14} /></button></div></div>;
}

function CustomSectionCard({ section, onChange, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown, t }: { section: CustomSection; onChange: (section: CustomSection) => void; onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void; canMoveUp: boolean; canMoveDown: boolean; t: (key: string) => string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(section);
  const addField = () => setDraft((current) => ({ ...current, fields: [...current.fields, { id: newId("field"), key: "", value: "", placeholderKey: `field_${current.fields.length + 1}` }] }));
  const fieldKeys = draft.fields.map((field) => field.placeholderKey);
  const valid = draft.title.trim().length > 0 && draft.fields.every((field) => field.key.trim().length > 0) && new Set(fieldKeys).size === fieldKeys.length;
  const moveField = (index: number, direction: -1 | 1) => setDraft((current) => {
    const target = index + direction; if (target < 0 || target >= current.fields.length) return current;
    const fields = [...current.fields]; [fields[index], fields[target]] = [fields[target], fields[index]]; return { ...current, fields };
  });
  return (
    <section className="panel">
      <div className="panel-header">
        {editing ? <input required value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /> : <h2>{section.title}</h2>}
        <div className="row-actions">
          <button className="icon-button" onClick={onMoveUp} disabled={!canMoveUp} aria-label={t("common.moveUp")}><ArrowUp size={14} /></button>
          <button className="icon-button" onClick={onMoveDown} disabled={!canMoveDown} aria-label={t("common.moveDown")}><ArrowDown size={14} /></button>
          {editing ? <>
            <button className="icon-button" onClick={() => { setDraft(section); setEditing(false); }} aria-label={t("common.cancel")}><X size={14} /></button>
            <button className="icon-button" disabled={!valid} onClick={() => { if (!valid) return; onChange(draft); setEditing(false); }} aria-label={t("common.save")}><Check size={14} /></button>
          </> : <button className="icon-button" onClick={() => setEditing(true)} aria-label={t("common.edit")}><Pencil size={14} /></button>}
          <button className="icon-button danger-icon" onClick={onDelete} aria-label={t("common.deletePermanently")}><Trash2 size={14} /></button>
        </div>
      </div>
      {editing && !valid && <div className="form-error overview-form-error">{t("overview.keyError")}</div>}
      <div className="panel-body custom-section-fields">
        {draft.fields.map((field, index) => editing ? (
          <div className="custom-field-edit" key={field.id}>
            <input required aria-label={t("overview.fieldKey")} value={field.key} placeholder={t("overview.fieldKey")} onChange={(event) => setDraft((current) => ({ ...current, fields: current.fields.map((candidate) => candidate.id === field.id ? { ...candidate, key: event.target.value } : candidate) }))} />
            <input aria-label={t("overview.fieldValue")} value={field.value} placeholder={t("overview.fieldValue")} onChange={(event) => setDraft((current) => ({ ...current, fields: current.fields.map((candidate) => candidate.id === field.id ? { ...candidate, value: event.target.value } : candidate) }))} />
            <button className="icon-button" onClick={() => moveField(index, -1)} disabled={index === 0} aria-label={t("common.moveUp")}><ArrowUp size={14} /></button>
            <button className="icon-button" onClick={() => moveField(index, 1)} disabled={index === draft.fields.length - 1} aria-label={t("common.moveDown")}><ArrowDown size={14} /></button>
            <button className="icon-button" onClick={() => setDraft((current) => ({ ...current, fields: current.fields.filter((candidate) => candidate.id !== field.id) }))} aria-label={t("common.deletePermanently")}><Trash2 size={14} /></button>
            <button className="field-placeholder copy-token" onClick={() => void navigator.clipboard.writeText(`{{INS qs.overview.${draft.placeholderKey}.${field.placeholderKey}}}`)}><code>{`{{INS qs.overview.${draft.placeholderKey}.${field.placeholderKey}}}`}</code><Copy size={12} /></button>
          </div>
        ) : <div className="detail-item" key={field.id}><label>{field.key}</label><p>{field.value || "—"}</p></div>)}
        {editing && <button className="add-inline-field" onClick={addField}><Plus size={14} />{t("overview.addField")}</button>}
      </div>
    </section>
  );
}

function ModalFooter({ close, t }: { close: () => void; t: (key: string) => string }) { return <div className="modal-footer"><Button type="button" variant="secondary" onClick={close}>{t("common.cancel")}</Button><Button type="submit">{t("common.save")}</Button></div>; }
