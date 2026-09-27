import { DndContext, PointerSensor, pointerWithin, type DragEndEvent, type DragOverEvent, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArchiveRestore, Copy, Database, Download, FilePlus2, GripVertical, Languages, MoreVertical, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { type ChangeEvent, type CSSProperties, type FormEvent, useMemo, useState } from "react";
import { Button, Modal, PageHeader } from "../components/Ui";
import { getBlob, saveBlob } from "../data/blobRepository";
import {
  countOverviewEntries,
  moveOverviewEntry,
  overviewEntryClipboardValue,
  overviewEntryPath,
  validateOverviewTemplate,
  type OverviewDropPosition,
} from "../domain/overviewTemplates";
import type { DocumentTemplate, DocumentType, Locale, OverviewEntryType, OverviewTemplate, OverviewTemplateEntry } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";

const documentTypes: DocumentType[] = ["site_rules", "alarm_plan", "fire_safety", "first_aid", "participants", "advance_notice", "a4_plan"];
const overviewEntryTypes: OverviewEntryType[] = ["text", "date", "group", "repeating_group"];
const placeholderReference = [
  "{{INS qs.project.name}}", "{{INS qs.project.number}}", "{{INS qs.project.description}}", "{{INS qs.project.address}}",
  "{{INS qs.project.city}}", "{{INS qs.project.start_date}}", "{{INS qs.project.end_date}}",
  "{{INS qs.overview.your_template.your_field}}", "{{FOR contact IN qs.emergency_contacts}}", "{{INS $contact.label}}",
  "{{FOR participant IN qs.participants}}", "{{INS $participant.role_label}}", "{{FOR section IN qs.plan.sections}}",
  "{{FOR block IN qs.plan.blocks}}", "{{INS $block.category}}", "{{INS $block.title}}",
  "{{INS $block.a0_description}}", "{{INS $block.a4_description}}", "{{INS $block.regulations}}", "{{IMAGE $block.image}}",
  "{{INS $block.expert_note}}", "{{PAGEBREAK}}",
];

export function SettingsPage() {
  const { database, resetDemo, migrationRecovery, restoreMigrationBackup, downloadMigrationBackup } = useApp();
  const { locale, setLocale, t } = useI18n();

  return <div className="page settings-page">
    <PageHeader title={t("settings.title")} description={t("settings.subtitle")} />
    <div className="settings-grid">
      <section className="panel settings-card"><span className="stat-icon"><Languages size={18} /></span><h2>{t("settings.uiLanguage")}</h2><p>{t("settings.languageText")}</p><div className="language-options"><button className={`language-option ${locale === "de" ? "is-selected" : ""}`} onClick={() => setLocale("de")}><strong>Deutsch</strong><span>DE · Deutschland</span></button><button className={`language-option ${locale === "en" ? "is-selected" : ""}`} onClick={() => setLocale("en")}><strong>English</strong><span>EN · International</span></button></div></section>
      <section className="panel settings-card"><span className="stat-icon"><ShieldCheck size={18} /></span><h2>{t("settings.organization")}</h2><p><strong>{database.organization.name}</strong><br />{database.user.email}<br />{t("settings.role")}: {t(`user.role.${database.user.role}`)}</p></section>
    </div>
    <section className="panel settings-card settings-storage"><span className="stat-icon"><Database size={18} /></span><h2>{t("settings.storage")}</h2><p>{t("settings.storageText")}</p>{migrationRecovery.error && <div className="form-error">{migrationRecovery.error}</div>}<div className="row-actions">{migrationRecovery.available && <><Button variant="secondary" onClick={downloadMigrationBackup}><Download size={15} />{t("settings.downloadBackup")}</Button><Button variant="secondary" onClick={restoreMigrationBackup}><ArchiveRestore size={15} />{t("settings.restoreBackup")}</Button></>}<Button variant="danger" onClick={() => { if (window.confirm(t("settings.resetConfirm"))) resetDemo(); }}><RotateCcw size={15} />{t("common.resetWorkspace")}</Button></div></section>
  </div>;
}

export function TemplatesPage() {
  const {
    database,
    saveOverviewTemplate, deleteOverviewTemplate, saveDocumentTemplate, deleteDocumentTemplate,
  } = useApp();
  const { t } = useI18n();
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [editingOverview, setEditingOverview] = useState<OverviewTemplate | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentTemplate | null>(null);
  const [placeholderQuery, setPlaceholderQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [overviewToDelete, setOverviewToDelete] = useState<OverviewTemplate | null>(null);
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
    <PageHeader title={t("templates.pageTitle")} description={t("templates.pageSubtitle")} />

    <section className="settings-section">
      <div className="settings-section-header">
        <div><h2>{t("templates.overviewTitle")}</h2><p>{t("templates.overviewText")}</p></div>
        <Button onClick={() => openOverview()}><Plus size={15} />{t("templates.addOverview")}</Button>
      </div>
      <div className="template-list">
        {database.overviewTemplates.map((template) => (
          <article className="template-row" key={template.id}>
            <div><strong>{template.name}</strong><span>{countOverviewEntries(template.entries)} {t("overview.entries")}</span></div>
            <div className="row-actions">
              <Button size="small" variant="secondary" onClick={() => openOverview(template)}><Pencil size={14} />{t("common.edit")}</Button>
              <button className="icon-button danger-icon" onClick={() => setOverviewToDelete(template)} aria-label={`${t("common.deletePermanently")}: ${template.name}`}><Trash2 size={14} /></button>
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="settings-section"><div className="settings-section-header"><div><h2>{t("templates.wordTitle")}</h2><p>{t("templates.wordText")}</p></div><div className="row-actions"><Button variant="secondary" onClick={() => setShowArchived((value) => !value)}><ArchiveRestore size={15} />{t("templates.archived")}</Button><Button onClick={() => openDocument()}><FilePlus2 size={15} />{t("templates.uploadWord")}</Button></div></div><div className="template-list">{database.documentTemplates.filter((template) => showArchived || template.lifecycle !== "archived").map((template) => <article className="template-row" key={template.id}><div><strong>{template.name}</strong><span>{t(`documents.${template.documentType}`)} · {t(`common.language.${template.locale}`)} · {template.origin === "standard" ? t("templates.standard") : template.filename} · v{template.revision ?? 1}{template.lifecycle === "archived" ? ` · ${t("common.archived")}` : ""}</span></div><div className="row-actions"><Button size="small" variant="secondary" onClick={() => void import("../documents/templateEngine").then(async ({ createStandardTemplate, downloadBlob }) => { const blob = template.origin === "standard" ? await createStandardTemplate(template.documentType, template.locale) : template.blobId ? await getBlob(template.blobId) : undefined; if (blob) downloadBlob(blob, template.filename); })}><Download size={14} />{t("common.download")}</Button><button className="icon-button" onClick={() => void duplicateDocumentTemplate(template)} aria-label={t("common.duplicate")}><Copy size={14} /></button>{template.origin === "custom" && <><Button size="small" variant="secondary" onClick={() => openDocument(template)}><Pencil size={14} />{t("common.edit")}</Button>{template.lifecycle === "archived" ? <><button className="icon-button" onClick={() => saveDocumentTemplate({ ...template, lifecycle: "active", updatedAt: new Date().toISOString() })} aria-label={t("common.restore")}><ArchiveRestore size={14} /></button><button className="icon-button danger-icon" onClick={() => { if (window.confirm(t("common.confirmDelete"))) removeDocumentTemplate(template); }} aria-label={t("common.deletePermanently")}><Trash2 size={14} /></button></> : <button className="icon-button danger-icon" onClick={() => saveDocumentTemplate({ ...template, lifecycle: "archived", updatedAt: new Date().toISOString() })} aria-label={t("common.archive")}><Trash2 size={14} /></button>}</>}</div></article>)}</div></section>

    <section className="panel template-reference"><div><h2>{t("templates.placeholderTitle")}</h2><p>{t("templates.placeholderText")}</p><div className="search-shell"><Search size={15} /><input className="search-input" value={placeholderQuery} onChange={(event) => setPlaceholderQuery(event.target.value)} placeholder={t("templates.searchPlaceholders")} /></div></div><div className="placeholder-examples">{placeholderReference.filter((token) => token.toLowerCase().includes(placeholderQuery.toLowerCase())).map((token) => <button className="placeholder-copy" key={token} onClick={() => void navigator.clipboard.writeText(token)}><code>{token}</code><Copy size={13} /></button>)}</div><p className="field-help">{t("templates.placeholderLocations")}</p></section>

    <OverviewTemplateModal key={`overview-${editingOverview?.id ?? "new"}-${overviewOpen}`} open={overviewOpen} template={editingOverview} templates={database.overviewTemplates} organizationId={database.organization.id} onClose={() => setOverviewOpen(false)} onSave={(template) => { saveOverviewTemplate(template); setOverviewOpen(false); }} t={t} />
    <Modal open={Boolean(overviewToDelete)} title={t("templates.deleteTitle")} onClose={() => setOverviewToDelete(null)}><div className="modal-body"><p>{t("templates.deleteText", { name: overviewToDelete?.name ?? "" })}</p></div><div className="modal-footer"><Button variant="secondary" onClick={() => setOverviewToDelete(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={() => { if (!overviewToDelete) return; deleteOverviewTemplate(overviewToDelete.id); setOverviewToDelete(null); }}>{t("common.deletePermanently")}</Button></div></Modal>
    <DocumentTemplateModal key={`document-${editingDocument?.id ?? "new"}-${documentOpen}`} open={documentOpen} template={editingDocument} organizationId={database.organization.id} onClose={() => setDocumentOpen(false)} onSave={(template) => { saveDocumentTemplate(template); setDocumentOpen(false); }} t={t} />
  </div>;
}

function blankOverviewTemplate(organizationId: string): OverviewTemplate {
  const now = new Date().toISOString();
  return { id: newId("overview-template"), organizationId, name: "", entries: [], createdAt: now, updatedAt: now };
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

function newOverviewEntry(type: OverviewEntryType): OverviewTemplateEntry {
  return { id: newId("overview-entry"), label: "", type, defaultValue: "", children: [] };
}

function updateOverviewEntry(entries: OverviewTemplateEntry[], entryId: string, update: (entry: OverviewTemplateEntry) => OverviewTemplateEntry): OverviewTemplateEntry[] {
  return entries.map((entry) => entry.id === entryId
    ? update(entry)
    : { ...entry, children: updateOverviewEntry(entry.children, entryId, update) });
}

function deleteOverviewEntry(entries: OverviewTemplateEntry[], entryId: string): OverviewTemplateEntry[] {
  return entries
    .filter((entry) => entry.id !== entryId)
    .map((entry) => ({ ...entry, children: deleteOverviewEntry(entry.children, entryId) }));
}

function placeholderPaths(template: OverviewTemplate): Map<string, string> {
  const paths = new Map<string, string>();
  const visit = (entries: OverviewTemplateEntry[]) => entries.forEach((entry) => {
    paths.set(entry.id, overviewEntryPath(template.name, entry.id, template.entries));
    visit(entry.children);
  });
  visit(template.entries);
  return paths;
}

function OverviewTemplateModal({ open, template, templates, organizationId, onClose, onSave, t }: { open: boolean; template: OverviewTemplate | null; templates: OverviewTemplate[]; organizationId: string; onClose: () => void; onSave: (template: OverviewTemplate) => void; t: Translate }) {
  const [draft, setDraft] = useState(() => template ? structuredClone(template) : blankOverviewTemplate(organizationId));
  const [entryType, setEntryType] = useState<OverviewEntryType>("text");
  const [copiedEntryId, setCopiedEntryId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ entryId: string; position: OverviewDropPosition } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const validation = useMemo(() => validateOverviewTemplate(draft, templates), [draft, templates]);
  const initialPaths = useMemo(() => template ? placeholderPaths(template) : new Map<string, string>(), [template]);

  const addEntry = (type: OverviewEntryType, parentId?: string) => {
    const entry = newOverviewEntry(type);
    setDraft((current) => ({
      ...current,
      entries: parentId
        ? updateOverviewEntry(current.entries, parentId, (parent) => ({ ...parent, children: [...parent.children, entry] }))
        : [...current.entries, entry],
    }));
  };

  const removeEntry = (entry: OverviewTemplateEntry) => {
    if (entry.children.length > 0 && !window.confirm(t("templates.deleteEntryWithChildren"))) return;
    setDraft((current) => ({ ...current, entries: deleteOverviewEntry(current.entries, entry.id) }));
  };
  const changeEntryType = (entry: OverviewTemplateEntry, type: OverviewEntryType) => {
    const becomesScalar = ["text", "date"].includes(type);
    if (becomesScalar && entry.children.length > 0 && !window.confirm(t("templates.changeTypeRemovesChildren"))) return;
    setDraft((current) => ({
      ...current,
      entries: updateOverviewEntry(current.entries, entry.id, (candidate) => ({
        ...candidate,
        type,
        defaultValue: ["group", "repeating_group"].includes(type) ? "" : candidate.defaultValue,
        children: becomesScalar ? [] : candidate.children,
      })),
    }));
  };
  const performMove = (event: DragEndEvent) => {
    const target = event.over?.data.current as { entryId?: string; position?: OverviewDropPosition } | undefined;
    setDropIndicator(null);
    if (!target?.entryId || !target.position) return;
    const result = moveOverviewEntry(draft.entries, String(event.active.id), target.entryId, target.position);
    if (!result.moved) return;
    if (result.parentChanged && !window.confirm(t("templates.moveChangesPlaceholder"))) return;
    setDraft((current) => ({ ...current, entries: result.entries }));
  };
  const previewMove = (event: DragOverEvent) => {
    const target = event.over?.data.current as { entryId?: string; position?: OverviewDropPosition } | undefined;
    if (!target?.entryId || !target.position) { setDropIndicator(null); return; }
    const result = moveOverviewEntry(draft.entries, String(event.active.id), target.entryId, target.position);
    setDropIndicator(result.moved ? { entryId: target.entryId, position: target.position } : null);
  };
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!validation.valid) return;
    if (template) {
      const currentPaths = placeholderPaths(draft);
      const placeholdersChanged = [...initialPaths].some(([id, path]) => currentPaths.get(id) !== path);
      if (placeholdersChanged && !window.confirm(t("templates.placeholderChangeWarning"))) return;
    }
    onSave({ ...draft, updatedAt: new Date().toISOString() });
  };

  return <Modal className="overview-template-modal" open={open} title={template ? t("templates.editOverview") : t("templates.addOverview")} onClose={onClose}>
    <form className="overview-template-form" onSubmit={handleSubmit}>
      <div className="modal-body template-form">
        <label className="field"><span>{t("templates.name")}</span><input required aria-invalid={Boolean(draft.name.trim()) && validation.nameConflict} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />{validation.nameConflict && draft.name.trim() && <small className="field-error">{t("templates.nameUnique")}</small>}</label>
        <div className="template-builder-labels" aria-hidden="true"><span /><span>{t("templates.entryLabel")}</span><span>{t("templates.entryType")}</span><span>{t("templates.defaultValue")}</span><span /></div>
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragOver={previewMove} onDragEnd={performMove} onDragCancel={() => setDropIndicator(null)}>
          <div className="template-entry-tree">
            {draft.entries.length === 0 && <p className="template-empty">{t("templates.noEntries")}</p>}
            {draft.entries.map((entry) => <TemplateBuilderEntry key={entry.id} entry={entry} depth={0} template={draft} invalidEntryIds={validation.invalidEntryIds} dropIndicator={dropIndicator} copiedEntryId={copiedEntryId} onCopied={setCopiedEntryId} onUpdate={(entryId, update) => setDraft((current) => ({ ...current, entries: updateOverviewEntry(current.entries, entryId, update) }))} onTypeChange={changeEntryType} onDelete={removeEntry} onAddChild={(parentId) => addEntry("text", parentId)} t={t} />)}
          </div>
        </DndContext>
        <div className="template-add-entry"><select aria-label={t("templates.entryType")} value={entryType} onChange={(event) => setEntryType(event.target.value as OverviewEntryType)}>{overviewEntryTypes.map((type) => <option key={type} value={type}>{t(`templates.entryType.${type}`)}</option>)}</select><Button type="button" variant="secondary" onClick={() => addEntry(entryType)}><Plus size={14} />{t("templates.addEntry")}</Button></div>
      </div>
      <div className="modal-footer"><Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" disabled={!validation.valid}>{t("common.save")}</Button></div>
    </form>
  </Modal>;
}

function TemplateBuilderEntry({ entry, depth, template, invalidEntryIds, dropIndicator, copiedEntryId, onCopied, onUpdate, onTypeChange, onDelete, onAddChild, t }: {
  entry: OverviewTemplateEntry;
  depth: number;
  template: OverviewTemplate;
  invalidEntryIds: Set<string>;
  dropIndicator: { entryId: string; position: OverviewDropPosition } | null;
  copiedEntryId: string | null;
  onCopied: (entryId: string | null) => void;
  onUpdate: (entryId: string, update: (entry: OverviewTemplateEntry) => OverviewTemplateEntry) => void;
  onTypeChange: (entry: OverviewTemplateEntry, type: OverviewEntryType) => void;
  onDelete: (entry: OverviewTemplateEntry) => void;
  onAddChild: (parentId: string) => void;
  t: Translate;
}) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: entry.id });
  const before = useDroppable({ id: `${entry.id}:before`, data: { entryId: entry.id, position: "before" satisfies OverviewDropPosition } });
  const inside = useDroppable({ id: `${entry.id}:inside`, data: { entryId: entry.id, position: "inside" satisfies OverviewDropPosition }, disabled: !["group", "repeating_group"].includes(entry.type) });
  const after = useDroppable({ id: `${entry.id}:after`, data: { entryId: entry.id, position: "after" satisfies OverviewDropPosition } });
  const isContainer = ["group", "repeating_group"].includes(entry.type);
  const rowStyle = { "--template-depth": depth, transform: CSS.Translate.toString(transform) } as CSSProperties;
  const copyPlaceholder = () => {
    void navigator.clipboard.writeText(overviewEntryClipboardValue(template, entry.id));
    onCopied(entry.id);
    window.setTimeout(() => onCopied(null), 1600);
  };
  return <div className={`template-builder-node ${isDragging ? "is-dragging" : ""}`} ref={setDragRef} style={rowStyle}>
    <div ref={before.setNodeRef} className={`template-drop-zone drop-before ${dropIndicator?.entryId === entry.id && dropIndicator.position === "before" ? "is-active" : ""}`} />
    <div ref={inside.setNodeRef} className={`template-builder-row ${dropIndicator?.entryId === entry.id && dropIndicator.position === "inside" ? "drop-inside-active" : ""}`}>
      <button type="button" className="template-drag-handle" aria-label={t("templates.dragEntry")} {...attributes} {...listeners}><GripVertical size={16} /></button>
      <input className="template-entry-label" required aria-invalid={invalidEntryIds.has(entry.id)} aria-label={t("templates.entryLabel")} placeholder={t("templates.entryLabel")} value={entry.label} onChange={(event) => onUpdate(entry.id, (candidate) => ({ ...candidate, label: event.target.value }))} />
      <select className="template-entry-type" aria-label={t("templates.entryType")} value={entry.type} onChange={(event) => onTypeChange(entry, event.target.value as OverviewEntryType)}>{overviewEntryTypes.map((type) => <option key={type} value={type}>{t(`templates.entryType.${type}`)}</option>)}</select>
      {isContainer ? <button type="button" className="template-entry-value template-add-child" onClick={() => onAddChild(entry.id)}><Plus size={13} />{t("templates.addNestedEntry")}</button> : <input className="template-entry-value" type={entry.type === "date" ? "date" : "text"} aria-label={t("templates.defaultValue")} placeholder={t("templates.defaultValue")} value={entry.defaultValue} onChange={(event) => onUpdate(entry.id, (candidate) => ({ ...candidate, defaultValue: event.target.value }))} />}
      <details className="template-entry-menu"><summary aria-label={t("common.moreActions")}><MoreVertical size={16} /></summary><div className="template-entry-menu-popover"><button type="button" onClick={copyPlaceholder}><Copy size={14} /><span><small>{copiedEntryId === entry.id ? t("templates.copied") : t("templates.copyPlaceholder")}</small><code>{overviewEntryClipboardValue(template, entry.id)}</code></span></button><button type="button" className="danger" onClick={() => onDelete(entry)}><Trash2 size={14} />{t("common.deletePermanently")}</button></div></details>
    </div>
    {entry.children.length > 0 && <div className="template-builder-children">{entry.children.map((child) => <TemplateBuilderEntry key={child.id} entry={child} depth={depth + 1} template={template} invalidEntryIds={invalidEntryIds} dropIndicator={dropIndicator} copiedEntryId={copiedEntryId} onCopied={onCopied} onUpdate={onUpdate} onTypeChange={onTypeChange} onDelete={onDelete} onAddChild={onAddChild} t={t} />)}</div>}
    <div ref={after.setNodeRef} className={`template-drop-zone drop-after ${dropIndicator?.entryId === entry.id && dropIndicator.position === "after" ? "is-active" : ""}`} />
  </div>;
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
