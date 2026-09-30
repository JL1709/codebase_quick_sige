import { Cloud, FileSpreadsheet, FileUser, Upload } from "lucide-react";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  autoMapContactHeaders,
  candidatesFromDelimitedAsync,
  exportContactCsvTemplate,
  matchContactImportCandidate,
  parseDelimitedContactsAsync,
  readContactImportFile,
  sanitizeContactImportLabel,
  type ContactImportCandidate,
  type ContactImportField,
  type ContactTextEncoding,
  type DelimitedImportData,
} from "../domain/contactImport";
import {
  candidateDisplayName,
  type ContactImportDecision,
  type ContactImportDecisionAction,
  type ContactImportOverwriteField,
} from "../domain/contactImportCommit";
import { contactDisplayName, STANDARD_PROJECT_ROLES } from "../domain/contacts";
import type { Contact, ContactSource, ExternalContactIdentity, ProjectParticipantRole } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { importGoogleContacts, importMicrosoftContacts, type ContactProviderCollection } from "../integrations/contactProviders";
import { useApp } from "../state/AppProvider";
import { Badge, Button, Modal } from "./Ui";

const FIELD_OPTIONS: ContactImportField[] = [
  "ignore", "displayName", "givenName", "familyName", "prefix", "suffix", "companyName", "jobTitle", "department",
  "email", "phone", "street", "postalCode", "city", "region", "country", "notes", "tags",
];
const SINGLETON_IMPORT_FIELDS = new Set<ContactImportField>(FIELD_OPTIONS.filter((field) => !["ignore", "email", "phone", "tags"].includes(field)));
const OVERWRITABLE_IMPORT_FIELDS: ContactImportOverwriteField[] = ["prefix", "givenName", "familyName", "suffix", "displayName", "notes"];

type ImportStep = "source" | "provider" | "mapping" | "review" | "confirm" | "result";

function createDecisions(candidates: ContactImportCandidate[], contacts: Contact[], identities: ExternalContactIdentity[]): ContactImportDecision[] {
  return candidates.map((candidate) => {
    const existing = matchContactImportCandidate(candidate, contacts, identities);
    const hasIdentity = Boolean(candidateDisplayName(candidate) || candidate.emails.length || candidate.phones.length);
    return { candidate, action: !hasIdentity ? "skip" : existing ? "update" : "create", existingContactId: existing?.id };
  });
}

function providerErrorMessage(error: unknown, t: (key: string) => string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.startsWith("provider_not_configured")) return t("contacts.import.providerNotConfigured");
  if (message === "file_too_large") return t("contacts.import.fileTooLarge");
  if (message === "too_many_records") return t("contacts.import.tooManyRecords");
  if (message === "unsupported_file") return t("contacts.import.unsupportedFile");
  if (message === "unsupported_encoding") return t("contacts.import.unsupportedEncoding");
  if (message === "malformed_xlsx" || message === "malformed_vcard") return t("contacts.import.malformedFile");
  if (message === "xlsx_expansion_limit") return t("contacts.import.xlsxExpansionLimit");
  if (message === "provider_pagination_limit") return t("contacts.import.providerLimit");
  if (message === "provider_session_expired") return t("contacts.import.providerSessionExpired");
  if (message === "provider_permission_denied") return t("contacts.import.providerPermissionDenied");
  if (message === "provider_throttled") return t("contacts.import.providerThrottled");
  if (message === "provider_network_failed" || message === "provider_unavailable") return t("contacts.import.providerUnavailable");
  if (message === "provider_popup_blocked") return t("contacts.import.providerPopupBlocked");
  if (message === "provider_consent_cancelled") return t("contacts.import.providerConsentCancelled");
  if (message === "provider_conditional_access") return t("contacts.import.providerConditionalAccess");
  if (message === "provider_authorization_failed") return t("contacts.import.providerAuthorizationFailed");
  if (message.startsWith("provider_request_failed")) return t("contacts.import.providerFailed");
  return t("contacts.import.failed");
}

