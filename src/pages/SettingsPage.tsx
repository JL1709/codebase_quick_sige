import { ArchiveRestore, Copy, Database, Download, FilePlus2, Languages, Pencil, Plus, RotateCcw, Save, Search, ShieldCheck, Trash2 } from "lucide-react";
import { type ChangeEvent, type FormEvent, useState } from "react";
import { Button, Modal, PageHeader } from "../components/Ui";
import { getBlob, saveBlob } from "../data/blobRepository";
import type { DocumentTemplate, DocumentType, Locale, OverviewTemplate, OverviewTemplateKind, Participant } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";

const documentTypes: DocumentType[] = ["site_rules", "alarm_plan", "fire_safety", "first_aid", "participants", "advance_notice", "a4_plan"];
const templateKinds: OverviewTemplateKind[] = ["project_details", "emergency_contacts", "participants", "custom_section"];
const participantRoles: Participant["role"][] = ["client", "owner", "coordinator", "architect", "planner", "site_manager", "contractor"];
const placeholderReference = [
  "{{INS qs.project.name}}", "{{INS qs.project.number}}", "{{INS qs.project.description}}", "{{INS qs.project.address}}",
  "{{INS qs.project.city}}", "{{INS qs.project.start_date}}", "{{INS qs.project.end_date}}",
  "{{INS qs.overview.your_field_key}}", "{{FOR contact IN qs.emergency_contacts}}", "{{INS $contact.label}}",
  "{{FOR participant IN qs.participants}}", "{{INS $participant.role_label}}", "{{FOR section IN qs.plan.sections}}",
  "{{FOR block IN qs.plan.blocks}}", "{{INS $block.code}}", "{{INS $block.category}}", "{{INS $block.title}}",
  "{{INS $block.a0_description}}", "{{INS $block.a4_description}}", "{{INS $block.regulations}}", "{{IMAGE $block.image}}",
  "{{INS $block.expert_note}}", "{{PAGEBREAK}}",
];

