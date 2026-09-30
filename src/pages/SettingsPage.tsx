import { DndContext, PointerSensor, pointerWithin, type DragEndEvent, type DragOverEvent, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ArchiveRestore, Check, CircleAlert, CircleHelp, Copy, Database, Download, FilePlus2, GripVertical, Languages, MoreVertical, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2 } from "lucide-react";
import { type ChangeEvent, type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, PageHeader } from "../components/Ui";
import { FieldTypeHelpModal } from "../components/FieldTypeHelpModal";
import { ProjectRolesTemplateSection } from "../components/ProjectRolesTemplateSection";
import { getBlob, saveBlob } from "../data/blobRepository";
import {
  countOverviewEntries,
  localizeOverviewTemplate,
  mergeOverviewTemplateLocale,
  moveOverviewEntry,
  normalizeOverviewKey,
  overviewEntryClipboardValue,
  overviewTemplateName,
  validateOverviewTemplate,
  type OverviewDropPosition,
} from "../domain/overviewTemplates";
import type { DocumentTemplate, Locale, OverviewEntryType, OverviewTemplate, OverviewTemplateEntry } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { newId, useApp } from "../state/AppProvider";
import { copyTextToClipboard } from "../utils/clipboard";

const overviewEntryTypes: OverviewEntryType[] = ["text", "date", "group", "repeating_group"];
const COPY_FEEDBACK_DURATION_MS = 1800;
const placeholderReference = [
  "{{#qs.plan.category_tree}}", "{{qs.category.title}}", "{{qs.category.path}}", "{{qs.category.depth}}", "{{qs.category.color}}",
  "{{#qs.category.blocks}}",
  "{{qs.block.color}}", "{{qs.block.title}}", "{{qs.block.a4_description}}", "{{qs.block.regulations}}",
  "{{qs.block.image}}", "{{/qs.category.blocks}}", "{{/qs.plan.category_tree}}",
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
  const { locale, t } = useI18n();
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [editingOverview, setEditingOverview] = useState<OverviewTemplate | null>(null);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<DocumentTemplate | null>(null);
  const [placeholderQuery, setPlaceholderQuery] = useState("");
  const [copyFeedback, setCopyFeedback] = useState<{ token: string; status: "copied" | "failed" } | null>(null);
  const copyFeedbackTimer = useRef<number | null>(null);
  const [overviewToDelete, setOverviewToDelete] = useState<OverviewTemplate | null>(null);
  const [documentToDelete, setDocumentToDelete] = useState<DocumentTemplate | null>(null);
  const openOverview = (template?: OverviewTemplate) => { setEditingOverview(template ?? null); setOverviewOpen(true); };
  const openDocument = (template?: DocumentTemplate) => { setEditingDocument(template ?? null); setDocumentOpen(true); };
  const visibleDocumentTemplates = database.documentTemplates.filter(
    (template) => template.locale === locale && template.lifecycle !== "archived",
  );

  useEffect(() => () => {
    if (copyFeedbackTimer.current !== null) window.clearTimeout(copyFeedbackTimer.current);
  }, []);

  const copyPlaceholder = async (token: string) => {
    const copied = await copyTextToClipboard(token);
    setCopyFeedback({ token, status: copied ? "copied" : "failed" });
    if (copyFeedbackTimer.current !== null) window.clearTimeout(copyFeedbackTimer.current);
    copyFeedbackTimer.current = window.setTimeout(() => setCopyFeedback(null), COPY_FEEDBACK_DURATION_MS);
  };

  const downloadDocumentTemplate = async (template: DocumentTemplate) => {
    const { createStandardTemplate, downloadBlob } = await import("../documents/templateEngine");
    let blob: Blob | undefined;
    if (template.origin === "standard") {
      blob = await createStandardTemplate(template.documentType, template.locale);
    } else if (template.blobId) {
      blob = await getBlob(template.blobId);
    }
    if (blob) downloadBlob(blob, template.filename);
  };

  return <div className="page settings-page">
    <PageHeader title={t("templates.pageTitle")} description={t("templates.pageSubtitle")} />

    <ProjectRolesTemplateSection />

    <section className="settings-section">
      <div className="settings-section-header">
        <div><h2>{t("templates.overviewTitle")}</h2><p>{t("templates.overviewText")}</p></div>
        <Button onClick={() => openOverview()}><Plus size={15} />{t("templates.addOverview")}</Button>
      </div>
      <div className="template-list">
        {database.overviewTemplates.filter((template) => template.id !== "overview-template-participants").map((template) => (
          <article className="template-row" key={template.id}>
            <div><strong>{overviewTemplateName(template, locale)}</strong><span>{countOverviewEntries(template.entries)} {t("overview.entries")}</span></div>
            <div className="row-actions">
              <Button size="small" variant="secondary" onClick={() => openOverview(template)}><Pencil size={14} />{t("common.edit")}</Button>
              <button className="icon-button danger-icon" onClick={() => setOverviewToDelete(template)} aria-label={`${t("common.delete")}: ${overviewTemplateName(template, locale)}`}><Trash2 size={14} /></button>
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="settings-section">
      <div className="settings-section-header">
        <div><h2>{t("templates.wordTitle")}</h2><p>{t("templates.wordText")}</p></div>
        <Button onClick={() => openDocument()}><FilePlus2 size={15} />{t("templates.uploadWord")}</Button>
      </div>
      <div className="template-list">
        {visibleDocumentTemplates.map((template) => (
          <article className="template-row" key={template.id}>
            <div>
              <strong>{template.origin === "standard" ? t(`documents.${template.documentType}`) : template.name}</strong>
              <span>{template.origin === "standard" ? `${template.name} · ` : ""}{t(`common.language.${template.locale}`)} · {template.origin === "standard" ? t("templates.standard") : template.filename} · v{template.revision ?? 1}</span>
            </div>
            <div className="row-actions">
              <Button size="small" variant="secondary" onClick={() => void downloadDocumentTemplate(template)}><Download size={14} />{t("common.download")}</Button>
              {template.origin === "custom" && <>
                <Button size="small" variant="secondary" onClick={() => openDocument(template)}><Pencil size={14} />{t("common.edit")}</Button>
                <button className="icon-button danger-icon" onClick={() => setDocumentToDelete(template)} aria-label={`${t("common.delete")}: ${template.name}`}><Trash2 size={14} /></button>
              </>}
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="panel template-reference"><div><h2>{t("templates.placeholderTitle")}</h2><p>{t("templates.placeholderText")}</p><div className="search-shell"><Search size={15} /><input className="search-input" value={placeholderQuery} onChange={(event) => setPlaceholderQuery(event.target.value)} placeholder={t("templates.searchPlaceholders")} /></div></div><div className="placeholder-examples">{placeholderReference.filter((token) => token.toLowerCase().includes(placeholderQuery.toLowerCase())).map((token) => {
      const status = copyFeedback?.token === token ? copyFeedback.status : null;
      return <button type="button" className={`placeholder-copy ${status ? `is-${status}` : ""}`} key={token} aria-label={`${t("templates.copyPlaceholder")}: ${token}`} onClick={() => void copyPlaceholder(token)}><code>{token}</code><span className="placeholder-copy-action" aria-hidden="true">{status === "copied" ? <><Check size={13} />{t("templates.copied")}</> : status === "failed" ? <><CircleAlert size={13} />{t("templates.copyFailed")}</> : <Copy size={13} />}</span></button>;
    })}</div><span className="visually-hidden" role="status">{copyFeedback ? `${t(copyFeedback.status === "copied" ? "templates.copied" : "templates.copyFailed")}: ${copyFeedback.token}` : ""}</span><p className="field-help">{t("templates.placeholderLocations")}</p></section>

    <OverviewTemplateModal key={`overview-${editingOverview?.id ?? "new"}-${overviewOpen}`} open={overviewOpen} template={editingOverview} templates={database.overviewTemplates} organizationId={database.organization.id} locale={locale} onClose={() => setOverviewOpen(false)} onSave={(template) => { saveOverviewTemplate(template, locale); setOverviewOpen(false); }} t={t} />
    <Modal open={Boolean(overviewToDelete)} title={t("templates.deleteTitle")} onClose={() => setOverviewToDelete(null)}><div className="modal-body"><p>{t("templates.deleteText", { name: overviewToDelete ? overviewTemplateName(overviewToDelete, locale) : "" })}</p></div><div className="modal-footer"><Button variant="secondary" onClick={() => setOverviewToDelete(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={() => { if (!overviewToDelete) return; deleteOverviewTemplate(overviewToDelete.id); setOverviewToDelete(null); }}>{t("common.delete")}</Button></div></Modal>
    <Modal open={Boolean(documentToDelete)} title={t("templates.deleteWordTitle")} onClose={() => setDocumentToDelete(null)}><div className="modal-body"><p>{t("templates.deleteWordText", { name: documentToDelete?.name ?? "" })}</p></div><div className="modal-footer"><Button variant="secondary" onClick={() => setDocumentToDelete(null)}>{t("common.cancel")}</Button><Button variant="danger" onClick={() => { if (!documentToDelete) return; deleteDocumentTemplate(documentToDelete.id); setDocumentToDelete(null); }}>{t("common.delete")}</Button></div></Modal>
    <DocumentTemplateModal key={`document-${editingDocument?.id ?? "new"}-${documentOpen}`} open={documentOpen} template={editingDocument} templates={database.documentTemplates} organizationId={database.organization.id} activeLocale={locale} onClose={() => setDocumentOpen(false)} onSave={(template) => { saveDocumentTemplate(template); setDocumentOpen(false); }} t={t} />
  </div>;
}

function blankOverviewTemplate(organizationId: string, locale: Locale): OverviewTemplate {
  const now = new Date().toISOString();
  return { id: newId("overview-template"), organizationId, name: "", sourceLocale: locale, entries: [], createdAt: now, updatedAt: now };
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

function OverviewTemplateModal({ open, template, templates, organizationId, locale, onClose, onSave, t }: { open: boolean; template: OverviewTemplate | null; templates: OverviewTemplate[]; organizationId: string; locale: Locale; onClose: () => void; onSave: (template: OverviewTemplate) => void; t: Translate }) {
  const [draft, setDraft] = useState(() => template ? localizeOverviewTemplate(template, locale) : blankOverviewTemplate(organizationId, locale));
  const [entryType, setEntryType] = useState<OverviewEntryType>("text");
  const [fieldTypeHelpOpen, setFieldTypeHelpOpen] = useState(false);
  const [copiedEntryId, setCopiedEntryId] = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ entryId: string; position: OverviewDropPosition } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const localizedTemplates = useMemo(
    () => templates.map((candidate) => localizeOverviewTemplate(candidate, locale)),
    [locale, templates],
  );
  const validation = useMemo(() => validateOverviewTemplate(draft, localizedTemplates), [draft, localizedTemplates]);
  const templateNameMissing = normalizeOverviewKey(draft.name, "").length === 0;
  const templateNameError = templateNameMissing ? t("templates.nameRequired") : validation.nameConflict ? t("templates.nameUnique") : "";

  useEffect(() => {
    if (!open) return undefined;
    const closeEntryMenus = (event: PointerEvent) => {
      const target = event.target as Node;
      document.querySelectorAll<HTMLDetailsElement>(".overview-template-modal .template-entry-menu[open]").forEach((menu) => {
        if (!menu.contains(target)) menu.open = false;
      });
    };
    document.addEventListener("pointerdown", closeEntryMenus);
    return () => document.removeEventListener("pointerdown", closeEntryMenus);
  }, [open]);

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
    onSave(mergeOverviewTemplateLocale(template, { ...draft, updatedAt: new Date().toISOString() }, locale));
  };

  return <>
    <Modal className="overview-template-modal" open={open} title={template ? t("templates.editOverview") : t("templates.addOverview")} onClose={onClose}>
      <form className="overview-template-form" onSubmit={handleSubmit}>
        <div className="modal-body template-form">
          <label className="field"><span>{t("templates.name")}</span><input required aria-invalid={Boolean(templateNameError)} aria-describedby={templateNameError ? "template-name-error" : undefined} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />{templateNameError && <small id="template-name-error" className="field-error" role="alert">{templateNameError}</small>}</label>
          <div className="template-builder-labels"><span /><span>{t("templates.entryLabel")}</span><span className="template-entry-type-heading">{t("templates.entryType")}<button type="button" className="template-help-button" aria-label={t("templates.fieldTypeHelp")} onClick={() => setFieldTypeHelpOpen(true)}><CircleHelp size={14} /></button></span><span>{t("templates.defaultValue")}</span><span /></div>
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
    </Modal>
    <FieldTypeHelpModal open={fieldTypeHelpOpen} onClose={() => setFieldTypeHelpOpen(false)} t={t} />
  </>;
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
  const entryIsInvalid = invalidEntryIds.has(entry.id);
  const entryLabelMissing = normalizeOverviewKey(entry.label, "").length === 0;
  const entryError = entryIsInvalid
    ? entryLabelMissing ? t("templates.entryLabelRequired") : t("templates.entryLabelUnique")
    : "";
  const entryErrorId = `template-entry-error-${entry.id}`;
  const rowStyle = { "--template-depth": depth, transform: CSS.Translate.toString(transform) } as CSSProperties;
  const copyPlaceholder = async () => {
    const copied = await copyTextToClipboard(overviewEntryClipboardValue(template, entry.id));
    if (!copied) return;
    onCopied(entry.id);
    window.setTimeout(() => onCopied(null), COPY_FEEDBACK_DURATION_MS);
  };
  return <div className={`template-builder-node ${isDragging ? "is-dragging" : ""}`} ref={setDragRef} style={rowStyle}>
    <div ref={before.setNodeRef} className={`template-drop-zone drop-before ${dropIndicator?.entryId === entry.id && dropIndicator.position === "before" ? "is-active" : ""}`} />
    <div ref={inside.setNodeRef} className={`template-builder-row ${dropIndicator?.entryId === entry.id && dropIndicator.position === "inside" ? "drop-inside-active" : ""}`}>
      <button type="button" className="template-drag-handle" aria-label={t("templates.dragEntry")} {...attributes} {...listeners}><GripVertical size={16} /></button>
      <div className="template-entry-label-field"><input className="template-entry-label" required aria-invalid={entryIsInvalid} aria-describedby={entryError ? entryErrorId : undefined} aria-label={t("templates.entryLabel")} placeholder={t("templates.entryLabel")} value={entry.label} onChange={(event) => onUpdate(entry.id, (candidate) => ({ ...candidate, label: event.target.value }))} />{entryError && <small id={entryErrorId} className="template-entry-inline-error" role="alert">{entryError}</small>}</div>
      <select className="template-entry-type" aria-label={t("templates.entryType")} value={entry.type} onChange={(event) => onTypeChange(entry, event.target.value as OverviewEntryType)}>{overviewEntryTypes.map((type) => <option key={type} value={type}>{t(`templates.entryType.${type}`)}</option>)}</select>
      {isContainer ? <button type="button" className="template-entry-value template-add-child" onClick={() => onAddChild(entry.id)}><Plus size={13} />{t("templates.addNestedEntry")}</button> : <input className="template-entry-value" type={entry.type === "date" ? "date" : "text"} aria-label={t("templates.defaultValue")} placeholder={t("templates.defaultValue")} value={entry.defaultValue} onChange={(event) => onUpdate(entry.id, (candidate) => ({ ...candidate, defaultValue: event.target.value }))} />}
      <details className="template-entry-menu"><summary aria-label={t("common.moreActions")}><MoreVertical size={16} /></summary><div className="template-entry-menu-popover"><button type="button" onClick={copyPlaceholder}><Copy size={14} /><span><small>{copiedEntryId === entry.id ? t("templates.copied") : t("templates.copyPlaceholder")}</small><code>{overviewEntryClipboardValue(template, entry.id)}</code></span></button><button type="button" className="danger" onClick={() => onDelete(entry)}><Trash2 size={14} />{t("common.delete")}</button></div></details>
    </div>
    {entry.children.length > 0 && <div className="template-builder-children">{entry.children.map((child) => <TemplateBuilderEntry key={child.id} entry={child} depth={depth + 1} template={template} invalidEntryIds={invalidEntryIds} dropIndicator={dropIndicator} copiedEntryId={copiedEntryId} onCopied={onCopied} onUpdate={onUpdate} onTypeChange={onTypeChange} onDelete={onDelete} onAddChild={onAddChild} t={t} />)}</div>}
    <div ref={after.setNodeRef} className={`template-drop-zone drop-after ${dropIndicator?.entryId === entry.id && dropIndicator.position === "after" ? "is-active" : ""}`} />
  </div>;
}

function normalizeDocumentTemplateName(name: string): string {
  return name.trim().toLowerCase();
}

function DocumentTemplateModal({ open, template, templates, organizationId, activeLocale, onClose, onSave, t }: { open: boolean; template: DocumentTemplate | null; templates: DocumentTemplate[]; organizationId: string; activeLocale: Locale; onClose: () => void; onSave: (template: DocumentTemplate) => void; t: (key: string) => string }) {
  const now = new Date().toISOString();
  const [draft, setDraft] = useState<DocumentTemplate>(() => template ? structuredClone(template) : { id: newId("document-template"), organizationId, name: "", documentType: "a4_plan", locale: activeLocale, origin: "custom", filename: "", description: "", createdAt: now, updatedAt: now });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [validating, setValidating] = useState(false);
  const normalizedName = normalizeDocumentTemplateName(draft.name);
  const nameConflict = templates.some((candidate) => (
    candidate.id !== draft.id
    && candidate.lifecycle !== "archived"
    && normalizeDocumentTemplateName(candidate.name) === normalizedName
  ));
  const nameError = normalizedName.length === 0 ? t("templates.nameRequired") : nameConflict ? t("templates.nameUnique") : "";
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => { const selected = event.target.files?.[0]; if (selected) { setFile(selected); setDraft((current) => ({ ...current, filename: selected.name })); } };
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setValidating(true);
    if (nameError) { setValidating(false); return; }
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
      onSave({ ...draft, name: draft.name.trim(), blobId, validation, lifecycle: "active", filename: file?.name ?? draft.filename, updatedAt: new Date().toISOString() });
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : t("templates.validationFailed"));
    } finally { setValidating(false); }
  };
  return <Modal open={open} title={template ? t("templates.editWord") : t("templates.uploadWord")} onClose={onClose}><form onSubmit={(event) => void handleSubmit(event)}><div className="modal-body form-grid">{error && <div className="form-error span-two">{error}</div>}<label className="field"><span>{t("templates.name")}</span><input required aria-invalid={Boolean(nameError)} aria-describedby={nameError ? "document-template-name-error" : undefined} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />{nameError && <small id="document-template-name-error" className="field-error" role="alert">{nameError}</small>}</label><label className="field"><span>{t("templates.language")}</span><select value={draft.locale} onChange={(event) => setDraft({ ...draft, locale: event.target.value as Locale })}><option value="de">Deutsch</option><option value="en">English</option></select></label><label className="field"><span>{t("templates.wordFile")}</span><input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={handleFile} /><small>{file?.name ?? draft.filename}</small></label><label className="field span-two"><span>{t("templates.description")}</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><div className="template-security span-two">{t("templates.securityNote")}</div></div><div className="modal-footer"><Button type="button" variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button type="submit" disabled={validating || Boolean(nameError)}>{validating ? t("templates.validating") : t("common.save")}</Button></div></form></Modal>;
}
