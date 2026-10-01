import { Cloud, FileSpreadsheet, FileUser, Upload } from "lucide-react";
import { type DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  autoMapContactHeaders,
  candidateDisplayName,
  candidatesFromDelimitedAsync,
  exportContactCsvTemplate,
  matchContactImportCandidate,
  parseDelimitedContactsAsync,
  readContactImportFile,
  sanitizeContactImportLabel,
  structuredNameForCandidate,
  type ContactImportCandidate,
  type ContactImportField,
  type ContactTextEncoding,
  type DelimitedImportData,
} from "../domain/contactImport";
import {
  type ContactImportDecision,
  type ContactImportDecisionAction,
  type ContactImportOverwriteField,
} from "../domain/contactImportCommit";
import { companyForContact, contactDisplayName, normalizeEmail, normalizePhone, primaryAffiliation } from "../domain/contacts";
import type { AppDatabase, Contact, ContactSource } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { importGoogleContacts, importMicrosoftContacts, type ContactProviderCollection } from "../integrations/contactProviders";
import { useApp } from "../state/AppProvider";
import { Button, Modal } from "./Ui";

const FIELD_OPTIONS: ContactImportField[] = [
  "ignore", "fullName", "givenName", "familyName", "prefix", "suffix", "companyName", "jobTitle", "department",
  "email", "phone", "street", "postalCode", "city", "region", "country", "notes", "tags",
];
const SINGLETON_IMPORT_FIELDS = new Set<ContactImportField>(FIELD_OPTIONS.filter((field) => !["ignore", "email", "phone", "tags"].includes(field)));
const MERGE_FIELDS: ContactImportOverwriteField[] = [
  "prefix", "givenName", "familyName", "suffix", "companyName", "jobTitle", "department",
  "emails", "phones", "addresses", "notes", "tags",
];

type ImportStep = "source" | "provider" | "mapping" | "review";
type ContactImportReviewAction = ContactImportDecisionAction | "resolve";
interface ContactImportReviewDecision extends Omit<ContactImportDecision, "action"> {
  action: ContactImportReviewAction;
}

function createDecisions(candidates: ContactImportCandidate[], contacts: Contact[]): ContactImportReviewDecision[] {
  return candidates.map((candidate) => {
    const existing = matchContactImportCandidate(candidate, contacts);
    const hasIdentity = Boolean(candidateDisplayName(candidate) || candidate.emails.length || candidate.phones.length);
    return { candidate, action: !hasIdentity ? "skip" : existing ? "resolve" : "create", existingContactId: existing?.id };
  });
}

function joinedValues(values: Array<{ value: string }>): string {
  return values.map((item) => item.value.trim()).filter(Boolean).join(" · ");
}

function addressValue(addresses: Array<{ street: string; postalCode: string; city: string; region: string; country: string }>): string {
  return addresses.map((address) => [address.street, address.postalCode, address.city, address.region, address.country]
    .map((part) => part.trim()).filter(Boolean).join(", ")).filter(Boolean).join(" · ");
}

function importedFieldValue(candidate: ContactImportCandidate, field: ContactImportOverwriteField): string {
  if (field === "emails") return joinedValues(candidate.emails);
  if (field === "phones") return joinedValues(candidate.phones);
  if (field === "addresses") return addressValue(candidate.addresses);
  if (field === "tags") return candidate.tags.join(" · ");
  if (field === "prefix" || field === "givenName" || field === "familyName" || field === "suffix") return structuredNameForCandidate(candidate)[field];
  return candidate[field];
}

function existingFieldValue(database: AppDatabase, contact: Contact, field: ContactImportOverwriteField): string {
  const affiliation = primaryAffiliation(database, contact.id);
  if (field === "companyName") return companyForContact(database, contact.id)?.name ?? "";
  if (field === "jobTitle") return affiliation?.jobTitle ?? "";
  if (field === "department") return affiliation?.department ?? "";
  if (field === "emails") return joinedValues(contact.emails);
  if (field === "phones") return joinedValues(contact.phones);
  if (field === "addresses") return addressValue(contact.addresses);
  if (field === "tags") return contact.tags.join(" · ");
  return contact[field];
}