export function SettingsPage() {
  const {
    database, resetDemo, migrationRecovery, restoreMigrationBackup, downloadMigrationBackup,
    saveOverviewTemplate, duplicateOverviewTemplate, deleteOverviewTemplate, saveDocumentTemplate, deleteDocumentTemplate,
  } = useApp();
  const { locale, setLocale, t } = useI18n();
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [editingOverview, setEditingOverview] = useState<OverviewTemplate | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentTemplate | null>(null);
  const [placeholderQuery, setPlaceholderQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const openOverview = (template?: OverviewTemplate) => { setEditingOverview(template ?? null); setOverviewOpen(true); };
  const openDocument = (template?: DocumentTemplate) => { setEditingDocument(template ?? null); setDocumentOpen(true); };

  const removeDocumentTemplate = (template: DocumentTemplate) => {
    if (template.origin === "standard") return;
    deleteDocumentTemplate(template.id);
  };
  const duplicateDocumentTemplate = async (template: DocumentTemplate) => {
    const now = new Date().toISOString();
    const blobId = newId("blob");
    if (template.origin === "standard") {
      const { createStandardTemplate } = await import("../documents/templateEngine");
      await saveBlob(blobId, await createStandardTemplate(template.documentType, template.locale));
    } else if (template.blobId) {
      const blob = await getBlob(template.blobId); if (!blob) return; await saveBlob(blobId, blob);
    } else return;
    saveDocumentTemplate({ ...structuredClone(template), id: newId("document-template"), name: `${template.name} – Copy`, origin: "custom", blobId, lifecycle: "active", revision: 1, createdAt: now, updatedAt: now });
  };

  return <div className="page settings-page">
    <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />
    <div className="settings-grid">
      <section className="panel settings-card"><span className="stat-icon"><Languages size={18} /></span><h2>{t("settings.uiLanguage")}</h2><p>{t("settings.languageText")}</p><div className="language-options"><button className={`language-option ${locale === "de" ? "is-selected" : ""}`} onClick={() => setLocale("de")}><strong>Deutsch</strong><span>DE · Deutschland</span></button><button className={`language-option ${locale === "en" ? "is-selected" : ""}`} onClick={() => setLocale("en")}><strong>English</strong><span>EN · International</span></button></div></section>
      <section className="panel settings-card"><span className="stat-icon"><ShieldCheck size={18} /></span><h2>{t("settings.organization")}</h2><p><strong>{database.organization.name}</strong><br />{database.user.email}<br />{t("settings.role")}: {t(`user.role.${database.user.role}`)}</p></section>
    </div>

    <section className="settings-section">
      <div className="settings-section-header">
        <div><h2>{t("templates.overviewTitle")}</h2><p>{t("templates.overviewText")}</p></div>
        <div className="row-actions">
          <Button variant="secondary" onClick={() => setShowArchived((value) => !value)}><ArchiveRestore size={15} />{t("templates.archived")}</Button>
          <Button onClick={() => openOverview()}><Plus size={15} />{t("templates.addOverview")}</Button>
        </div>
      </div>
      <div className="template-list">
        {database.overviewTemplates.filter((template) => showArchived || template.lifecycle !== "archived").map((template) => (
          <article className="template-row" key={template.id}>
            <div><strong>{template.name}</strong><span>{t(`templates.kind.${template.kind}`)}{template.lifecycle === "archived" ? ` · ${t("common.archived")}` : ""}</span></div>
            <div className="row-actions">
              <Button size="small" variant="secondary" onClick={() => openOverview(template)}><Pencil size={14} />{t("common.edit")}</Button>
              <button className="icon-button" onClick={() => duplicateOverviewTemplate(template.id)} aria-label={t("common.duplicate")}><Copy size={14} /></button>
              {template.lifecycle === "archived"
                ? <button className="icon-button" onClick={() => saveOverviewTemplate({ ...template, lifecycle: "active", updatedAt: new Date().toISOString() })} aria-label={t("common.restore")}><ArchiveRestore size={14} /></button>
                : <button className="icon-button danger-icon" onClick={() => saveOverviewTemplate({ ...template, lifecycle: "archived", updatedAt: new Date().toISOString() })} aria-label={t("common.archive")}><Trash2 size={14} /></button>}
              <button className="icon-button danger-icon" onClick={() => { if (window.confirm(t("common.confirmDelete"))) deleteOverviewTemplate(template.id); }} aria-label={t("common.deletePermanently")}><Trash2 size={14} /></button>
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="settings-section"><div className="settings-section-header"><div><h2>{t("templates.wordTitle")}</h2><p>{t("templates.wordText")}</p></div><Button onClick={() => openDocument()}><FilePlus2 size={15} />{t("templates.uploadWord")}</Button></div><div className="template-list">{database.documentTemplates.filter((template) => showArchived || template.lifecycle !== "archived").map((template) => <article className="template-row" key={template.id}><div><strong>{template.name}</strong><span>{t(`documents.${template.documentType}`)} · {t(`common.language.${template.locale}`)} · {template.origin === "standard" ? t("templates.standard") : template.filename} · v{template.revision ?? 1}{template.lifecycle === "archived" ? ` · ${t("common.archived")}` : ""}</span></div><div className="row-actions"><Button size="small" variant="secondary" onClick={() => void import("../documents/templateEngine").then(async ({ createStandardTemplate, downloadBlob }) => { const blob = template.origin === "standard" ? await createStandardTemplate(template.documentType, template.locale) : template.blobId ? await getBlob(template.blobId) : undefined; if (blob) downloadBlob(blob, template.filename); })}><Download size={14} />{t("common.download")}</Button><button className="icon-button" onClick={() => void duplicateDocumentTemplate(template)} aria-label={t("common.duplicate")}><Copy size={14} /></button>{template.origin === "custom" && <><Button size="small" variant="secondary" onClick={() => openDocument(template)}><Pencil size={14} />{t("common.edit")}</Button>{template.lifecycle === "archived" ? <><button className="icon-button" onClick={() => saveDocumentTemplate({ ...template, lifecycle: "active", updatedAt: new Date().toISOString() })} aria-label={t("common.restore")}><ArchiveRestore size={14} /></button><button className="icon-button danger-icon" onClick={() => { if (window.confirm(t("common.confirmDelete"))) removeDocumentTemplate(template); }} aria-label={t("common.deletePermanently")}><Trash2 size={14} /></button></> : <button className="icon-button danger-icon" onClick={() => saveDocumentTemplate({ ...template, lifecycle: "archived", updatedAt: new Date().toISOString() })} aria-label={t("common.archive")}><Trash2 size={14} /></button>}</>}</div></article>)}</div></section>

    <section className="panel template-reference"><div><h2>{t("templates.placeholderTitle")}</h2><p>{t("templates.placeholderText")}</p><div className="search-shell"><Search size={15} /><input className="search-input" value={placeholderQuery} onChange={(event) => setPlaceholderQuery(event.target.value)} placeholder={t("templates.searchPlaceholders")} /></div></div><div className="placeholder-examples">{placeholderReference.filter((token) => token.toLowerCase().includes(placeholderQuery.toLowerCase())).map((token) => <button className="placeholder-copy" key={token} onClick={() => void navigator.clipboard.writeText(token)}><code>{token}</code><Copy size={13} /></button>)}</div><p className="field-help">{t("templates.placeholderLocations")}</p></section>

    <section className="panel settings-card settings-storage"><span className="stat-icon"><Database size={18} /></span><h2>{t("settings.storage")}</h2><p>{t("settings.storageText")}</p>{migrationRecovery.error && <div className="form-error">{migrationRecovery.error}</div>}<div className="row-actions">{migrationRecovery.available && <><Button variant="secondary" onClick={downloadMigrationBackup}><Download size={15} />{t("settings.downloadBackup")}</Button><Button variant="secondary" onClick={restoreMigrationBackup}><ArchiveRestore size={15} />{t("settings.restoreBackup")}</Button></>}<Button variant="danger" onClick={() => { if (window.confirm(t("settings.resetConfirm"))) resetDemo(); }}><RotateCcw size={15} />{t("common.resetWorkspace")}</Button></div></section>

    <OverviewTemplateModal key={`overview-${editingOverview?.id ?? "new"}-${overviewOpen}`} open={overviewOpen} template={editingOverview} organizationId={database.organization.id} onClose={() => setOverviewOpen(false)} onSave={(template) => { saveOverviewTemplate(template); setOverviewOpen(false); }} t={t} />
    <DocumentTemplateModal key={`document-${editingDocument?.id ?? "new"}-${documentOpen}`} open={documentOpen} template={editingDocument} organizationId={database.organization.id} onClose={() => setDocumentOpen(false)} onSave={(template) => { saveDocumentTemplate(template); setDocumentOpen(false); }} t={t} />
  </div>;
}

function blankOverviewTemplate(organizationId: string): OverviewTemplate {
  const now = new Date().toISOString();
  return { id: newId("overview-template"), organizationId, name: "", kind: "project_details", fields: [], emergencyContacts: [], participants: [], createdAt: now, updatedAt: now };
}

function OverviewTemplateModal({ open, template, organizationId, onClose, onSave, t }: { open: boolean; template: OverviewTemplate | null; organizationId: string; onClose: () => void; onSave: (template: OverviewTemplate) => void; t: (key: string) => string }) {
  const [draft, setDraft] = useState(() => template ? structuredClone(template) : blankOverviewTemplate(organizationId));
  const placeholderKeys = draft.fields.map((field) => field.placeholderKey);
  const fieldsValid = draft.fields.every((field) => field.key.trim().length > 0) && new Set(placeholderKeys).size === placeholderKeys.length;
  const addEntry = () => {
    if (draft.kind === "emergency_contacts") setDraft({ ...draft, emergencyContacts: [...draft.emergencyContacts, { id: newId("emergency"), label: "", name: "", phone: "" }] });
    else if (draft.kind === "participants") setDraft({ ...draft, participants: [...draft.participants, { id: newId("participant"), role: "coordinator", company: "", name: "", email: "", phone: "" }] });
    else setDraft({ ...draft, fields: [...draft.fields, { id: newId("field"), key: "", value: "", placeholderKey: `field_${draft.fields.length + 1}` }] });
  };
  const handleSubmit = (event: FormEvent) => { event.preventDefault(); if (!fieldsValid) return; onSave({ ...draft, updatedAt: new Date().toISOString() }); };
  return <Modal open={open} title={template ? t("templates.editOverview") : t("templates.addOverview")} onClose={onClose}><form onSubmit={handleSubmit}><div className="modal-body template-form">{!fieldsValid && <div className="form-error">{t("overview.keyError")}</div>}<div className="form-grid"><label className="field"><span>{t("templates.name")}</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="field"><span>{t("templates.kind")}</span><select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as OverviewTemplateKind })}>{templateKinds.map((kind) => <option key={kind} value={kind}>{t(`templates.kind.${kind}`)}</option>)}</select></label>{draft.kind === "custom_section" && <label className="field span-two"><span>{t("overview.sectionTitle")}</span><input required value={draft.title ?? ""} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>}</div><div className="template-entry-list">{draft.kind === "emergency_contacts" ? draft.emergencyContacts.map((entry) => <div className="template-entry" key={entry.id}><input required placeholder={t("emergency.label")} value={entry.label} onChange={(event) => setDraft({ ...draft, emergencyContacts: draft.emergencyContacts.map((candidate) => candidate.id === entry.id ? { ...candidate, label: event.target.value } : candidate) })} /><input placeholder={t("emergency.name")} value={entry.name} onChange={(event) => setDraft({ ...draft, emergencyContacts: draft.emergencyContacts.map((candidate) => candidate.id === entry.id ? { ...candidate, name: event.target.value } : candidate) })} /><input placeholder={t("emergency.phone")} value={entry.phone} onChange={(event) => setDraft({ ...draft, emergencyContacts: draft.emergencyContacts.map((candidate) => candidate.id === entry.id ? { ...candidate, phone: event.target.value } : candidate) })} /><button type="button" className="icon-button" onClick={() => setDraft({ ...draft, emergencyContacts: draft.emergencyContacts.filter((candidate) => candidate.id !== entry.id) })}><Trash2 size={14} /></button></div>) : draft.kind === "participants" ? draft.participants.map((entry) => <div className="template-entry" key={entry.id}><select value={entry.role} onChange={(event) => setDraft({ ...draft, participants: draft.participants.map((candidate) => candidate.id === entry.id ? { ...candidate, role: event.target.value as Participant["role"] } : candidate) })}>{participantRoles.map((role) => <option value={role} key={role}>{t(`participant.role.${role}`)}</option>)}</select><input required placeholder={t("participant.name")} value={entry.name} onChange={(event) => setDraft({ ...draft, participants: draft.participants.map((candidate) => candidate.id === entry.id ? { ...candidate, name: event.target.value } : candidate) })} /><input placeholder={t("participant.company")} value={entry.company} onChange={(event) => setDraft({ ...draft, participants: draft.participants.map((candidate) => candidate.id === entry.id ? { ...candidate, company: event.target.value } : candidate) })} /><button type="button" className="icon-button" onClick={() => setDraft({ ...draft, participants: draft.participants.filter((candidate) => candidate.id !== entry.id) })}><Trash2 size={14} /></button></div>) : draft.fields.map((field) => <div className="template-entry" key={field.id}><input required placeholder={t("overview.fieldKey")} value={field.key} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((candidate) => candidate.id === field.id ? { ...candidate, key: event.target.value } : candidate) })} /><input placeholder={t("overview.fieldValue")} value={field.value} onChange={(event) => setDraft({ ...draft, fields: draft.fields.map((candidate) => candidate.id === field.id ? { ...candidate, value: event.target.value } : candidate) })} /><code>{field.placeholderKey}</code><button type="button" className="icon-button" onClick={() => setDraft({ ...draft, fields: draft.fields.filter((candidate) => candidate.id !== field.id) })}><Trash2 size={14} /></button></div>)}</div><Button type="button" variant="secondary" onClick={addEntry}><Plus size={14} />{t("templates.addEntry")}</Button></div><div className="modal-footer"><Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" disabled={!fieldsValid}><Save size={14} />{t("common.save")}</Button></div></form></Modal>;
}