export function ContactImportModal({ open, onClose, onImported, defaultProjectId = "" }: { open: boolean; onClose: () => void; onImported?: (contactIds: string[]) => void; defaultProjectId?: string }) {
  const { database, commitContactImport, undoContactImportBatch, recordContactProviderEvent } = useApp();
  const { locale, t } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const providerAbortController = useRef<AbortController | null>(null);
  const [step, setStep] = useState<ImportStep>("source");
  const [source, setSource] = useState<ContactSource>("csv");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sheets, setSheets] = useState<DelimitedImportData[]>([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [rawText, setRawText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File>();
  const [textEncoding, setTextEncoding] = useState<ContactTextEncoding>("utf-8");
  const [delimiterOverride, setDelimiterOverride] = useState<"auto" | "," | ";" | "\t">("auto");
  const baseSheet = sheets[sheetIndex];
  const activeSheet = useMemo(() => {
    if (!baseSheet?.sourceRows?.length || headerRowIndex === 0) return baseSheet;
    return { ...baseSheet, headers: baseSheet.sourceRows[headerRowIndex] ?? [], rows: baseSheet.sourceRows.slice(headerRowIndex + 1) };
  }, [baseSheet, headerRowIndex]);
  const [mapping, setMapping] = useState<ContactImportField[]>([]);
  const [decisions, setDecisions] = useState<ContactImportDecision[]>([]);
  const [providerCandidates, setProviderCandidates] = useState<ContactImportCandidate[]>([]);
  const [providerCollections, setProviderCollections] = useState<ContactProviderCollection[]>([]);
  const [selectedProviderCollections, setSelectedProviderCollections] = useState<Set<string>>(new Set());
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [roles, setRoles] = useState<Set<ProjectParticipantRole>>(new Set(["contractor"]));
  const [customRole, setCustomRole] = useState("");
  const [importTag, setImportTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ batchId: string; contactIds: string[]; created: number; updated: number; merged: number; skipped: number; failed: number; undone?: boolean; reverted?: number; conflicts?: number }>();
  const actionCounts = useMemo(() => decisions.reduce((counts, decision) => ({ ...counts, [decision.action]: counts[decision.action] + 1 }), { create: 0, update: 0, merge: 0, skip: 0 }), [decisions]);
  const mappingHasConflicts = useMemo(() => mapping.some((field, index) => SINGLETON_IMPORT_FIELDS.has(field) && mapping.indexOf(field) !== index), [mapping]);
  useEffect(() => () => providerAbortController.current?.abort(), []);
  const warningLabel = (warning: string) => {
    if (warning.startsWith("formula_only_cells:")) return t("contacts.import.formulaOnlyWarning", { count: Number(warning.split(":")[1] ?? 0) });
    if (warning.startsWith("ignored:")) return t("contacts.import.ignoredFieldsWarning", { fields: warning.slice("ignored:".length) });
    if (warning.startsWith("malformed_card:")) return t("contacts.import.malformedCardWarning");
    return warning;
  };

  const showReview = (candidates: ContactImportCandidate[], selectedSource: ContactSource, label: string) => {
    setSource(selectedSource);
    setSourceLabel(label);
    setDecisions(createDecisions(candidates, database.contacts.filter((contact) => contact.lifecycle === "active"), database.externalContactIdentities));
    setStep("review");
  };

  const readFile = async (file: File, encoding = textEncoding, delimiter = delimiterOverride) => {
    setBusy(true);
    setError("");
    setSelectedFile(file);
    setProviderCandidates([]);
    setProviderCollections([]);
    try {
      const imported = await readContactImportFile(file, { encoding, delimiter: delimiter === "auto" ? undefined : delimiter });
      const safeFilename = sanitizeContactImportLabel(file.name);
      setSource(imported.source);
      setSourceLabel(safeFilename);
      setRawText(imported.rawText ?? "");
      setHeaderRowIndex(0);
      if (imported.sheets?.length) {
        setSheets(imported.sheets);
        setSheetIndex(0);
        setMapping(autoMapContactHeaders(imported.sheets[0].headers));
        setStep("mapping");
      } else showReview(imported.candidates ?? [], imported.source, safeFilename);
    } catch (caught) {
      setError(/\.(msg|pst|ost)$/i.test(file.name) ? t("contacts.import.outlookVirtualItemUnsupported") : providerErrorMessage(caught, t));
    } finally { setBusy(false); }
  };

  const handleProvider = async (provider: "microsoft" | "google") => {
    providerAbortController.current?.abort();
    const controller = new AbortController();
    providerAbortController.current = controller;
    setBusy(true);
    setError("");
    try {
      const imported = provider === "microsoft" ? await importMicrosoftContacts({ signal: controller.signal }) : await importGoogleContacts({ signal: controller.signal });
      recordContactProviderEvent(provider, "connected");
      const label = provider === "microsoft" ? "Microsoft Outlook" : "Google Contacts";
      setSheets([]);
      setSelectedFile(undefined);
      setSource(provider);
      setSourceLabel(label);
      setProviderCandidates(imported.candidates);
      setProviderCollections(imported.collections);
      setSelectedProviderCollections(new Set(imported.collections.map((collection) => collection.id)));
      setStep(imported.collections.length > 0 ? "provider" : "review");
      if (imported.collections.length === 0) showReview(imported.candidates, provider, label);
    } catch (caught) {
      if (controller.signal.aborted) return;
      recordContactProviderEvent(provider, "failed");
      setError(providerErrorMessage(caught, t));
    } finally {
      recordContactProviderEvent(provider, "disconnected");
      if (!controller.signal.aborted) setBusy(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void readFile(file);
    else setError(t("contacts.import.outlookVirtualItemUnsupported"));
  };

  const continueFromMapping = async () => {
    if (!activeSheet) return;
    setBusy(true);
    try { showReview(await candidatesFromDelimitedAsync(activeSheet, mapping), source, sourceLabel); }
    catch (caught) { setError(providerErrorMessage(caught, t)); }
    finally { setBusy(false); }
  };

  const continueFromProvider = () => showReview(
    providerCandidates.filter((candidate) => candidate.collectionIds?.some((collectionId) => selectedProviderCollections.has(collectionId))),
    source,
    sourceLabel,
  );

  const changeDelimiter = async (value: "auto" | "," | ";" | "\t") => {
    setDelimiterOverride(value);
    if (!rawText) return;
    setBusy(true);
    try {
      const data = await parseDelimitedContactsAsync(rawText, value === "auto" ? undefined : value);
      setSheets([data]);
      setSheetIndex(0);
      setHeaderRowIndex(0);
      setMapping(autoMapContactHeaders(data.headers));
    } finally { setBusy(false); }
  };

  const updateDecision = (index: number, action: ContactImportDecisionAction) => setDecisions((current) => current.map((decision, decisionIndex) => decisionIndex === index ? {
    ...decision,
    action,
    existingContactId: action === "update" || action === "merge" ? decision.existingContactId ?? matchContactImportCandidate(decision.candidate, database.contacts, database.externalContactIdentities)?.id ?? database.contacts[0]?.id : undefined,
  } : decision));

  const toggleOverwriteField = (decisionIndex: number, field: ContactImportOverwriteField) => setDecisions((current) => current.map((decision, index) => {
    if (index !== decisionIndex) return decision;
    const selected = new Set(decision.overwriteFields ?? []);
    if (selected.has(field)) selected.delete(field); else selected.add(field);
    return { ...decision, overwriteFields: [...selected] };
  }));

  const finishImport = () => {
    const taggedDecisions = decisions.map((decision) => importTag.trim() ? {
      ...decision,
      candidate: { ...decision.candidate, tags: [...new Set([...decision.candidate.tags, importTag.trim().slice(0, 80)])] },
    } : decision);
    const batch = commitContactImport({
      source,
      sourceLabel,
      decisions: taggedDecisions,
      projectAssignment: projectId ? {
        projectId,
        roles: [...roles].map((role) => ({ role, customLabel: role === "custom" ? customRole.trim() : undefined })),
      } : undefined,
    });
    setResult({
      batchId: batch.id,
      contactIds: batch.items.flatMap((item) => item.contactId && (item.action === "created" || item.action === "updated" || item.action === "merged") ? [item.contactId] : []),
      created: batch.items.filter((item) => item.action === "created").length,
      updated: batch.items.filter((item) => item.action === "updated").length,
      merged: batch.items.filter((item) => item.action === "merged").length,
      skipped: batch.items.filter((item) => item.action === "skipped").length,
      failed: batch.items.filter((item) => item.action === "failed").length,
    });
    setStep("result");
  };
  const toggleRole = (role: ProjectParticipantRole) => setRoles((current) => {
    const selected = new Set(current);
    if (selected.has(role)) selected.delete(role); else selected.add(role);
    return selected;
  });
  const downloadCsvTemplate = () => {
    const url = URL.createObjectURL(new Blob([exportContactCsvTemplate(locale)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "quicksige-contacts-template.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const downloadErrorReport = () => {
    const csvCell = (value: string) => `"${(/^[=+\-@\t\r]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
    const rows = decisions.filter((decision) => decision.action === "skip" || decision.candidate.warnings.length > 0).map((decision) => [
      decision.candidate.sourceKey,
      decision.action,
      decision.candidate.warnings.join(";"),
    ].map(csvCell).join(","));
    const content = [["Source row", "Decision", "Issue codes"].map(csvCell).join(","), ...rows].join("\r\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "quicksige-contact-import-report.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const closeImport = () => {
    providerAbortController.current?.abort();
    if (result && !result.undone) onImported?.([...new Set(result.contactIds)]);
    onClose();
  };

  return <Modal open={open} title={t("contacts.import.title")} onClose={closeImport} className="contact-import-modal">
    {step === "source" && <div className="modal-body import-source-step">
      <p>{t("contacts.import.intro")}</p>
      <div className="provider-grid">
        <button type="button" onClick={() => void handleProvider("microsoft")} disabled={busy}><Cloud /><strong>Microsoft Outlook</strong><span>{t("contacts.import.microsoftHelp")}</span></button>
        <button type="button" onClick={() => void handleProvider("google")} disabled={busy}><Cloud /><strong>Google Contacts</strong><span>{t("contacts.import.googleHelp")}</span></button>
      </div>
      <div className="import-divider"><span>{t("contacts.import.orFile")}</span></div>
      <label className="field"><span>{t("contacts.import.encoding")}</span><select value={textEncoding} onChange={(event) => { const encoding = event.target.value as ContactTextEncoding; setTextEncoding(encoding); if (selectedFile) void readFile(selectedFile, encoding); }}><option value="utf-8">UTF-8</option><option value="windows-1252">Windows-1252</option><option value="iso-8859-1">ISO-8859-1</option></select><small>{t("contacts.import.encodingHelp")}</small></label>
      <div className="file-drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop} onClick={() => fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && fileInput.current?.click()}>
        <Upload size={28} /><strong>{t("contacts.import.drop")}</strong><span>{t("contacts.import.formats")}</span>
        <input ref={fileInput} type="file" accept=".vcf,.vcard,.csv,.tsv,.txt,.xlsx" hidden onChange={(event) => event.target.files?.[0] && void readFile(event.target.files[0])} />
      </div>
      <div className="import-format-help"><FileUser size={18} /><span><strong>{t("contacts.import.outlookDrag")}</strong>{t("contacts.import.outlookDragHelp")}</span></div>
      <div className="import-format-help"><FileSpreadsheet size={18} /><span><strong>{t("contacts.import.csvHelpTitle")}</strong>{t("contacts.import.csvHelp")}</span></div>
      <Button type="button" variant="ghost" size="small" onClick={downloadCsvTemplate}><FileSpreadsheet size={14} />{t("contacts.import.downloadTemplate")}</Button>
      {busy && <p className="import-status" role="status">{t("contacts.import.loading")}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>}

    {step === "provider" && <><div className="modal-body import-provider-step">
      <p>{t("contacts.import.providerCollectionHelp")}</p>
      <div className="provider-collection-list">{providerCollections.map((collection) => <label key={collection.id}><input type="checkbox" checked={selectedProviderCollections.has(collection.id)} onChange={(event) => setSelectedProviderCollections((current) => { const next = new Set(current); if (event.target.checked) next.add(collection.id); else next.delete(collection.id); return next; })} /><span><strong>{collection.label}</strong><small>{t("contacts.import.collectionCount", { count: collection.count })}</small></span></label>)}</div>
      <p className="field-help">{t("contacts.import.providerSelectionCount", { count: providerCandidates.filter((candidate) => candidate.collectionIds?.some((collectionId) => selectedProviderCollections.has(collectionId))).length })}</p>
    </div><div className="modal-footer"><Button variant="secondary" onClick={() => setStep("source")}>{t("common.back")}</Button><Button disabled={selectedProviderCollections.size === 0} onClick={continueFromProvider}>{t("common.continue")}</Button></div></>}

    {step === "mapping" && activeSheet && <><div className="modal-body import-mapping-step">
      <p>{t("contacts.import.mappingHelp")}</p>
      <div className="form-grid">{sheets.length > 1 && <label className="field"><span>{t("contacts.import.sheet")}</span><select value={sheetIndex} onChange={(event) => { const nextIndex = Number(event.target.value); setSheetIndex(nextIndex); setHeaderRowIndex(0); setMapping(autoMapContactHeaders(sheets[nextIndex].headers)); }}>{sheets.map((sheet, index) => <option value={index} key={sheet.delimiter}>{sheet.delimiter}</option>)}</select></label>}{source === "csv" && <label className="field"><span>{t("contacts.import.delimiter")}</span><select value={delimiterOverride} onChange={(event) => void changeDelimiter(event.target.value as typeof delimiterOverride)}><option value="auto">{t("contacts.import.detectAutomatically")}</option><option value=",">{t("contacts.import.delimiterComma")}</option><option value=";">{t("contacts.import.delimiterSemicolon")}</option><option value="\t">{t("contacts.import.delimiterTab")}</option></select></label>}{baseSheet.sourceRows && baseSheet.sourceRows.length > 1 && <label className="field"><span>{t("contacts.import.headerRow")}</span><select value={headerRowIndex} onChange={(event) => { const rowIndex = Number(event.target.value); setHeaderRowIndex(rowIndex); setMapping(autoMapContactHeaders(baseSheet.sourceRows?.[rowIndex] ?? [])); }}>{baseSheet.sourceRows.slice(0, 10).map((row, index) => <option value={index} key={index}>{t("contacts.import.row", { number: index + 1 })}: {row.filter(Boolean).slice(0, 3).join(" · ") || t("contacts.import.emptyRow")}</option>)}</select></label>}</div>
      <div className="mapping-list">{activeSheet.headers.map((header, index) => <label key={`${header}-${index}`}><span>{header || t("contacts.import.unnamedColumn")}</span><select value={mapping[index] ?? "ignore"} onChange={(event) => setMapping((current) => current.map((field, fieldIndex) => fieldIndex === index ? event.target.value as ContactImportField : field))}>{FIELD_OPTIONS.map((field) => <option key={field} value={field}>{t(`contacts.import.field.${field}`)}</option>)}</select><small>{activeSheet.rows[0]?.[index] ?? "—"}</small></label>)}</div>
      {activeSheet.warnings?.map((warning) => <p className="import-warning" role="status" key={warning}>{warningLabel(warning)}</p>)}
      {mappingHasConflicts && <p className="form-error" role="alert">{t("contacts.import.mappingConflict")}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div><div className="modal-footer"><Button variant="secondary" onClick={() => setStep("source")}>{t("common.back")}</Button><Button disabled={mappingHasConflicts || busy} onClick={() => void continueFromMapping()}>{t("common.continue")}</Button></div></>}

    {step === "review" && <><div className="modal-body import-review-step">
      <div className="import-summary"><Badge tone="success">{actionCounts.create} {t("contacts.import.new")}</Badge><Badge tone="info">{actionCounts.update} {t("contacts.import.updates")}</Badge><Badge tone="warning">{actionCounts.merge} {t("contacts.import.merged")}</Badge><Badge>{actionCounts.skip} {t("contacts.import.skipped")}</Badge></div>
      <p>{t("contacts.import.reviewHelp")}</p>
      <div className="import-bulk-decisions"><span>{t("contacts.import.applyToAll")}</span><Button size="small" variant="secondary" onClick={() => setDecisions((current) => current.map((decision) => ({ ...decision, action: "create", existingContactId: undefined })))}>{t("contacts.import.create")}</Button><Button size="small" variant="secondary" disabled={database.contacts.length === 0} onClick={() => setDecisions((current) => current.map((decision) => ({ ...decision, action: "update", existingContactId: decision.existingContactId ?? matchContactImportCandidate(decision.candidate, database.contacts, database.externalContactIdentities)?.id ?? database.contacts[0]?.id })))}>{t("contacts.import.update")}</Button><Button size="small" variant="secondary" disabled={database.contacts.length === 0} onClick={() => setDecisions((current) => current.map((decision) => ({ ...decision, action: "merge", existingContactId: decision.existingContactId ?? matchContactImportCandidate(decision.candidate, database.contacts, database.externalContactIdentities)?.id ?? database.contacts[0]?.id })))}>{t("contacts.import.merge")}</Button><Button size="small" variant="secondary" onClick={() => setDecisions((current) => current.map((decision) => ({ ...decision, action: "skip", existingContactId: undefined })))}>{t("contacts.import.skip")}</Button></div>
      <div className="import-review-list">{decisions.slice(0, 300).map((decision, index) => <article key={`${decision.candidate.sourceKey}-${index}`}>
        <span><strong>{candidateDisplayName(decision.candidate) || t("contacts.import.unnamed")}</strong><small>{decision.candidate.emails[0]?.value || decision.candidate.phones[0]?.value || decision.candidate.companyName || "—"}</small>{decision.candidate.warnings.map((warning) => <small className="import-warning" key={warning}>{warningLabel(warning)}</small>)}</span>
        <select aria-label={t("contacts.import.action")} value={decision.action} onChange={(event) => updateDecision(index, event.target.value as ContactImportDecisionAction)}><option value="create">{t("contacts.import.create")}</option><option value="update">{t("contacts.import.update")}</option><option value="merge">{t("contacts.import.merge")}</option><option value="skip">{t("contacts.import.skip")}</option></select>
        {(decision.action === "update" || decision.action === "merge") && <select aria-label={t("contacts.import.match")} value={decision.existingContactId ?? ""} onChange={(event) => setDecisions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, existingContactId: event.target.value } : item))}>{database.contacts.filter((contact) => contact.lifecycle === "active").map((contact) => <option key={contact.id} value={contact.id}>{contactDisplayName(contact)}</option>)}</select>}
        {(decision.action === "update" || decision.action === "merge") && <details className="import-overwrite-fields"><summary>{t("contacts.import.overwriteFields")}</summary><div>{OVERWRITABLE_IMPORT_FIELDS.filter((field) => decision.candidate[field].trim()).map((field) => <label key={field}><input type="checkbox" checked={decision.overwriteFields?.includes(field) ?? false} onChange={() => toggleOverwriteField(index, field)} /><span>{t(`contacts.import.field.${field}`)}</span><small>{decision.candidate[field]}</small></label>)}</div></details>}
      </article>)}</div>
      {decisions.length > 300 && <p className="field-help">{t("contacts.import.previewLimited", { count: decisions.length })}</p>}
      <fieldset className="contact-fieldset"><legend>{t("contacts.import.importOptions")}</legend><div className="form-grid">
        <label className="field span-two"><span>{t("contacts.import.addTag")}</span><input value={importTag} maxLength={80} onChange={(event) => setImportTag(event.target.value)} placeholder={t("contacts.import.addTagPlaceholder")} /></label>
        <label className="field"><span>{t("contacts.import.project")}</span><select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">{t("contacts.import.noProject")}</option>{database.projects.filter((project) => project.status !== "archived").map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
        <fieldset className="contact-fieldset span-two" disabled={!projectId}><legend>{t("contacts.roles")}</legend><div className="role-checkbox-grid">{[...STANDARD_PROJECT_ROLES, "custom" as const].map((value) => <label key={value}><input type="checkbox" checked={roles.has(value)} onChange={() => toggleRole(value)} /><span>{t(`contacts.role.${value}`)}</span></label>)}</div></fieldset>
        {roles.has("custom") && projectId && <label className="field span-two"><span>{t("contacts.customRole")}</span><input value={customRole} onChange={(event) => setCustomRole(event.target.value)} /></label>}
      </div></fieldset>
    </div><div className="modal-footer"><Button variant="secondary" onClick={() => setStep(providerCandidates.length ? "provider" : sheets.length ? "mapping" : "source")}>{t("common.back")}</Button><Button disabled={Boolean(projectId) && (roles.size === 0 || (roles.has("custom") && !customRole.trim()))} onClick={() => setStep("confirm")}>{t("common.continue")}</Button></div></>}

    {step === "confirm" && <><div className="modal-body import-confirm-step"><h3>{t("contacts.import.confirmTitle")}</h3><p>{t("contacts.import.confirmHelp")}</p><dl><div><dt>{t("contacts.import.create")}</dt><dd>{actionCounts.create}</dd></div><div><dt>{t("contacts.import.update")}</dt><dd>{actionCounts.update}</dd></div><div><dt>{t("contacts.import.merge")}</dt><dd>{actionCounts.merge}</dd></div><div><dt>{t("contacts.import.skip")}</dt><dd>{actionCounts.skip}</dd></div>{importTag.trim() && <div><dt>{t("contacts.tag")}</dt><dd>{importTag.trim()}</dd></div>}{projectId && <><div><dt>{t("contacts.project")}</dt><dd>{database.projects.find((project) => project.id === projectId)?.name}</dd></div><div><dt>{t("contacts.roles")}</dt><dd>{[...roles].map((role) => role === "custom" ? customRole.trim() : t(`contacts.role.${role}`)).join(", ")}</dd></div></>}</dl></div><div className="modal-footer"><Button variant="secondary" onClick={() => setStep("review")}>{t("common.back")}</Button><Button onClick={finishImport}>{t("contacts.import.importAction", { count: actionCounts.create + actionCounts.update + actionCounts.merge })}</Button></div></>}

    {step === "result" && result && <><div className="modal-body import-result-step"><span className="import-result-icon"><Upload /></span><h3>{t("contacts.import.complete")}</h3><p>{t("contacts.import.completeTextDetailed", { created: result.created, updated: result.updated, merged: result.merged, skipped: result.skipped, failed: result.failed })}</p>{result.undone && <p className="import-status" role="status">{t("contacts.undoResult", { reverted: result.reverted ?? 0, conflicts: result.conflicts ?? 0 })}</p>}</div><div className="modal-footer">{result.skipped + result.failed > 0 && <Button variant="ghost" onClick={downloadErrorReport}>{t("contacts.import.downloadReport")}</Button>}<Button variant="secondary" disabled={result.undone} onClick={() => { const undo = undoContactImportBatch(result.batchId); setResult((current) => current ? { ...current, undone: true, reverted: undo.reverted, conflicts: undo.conflicts } : current); }}>{t("contacts.undoImport")}</Button><Button onClick={closeImport}>{t("common.close")}</Button></div></>}
  </Modal>;
}