function mergeFieldTranslationKey(field: ContactImportOverwriteField): string {
  if (field === "emails") return "email";
  if (field === "phones") return "phone";
  return field;
}

function normalizedMergeValue(field: ContactImportOverwriteField, value: string): string {
  const parts = value.split(" · ").map((part) => part.trim()).filter(Boolean);
  if (field === "emails") return parts.map(normalizeEmail).filter(Boolean).sort().join("|");
  if (field === "phones") return parts.map(normalizePhone).filter(Boolean).sort().join("|");
  if (field === "tags") return parts.map((part) => part.toLocaleLowerCase()).sort().join("|");
  return value.trim().replace(/\s+/g, " ");
}

function mergeFieldDiffers(field: ContactImportOverwriteField, existingValue: string, importedValue: string): boolean {
  if (!importedValue.trim()) return false;
  return normalizedMergeValue(field, existingValue) !== normalizedMergeValue(field, importedValue);
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

export function ContactImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported?: (contactIds: string[]) => void }) {
  const { database, commitContactImport, recordContactProviderEvent } = useApp();
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
  const [decisions, setDecisions] = useState<ContactImportReviewDecision[]>([]);
  const [providerCandidates, setProviderCandidates] = useState<ContactImportCandidate[]>([]);
  const [providerCollections, setProviderCollections] = useState<ContactProviderCollection[]>([]);
  const [selectedProviderCollections, setSelectedProviderCollections] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const importCount = useMemo(() => decisions.filter((decision) => decision.action !== "skip" && decision.action !== "resolve").length, [decisions]);
  const pendingImportCount = useMemo(() => decisions.filter((decision) => decision.action !== "skip").length, [decisions]);
  const unresolvedCount = useMemo(() => decisions.filter((decision) => decision.action === "resolve").length, [decisions]);
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
    setDecisions(createDecisions(candidates, database.contacts.filter((contact) => contact.lifecycle === "active")));
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

  const updateDecision = (index: number, action: Extract<ContactImportDecisionAction, "update" | "merge" | "skip">) => setDecisions((current) => current.map((decision, decisionIndex) => {
    if (decisionIndex !== index) return decision;
    const existingContact = database.contacts.find((contact) => contact.id === decision.existingContactId);
    const overwriteFields = action === "merge" && existingContact
      ? MERGE_FIELDS.filter((field) => importedFieldValue(decision.candidate, field) && !existingFieldValue(database, existingContact, field))
      : undefined;
    return { ...decision, action, overwriteFields };
  }));

  const chooseMergeField = (decisionIndex: number, field: ContactImportOverwriteField, useImportedValue: boolean) => setDecisions((current) => current.map((decision, index) => {
    if (index !== decisionIndex) return decision;
    const selected = new Set(decision.overwriteFields ?? []);
    if (useImportedValue) selected.add(field); else selected.delete(field);
    return { ...decision, overwriteFields: [...selected] };
  }));

  const finishImport = () => {
    if (unresolvedCount > 0) return;
    const resolvedDecisions = decisions.map<ContactImportDecision>((decision) => {
      if (decision.action === "resolve") throw new Error("unresolved_contact_import");
      return { ...decision, action: decision.action };
    });
    const batch = commitContactImport({
      source,
      sourceLabel,
      decisions: resolvedDecisions,
    });
    const contactIds = batch.items.flatMap((item) => item.contactId && (item.action === "created" || item.action === "updated" || item.action === "merged") ? [item.contactId] : []);
    onImported?.([...new Set(contactIds)]);
    onClose();
  };
  const downloadCsvTemplate = () => {
    const url = URL.createObjectURL(new Blob([exportContactCsvTemplate(locale)], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "quicksige-contacts-template.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const closeImport = () => {
    providerAbortController.current?.abort();
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
      <div className="import-review-list">{decisions.slice(0, 300).map((decision, index) => {
        const existingContact = database.contacts.find((contact) => contact.id === decision.existingContactId);
        const importedDetails = [decision.candidate.companyName, joinedValues(decision.candidate.emails), joinedValues(decision.candidate.phones)].filter(Boolean).join(" · ");
        const existingDetails = existingContact
          ? [companyForContact(database, existingContact.id)?.name, joinedValues(existingContact.emails), joinedValues(existingContact.phones)].filter(Boolean).join(" · ")
          : "";
        return <article className={existingContact ? "import-review-contact has-duplicate" : "import-review-contact"} key={`${decision.candidate.sourceKey}-${index}`}>
          <div className="import-review-identity">
            <span><strong>{candidateDisplayName(decision.candidate) || t("contacts.import.unnamed")}</strong><small>{importedDetails || "—"}</small></span>
            {decision.candidate.warnings.map((warning) => <small className="import-warning" key={warning}>{warningLabel(warning)}</small>)}
          </div>
          {existingContact && <div className="import-duplicate-review">
            <p>{t("contacts.import.duplicateFound")}</p>
            <div className="import-duplicate-comparison">
              <div><small>{t("contacts.import.existingContact")}</small><strong>{contactDisplayName(existingContact) || t("contacts.import.unnamed")}</strong><span>{existingDetails || "—"}</span></div>
              <div><small>{t("contacts.import.importedContact")}</small><strong>{candidateDisplayName(decision.candidate) || t("contacts.import.unnamed")}</strong><span>{importedDetails || "—"}</span></div>
            </div>
            <div className="import-resolution-actions" role="group" aria-label={t("contacts.import.duplicateAction", { name: candidateDisplayName(decision.candidate) || t("contacts.import.unnamed") })}>
              <button type="button" className={decision.action === "update" ? "is-selected" : ""} aria-pressed={decision.action === "update"} onClick={() => updateDecision(index, "update")}>{t("contacts.import.update")}</button>
              <button type="button" className={decision.action === "merge" ? "is-selected" : ""} aria-pressed={decision.action === "merge"} onClick={() => updateDecision(index, "merge")}>{t("contacts.import.merge")}</button>
              <button type="button" className={decision.action === "skip" ? "is-selected" : ""} aria-pressed={decision.action === "skip"} onClick={() => updateDecision(index, "skip")}>{t("contacts.import.doNotImport")}</button>
            </div>
            {decision.action === "merge" && <div className="import-merge-fields">
              {MERGE_FIELDS.filter((field) => mergeFieldDiffers(
                field,
                existingFieldValue(database, existingContact, field),
                importedFieldValue(decision.candidate, field),
              )).map((field) => {
                const existingValue = existingFieldValue(database, existingContact, field);
                const importedValue = importedFieldValue(decision.candidate, field);
                const useImportedValue = decision.overwriteFields?.includes(field) ?? false;
                return <fieldset key={field}>
                  <legend>{t(`contacts.import.field.${mergeFieldTranslationKey(field)}`)}</legend>
                  <label><input type="radio" name={`import-merge-${index}-${field}`} checked={!useImportedValue} onChange={() => chooseMergeField(index, field, false)} /><span><strong>{t("contacts.import.existingValue")}</strong><small>{existingValue || "—"}</small></span></label>
                  <label><input type="radio" name={`import-merge-${index}-${field}`} checked={useImportedValue} onChange={() => chooseMergeField(index, field, true)} /><span><strong>{t("contacts.import.importedValue")}</strong><small>{importedValue}</small></span></label>
                </fieldset>;
              })}
            </div>}
          </div>}
        </article>;
      })}</div>
      {decisions.length > 300 && <p className="field-help">{t("contacts.import.previewLimited", { count: decisions.length })}</p>}
    </div><div className="modal-footer"><Button variant="secondary" onClick={() => setStep(providerCandidates.length ? "provider" : sheets.length ? "mapping" : "source")}>{t("common.back")}</Button><Button disabled={unresolvedCount > 0 || importCount === 0} onClick={finishImport}>{pendingImportCount === 1 ? t("contacts.import.importOneAction") : t("contacts.import.importAction", { count: pendingImportCount })}</Button></div></>}
  </Modal>;
}