function DocumentTemplateModal({ open, template, organizationId, onClose, onSave, t }: { open: boolean; template: DocumentTemplate | null; organizationId: string; onClose: () => void; onSave: (template: DocumentTemplate) => void; t: (key: string) => string }) {
  const now = new Date().toISOString();
  const [draft, setDraft] = useState<DocumentTemplate>(() => template ? structuredClone(template) : { id: newId("document-template"), organizationId, name: "", documentType: "a4_plan", locale: "de", origin: "custom", filename: "", description: "", createdAt: now, updatedAt: now });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; if (selected) { setFile(selected); setDraft((current) => ({ ...current, filename: selected.name })); } };
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setValidating(true);
    if (!template && !file) { setError(t("templates.fileRequired")); setValidating(false); return; }
    if (file && !file.name.toLowerCase().endsWith(".docx")) { setError(t("templates.docxOnly")); setValidating(false); return; }
    try {
      let blobId = draft.blobId;
      let validation = draft.validation;
      if (file) {
        const { validateTemplateFile } = await import("../documents/templateEngine");
        const result = await validateTemplateFile(await file.arrayBuffer(), file.name, file.type);
        if (!result.valid) { setError(result.errors.join(" ")); return; }
        blobId = newId("blob");
        await saveBlob(blobId, file);
        validation = { status: "valid", checkedAt: new Date().toISOString(), placeholders: result.placeholders, messages: result.warnings };
      }
      onSave({ ...draft, blobId, validation, lifecycle: "active", filename: file?.name ?? draft.filename, updatedAt: new Date().toISOString() });
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : t("templates.validationFailed"));
    } finally { setValidating(false); }
  };
  return <Modal open={open} title={template ? t("templates.editWord") : t("templates.uploadWord")} onClose={onClose}><form onSubmit={(event) => void handleSubmit(event)}><div className="modal-body form-grid">{error && <div className="form-error span-two">{error}</div>}<label className="field"><span>{t("templates.name")}</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="field"><span>{t("templates.documentType")}</span><select value={draft.documentType} onChange={(event) => setDraft({ ...draft, documentType: event.target.value as DocumentType })}>{documentTypes.map((type) => <option key={type} value={type}>{t(`documents.${type}`)}</option>)}</select></label><label className="field"><span>{t("project.documentLanguage")}</span><select value={draft.locale} onChange={(event) => setDraft({ ...draft, locale: event.target.value as Locale })}><option value="de">Deutsch</option><option value="en">English</option></select></label><label className="field"><span>{t("templates.wordFile")}</span><input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFile} /><small>{file?.name ?? draft.filename}</small></label><label className="field span-two"><span>{t("templates.description")}</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><div className="template-security span-two">{t("templates.securityNote")}</div></div><div className="modal-footer"><Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" disabled={validating}>{validating ? t("templates.validating") : t("common.save")}</Button></div></form></Modal>;
}
