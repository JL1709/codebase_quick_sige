import {
  Archive, Building2, Copy, Download, History, Mail, Merge, Phone, Plus, RotateCcw, Search, Tag, Trash2, Upload, UserRound, Users,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { CompanyFormModal, ContactFormModal } from "../components/ContactFormModal";
import { ContactImportModal } from "../components/ContactImportModal";
import { Badge, Button, EmptyState, Modal, PageHeader } from "../components/Ui";
import { exportCandidatesCsv, exportCandidatesVCard, type ContactImportCandidate } from "../domain/contactImport";
import { buildContactsDataExport } from "../domain/contactPrivacyExport";
import { companyForContact, contactDisplayName, normalizedContactSearchText, primaryEmail, primaryPhone } from "../domain/contacts";
import type { Company, Contact, ProjectParticipantRole, RecordLifecycle } from "../domain/types";
import { useI18n } from "../i18n/I18nProvider";
import { useApp, type CompanyMergeResolution, type ContactMergeResolution } from "../state/AppProvider";
import { NotFoundPage } from "./NotFoundPage";
import { copyTextToClipboard } from "../utils/clipboard";

type ContactTab = "people" | "companies";
type ContactSort = "name" | "company" | "updated" | "created" | "project_count";
type ContactColumn = "company" | "details" | "projects" | "source" | "updated";
type ContactMergeField = "prefix" | "givenName" | "familyName" | "suffix" | "displayName" | "notes";
type CompanyMergeField = "website" | "domain" | "email" | "phone" | "address" | "notes";
type ArchiveRequest = { kind: "contact" | "company"; ids: string[] };
interface ContactWorkspacePreferences {
  tab: ContactTab;
  lifecycle: RecordLifecycle | "all";
  companyId: string;
  tag: string;
  completeness: "all" | "complete" | "incomplete";
  projectId: string;
  role: ProjectParticipantRole | "all";
  sort: ContactSort;
  visibleColumns: ContactColumn[];
}
const CONTACT_PAGE_SIZE = 100;
const DEFAULT_CONTACT_COLUMNS: ContactColumn[] = ["company", "details", "projects"];
const CONTACT_COLUMNS: ContactColumn[] = ["company", "details", "projects", "source", "updated"];
const CONTACT_MERGE_FIELDS: ContactMergeField[] = ["prefix", "givenName", "familyName", "suffix", "displayName", "notes"];
const COMPANY_MERGE_FIELDS: CompanyMergeField[] = ["website", "domain", "email", "phone", "address", "notes"];

function readWorkspacePreferences(userId: string): Partial<ContactWorkspacePreferences> {
  try {
    return JSON.parse(window.localStorage.getItem(`quicksige.contacts.preferences.${userId}`) ?? "{}") as Partial<ContactWorkspacePreferences>;
  } catch {
    return {};
  }
}

function downloadText(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function mergeValueLabel(value: unknown): string {
  if (!value) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).filter((part) => typeof part === "string" && part.trim()).join(", ") || "—";
  return String(value);
}

function contactCandidate(contact: Contact, company?: Company, jobTitle = "", department = ""): ContactImportCandidate {
  return {
    sourceKey: contact.id,
    prefix: contact.prefix, givenName: contact.givenName, familyName: contact.familyName, suffix: contact.suffix,
    displayName: contactDisplayName(contact), companyName: company?.name ?? "", jobTitle, department,
    emails: contact.emails.map(({ value, type, primary }) => ({ value, type, primary })),
    phones: contact.phones.map(({ value, type, primary }) => ({ value, type, primary })),
    addresses: contact.addresses.map(({ type, street, postalCode, city, region, country, primary }) => ({ type, street, postalCode, city, region, country, primary })),
    notes: contact.notes, tags: contact.tags, warnings: [],
  };
}

export function ContactsPage() {
  const { contactId: routeContactId = "", companyId: routeCompanyId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    database, archiveContact, restoreContact, deleteContact, mergeContacts, tagContacts, assignContactsToProject,
    archiveCompany, restoreCompany, deleteCompany, mergeCompanies, undoContactImportBatch, recordContactExport,
  } = useApp();
  const { t, formatDate } = useI18n();
  const savedPreferences = useMemo(() => readWorkspacePreferences(database.user.id), [database.user.id]);
  const [tab, setTab] = useState<ContactTab>(() => location.pathname.includes("/contacts/companies") ? "companies" : "people");
  const [query, setQuery] = useState("");
  const [lifecycle, setLifecycle] = useState<RecordLifecycle | "all">(savedPreferences.lifecycle ?? "active");
  const [companyId, setCompanyId] = useState(savedPreferences.companyId ?? "");
  const [tag, setTag] = useState(savedPreferences.tag ?? "");
  const [completeness, setCompleteness] = useState<"all" | "complete" | "incomplete">(savedPreferences.completeness ?? "all");
  const [projectId, setProjectId] = useState(savedPreferences.projectId ?? "");
  const [role, setRole] = useState<ProjectParticipantRole | "all">(savedPreferences.role ?? "all");
  const [sort, setSort] = useState<ContactSort>(savedPreferences.sort ?? "name");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewContactId, setPreviewContactId] = useState(routeContactId);
  const [editingContact, setEditingContact] = useState<Contact | undefined>();
  const [contactFormOpen, setContactFormOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | undefined>();
  const [companyFormOpen, setCompanyFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [companyMergeOpen, setCompanyMergeOpen] = useState(false);
  const [companyMergeTargetId, setCompanyMergeTargetId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTag, setBulkTag] = useState("");
  const [bulkProjectOpen, setBulkProjectOpen] = useState(false);
  const [bulkProjectId, setBulkProjectId] = useState("");
  const [bulkRole, setBulkRole] = useState<ProjectParticipantRole>("contractor");
  const [bulkCustomRole, setBulkCustomRole] = useState("");
  const [contactMergeSources, setContactMergeSources] = useState<Partial<Record<ContactMergeField, string>>>({});
  const [companyMergeSources, setCompanyMergeSources] = useState<Partial<Record<CompanyMergeField, string>>>({});
  const [deleteContactId, setDeleteContactId] = useState("");
  const [deleteCompanyId, setDeleteCompanyId] = useState("");
  const [archiveRequest, setArchiveRequest] = useState<ArchiveRequest>();
  const [deleteError, setDeleteError] = useState("");
  const [visibleCount, setVisibleCount] = useState(CONTACT_PAGE_SIZE);
  const [undoMessage, setUndoMessage] = useState("");
  const [visibleColumns, setVisibleColumns] = useState<Set<ContactColumn>>(() => {
    try {
      const saved = savedPreferences.visibleColumns
        ?? JSON.parse(window.localStorage.getItem(`quicksige.contacts.columns.${database.user.id}`) ?? "null") as ContactColumn[] | null;
      if (saved === null || saved === undefined) return new Set(DEFAULT_CONTACT_COLUMNS);
      return new Set(saved.filter((column) => CONTACT_COLUMNS.includes(column)));
    } catch {
      return new Set(DEFAULT_CONTACT_COLUMNS);
    }
  });
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const canManageContacts = database.user.role !== "viewer";
  useEffect(() => {
    const nextTab = location.pathname.includes("/contacts/companies") ? "companies" : "people";
    setTab(nextTab);
    if (routeContactId) setPreviewContactId(routeContactId);
  }, [location.pathname, routeContactId]);
  useEffect(() => {
    if (tab === "companies" && (sort === "company" || sort === "project_count")) setSort("name");
  }, [sort, tab]);
  useEffect(() => {
    const preferences: ContactWorkspacePreferences = {
      tab, lifecycle, companyId, tag, completeness, projectId, role, sort, visibleColumns: [...visibleColumns],
    };
    window.localStorage.setItem(`quicksige.contacts.preferences.${database.user.id}`, JSON.stringify(preferences));
  }, [companyId, completeness, database.user.id, lifecycle, projectId, role, sort, tab, tag, visibleColumns]);
  useEffect(() => setVisibleCount(CONTACT_PAGE_SIZE), [companyId, completeness, lifecycle, projectId, query, role, sort, tab, tag]);

  const availableTags = useMemo(() => [...new Set([
    ...database.contacts.flatMap((contact) => contact.tags),
    ...database.companies.flatMap((company) => company.tags),
  ])].sort((left, right) => left.localeCompare(right)), [database.companies, database.contacts]);

  const filteredContacts = useMemo(() => database.contacts.filter((contact) => {
    if (lifecycle !== "all" && contact.lifecycle !== lifecycle) return false;
    const assignments = database.projectContactAssignments.filter((assignment) => assignment.contactId === contact.id && assignment.lifecycle === "active");
    if (companyId && companyForContact(database, contact.id)?.id !== companyId) return false;
    if (tag && !contact.tags.includes(tag)) return false;
    const hasContactMethod = contact.emails.length > 0 || contact.phones.length > 0;
    if (completeness === "complete" && !hasContactMethod) return false;
    if (completeness === "incomplete" && hasContactMethod) return false;
    if (projectId && !assignments.some((assignment) => assignment.projectId === projectId)) return false;
    if (role !== "all" && !assignments.some((assignment) => assignment.roles.some((candidateRole) => candidateRole.role === role))) return false;
    return !deferredQuery || normalizedContactSearchText(database, contact).includes(deferredQuery);
  }).sort((left, right) => {
    if (sort === "updated") return right.updatedAt.localeCompare(left.updatedAt);
    if (sort === "created") return right.createdAt.localeCompare(left.createdAt);
    if (sort === "project_count") {
      const assignmentCount = (contact: Contact) => database.projectContactAssignments.filter((assignment) => assignment.contactId === contact.id && assignment.lifecycle === "active").length;
      return assignmentCount(right) - assignmentCount(left) || contactDisplayName(left).localeCompare(contactDisplayName(right));
    }
    if (sort === "company") return (companyForContact(database, left.id)?.name ?? "").localeCompare(companyForContact(database, right.id)?.name ?? "");
    return contactDisplayName(left).localeCompare(contactDisplayName(right));
  }), [companyId, completeness, database, deferredQuery, lifecycle, projectId, role, sort, tag]);

  const filteredCompanies = useMemo(() => database.companies.filter((company) => (
    (lifecycle === "all" || company.lifecycle === lifecycle)
    && (!tag || company.tags.includes(tag))
    && (!deferredQuery || [company.name, company.domain, company.email, company.phone, ...company.tags].join(" ").toLocaleLowerCase().includes(deferredQuery))
  )).sort((left, right) => sort === "updated" ? right.updatedAt.localeCompare(left.updatedAt) : sort === "created" ? right.createdAt.localeCompare(left.createdAt) : left.name.localeCompare(right.name)), [database.companies, deferredQuery, lifecycle, sort, tag]);

  const previewContact = database.contacts.find((contact) => contact.id === previewContactId) ?? filteredContacts[0];
  const previewCompany = database.companies.find((company) => company.id === routeCompanyId) ?? filteredCompanies[0];
  const visibleContacts = filteredContacts.slice(0, visibleCount);
  const visibleCompanies = filteredCompanies.slice(0, visibleCount);
  const selectedContacts = filteredContacts.filter((contact) => selectedIds.has(contact.id));
  const selectedCompanies = filteredCompanies.filter((company) => selectedIds.has(company.id));
  const peopleGridColumns = [
    "28px",
    "minmax(190px, 1.3fr)",
    visibleColumns.has("company") && "minmax(120px, .8fr)",
    visibleColumns.has("details") && "minmax(160px, 1fr)",
    visibleColumns.has("projects") && "70px",
    visibleColumns.has("source") && "90px",
    visibleColumns.has("updated") && "100px",
  ].filter(Boolean).join(" ");

  if ((routeContactId && !database.contacts.some((contact) => contact.id === routeContactId))
    || (routeCompanyId && !database.companies.some((company) => company.id === routeCompanyId))) return <NotFoundPage />;

  const toggleSelection = (contactId: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(contactId)) next.delete(contactId); else next.add(contactId);
    return next;
  });
  const openNew = () => {
    if (tab === "people") { setEditingContact(undefined); setContactFormOpen(true); }
    else { setEditingCompany(undefined); setCompanyFormOpen(true); }
  };
  const exportContactRecords = (contacts: Contact[], format: "csv" | "vcf") => {
    if (!canManageContacts) return;
    const candidates = contacts.map((contact) => {
      const affiliation = database.contactAffiliations.find((candidate) => candidate.contactId === contact.id && candidate.primary);
      return contactCandidate(contact, companyForContact(database, contact.id), affiliation?.jobTitle, affiliation?.department);
    });
    downloadText(
      format === "csv" ? exportCandidatesCsv(candidates) : exportCandidatesVCard(candidates),
      `quicksige-contacts-${new Date().toISOString().slice(0, 10)}.${format}`,
      format === "csv" ? "text/csv;charset=utf-8" : "text/vcard;charset=utf-8",
    );
    recordContactExport(format === "csv" ? "csv" : "vcard", contacts.length);
  };
  const exportContacts = (format: "csv" | "vcf") => exportContactRecords(selectedContacts.length ? selectedContacts : filteredContacts, format);
  const exportPortableData = () => {
    if (!canManageContacts) return;
    const contactIds = tab === "people" ? (selectedContacts.length ? selectedContacts : filteredContacts).map((contact) => contact.id) : undefined;
    const companyIds = tab === "companies" ? (selectedCompanies.length ? selectedCompanies : filteredCompanies).map((company) => company.id) : undefined;
    const exported = buildContactsDataExport(database, { contactIds, companyIds });
    downloadText(JSON.stringify(exported, null, 2), `quicksige-contacts-data-${new Date().toISOString().slice(0, 10)}.json`, "application/json;charset=utf-8");
    recordContactExport("json", exported.contacts.length + exported.companies.length);
  };
  const openContactMerge = () => {
    const survivorId = selectedContacts[0]?.id ?? "";
    setMergeTargetId(survivorId);
    setContactMergeSources(Object.fromEntries(CONTACT_MERGE_FIELDS.map((field) => [field, survivorId])));
    setMergeOpen(true);
  };
  const openCompanyMerge = () => {
    const survivorId = selectedCompanies[0]?.id ?? "";
    setCompanyMergeTargetId(survivorId);
    setCompanyMergeSources(Object.fromEntries(COMPANY_MERGE_FIELDS.map((field) => [field, survivorId])));
    setCompanyMergeOpen(true);
  };
  const confirmContactMerge = () => {
    const merged = selectedContacts.find((contact) => contact.id !== mergeTargetId);
    const resolution = Object.fromEntries(CONTACT_MERGE_FIELDS.map((field) => {
      const source = selectedContacts.find((contact) => contact.id === contactMergeSources[field]);
      return [field, source?.[field]];
    })) as ContactMergeResolution;
    if (merged) mergeContacts(mergeTargetId, merged.id, resolution);
    setSelectedIds(new Set([mergeTargetId]));
    setMergeOpen(false);
  };
  const confirmCompanyMerge = () => {
    const merged = selectedCompanies.find((company) => company.id !== companyMergeTargetId);
    const resolution = Object.fromEntries(COMPANY_MERGE_FIELDS.map((field) => {
      const selectedCompany = selectedCompanies.find((company) => company.id === companyMergeSources[field]);
      return [field, selectedCompany?.[field]];
    })) as CompanyMergeResolution;
    if (merged) mergeCompanies(companyMergeTargetId, merged.id, resolution);
    setSelectedIds(new Set([companyMergeTargetId]));
    setCompanyMergeOpen(false);
  };
  const confirmLifecycleChange = () => {
    if (!archiveRequest) return;
    if (archiveRequest.kind === "contact") archiveRequest.ids.forEach((id) => {
      const contact = database.contacts.find((candidate) => candidate.id === id);
      if (contact?.lifecycle === "active") archiveContact(id); else if (contact) restoreContact(id);
    });
    else archiveRequest.ids.forEach((id) => {
      const company = database.companies.find((candidate) => candidate.id === id);
      if (company?.lifecycle === "active") archiveCompany(id); else if (company) restoreCompany(id);
    });
    setArchiveRequest(undefined);
    setSelectedIds(new Set());
  };

  return <div className="page contacts-page">
    <PageHeader eyebrow={t("contacts.eyebrow")} title={t("contacts.title")} description={t("contacts.subtitle")} action={<>
      <Button variant="secondary" onClick={() => setHistoryOpen(true)}><History size={16} />{t("contacts.importHistory")}</Button>
      <Button variant="secondary" disabled={!canManageContacts} onClick={() => setImportOpen(true)}><Upload size={16} />{t("contacts.import.action")}</Button>
      <Button disabled={!canManageContacts} onClick={openNew}><Plus size={16} />{t(tab === "people" ? "contacts.newContact" : "contacts.newCompany")}</Button>
    </>} />

    <div className="contacts-tabs" role="tablist">
      <button role="tab" aria-selected={tab === "people"} className={tab === "people" ? "is-active" : ""} onClick={() => { setTab("people"); setSelectedIds(new Set()); navigate("/contacts"); }}><Users size={17} />{t("contacts.people")}<Badge>{database.contacts.filter((contact) => contact.lifecycle === "active").length}</Badge></button>
      <button role="tab" aria-selected={tab === "companies"} className={tab === "companies" ? "is-active" : ""} onClick={() => { setTab("companies"); setSelectedIds(new Set()); navigate("/contacts/companies"); }}><Building2 size={17} />{t("contacts.companies")}<Badge>{database.companies.filter((company) => company.lifecycle === "active").length}</Badge></button>
    </div>

    <section className="panel contacts-toolbar">
      <div className="search-shell"><Search size={16} /><input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("contacts.searchPlaceholder")} /></div>
      <select aria-label={t("contacts.lifecycle")} value={lifecycle} onChange={(event) => setLifecycle(event.target.value as RecordLifecycle | "all")}><option value="active">{t("contacts.active")}</option><option value="archived">{t("common.archived")}</option><option value="all">{t("contacts.all")}</option></select>
      {tab === "people" && <><select aria-label={t("contacts.company")} value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="">{t("contacts.allCompanies")}</option>{database.companies.filter((company) => company.lifecycle === "active").map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><select aria-label={t("contacts.project")} value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">{t("contacts.allProjects")}</option>{database.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><select aria-label={t("contacts.role")} value={role} onChange={(event) => setRole(event.target.value as ProjectParticipantRole | "all")}><option value="all">{t("contacts.allRoles")}</option>{(["client", "owner", "coordinator", "architect", "planner", "site_manager", "contractor", "custom"] as ProjectParticipantRole[]).map((value) => <option key={value} value={value}>{t(`contacts.role.${value}`)}</option>)}</select><select aria-label={t("contacts.completeness")} value={completeness} onChange={(event) => setCompleteness(event.target.value as typeof completeness)}><option value="all">{t("contacts.allRecords")}</option><option value="complete">{t("contacts.complete")}</option><option value="incomplete">{t("contacts.incomplete")}</option></select></>}
      <select aria-label={t("contacts.tags")} value={tag} onChange={(event) => setTag(event.target.value)}><option value="">{t("contacts.allTags")}</option>{availableTags.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      <select aria-label={t("contacts.sort")} value={sort} onChange={(event) => setSort(event.target.value as ContactSort)}><option value="name">{t("contacts.sort.name")}</option>{tab === "people" && <option value="company">{t("contacts.sort.company")}</option>}<option value="updated">{t("contacts.sort.updated")}</option><option value="created">{t("contacts.sort.created")}</option>{tab === "people" && <option value="project_count">{t("contacts.sort.projectCount")}</option>}</select>
      {tab === "people" && <details className="contacts-column-picker"><summary>{t("contacts.columns")}</summary><div>{(["company", "details", "projects", "source", "updated"] as ContactColumn[]).map((column) => <label key={column}><input type="checkbox" checked={visibleColumns.has(column)} onChange={(event) => setVisibleColumns((current) => { const next = new Set(current); if (event.target.checked) next.add(column); else next.delete(column); return next; })} />{t(`contacts.column.${column}`)}</label>)}</div></details>}
    </section>

    {tab === "people" && selectedIds.size > 0 && <div className="contacts-bulk-bar"><strong>{t("contacts.selected", { count: selectedIds.size })}</strong><Button size="small" variant="secondary" disabled={!canManageContacts} onClick={() => setBulkProjectOpen(true)}><Users size={14} />{t("contacts.bulkAddProject")}</Button><Button size="small" variant="secondary" disabled={!canManageContacts} onClick={() => setBulkTagOpen(true)}><Tag size={14} />{t("contacts.bulkTag")}</Button><Button size="small" variant="secondary" disabled={!canManageContacts} onClick={() => exportContacts("csv")}><Download size={14} />CSV</Button><Button size="small" variant="secondary" disabled={!canManageContacts} onClick={() => exportContacts("vcf")}><Download size={14} />vCard</Button><Button size="small" variant="secondary" disabled={!canManageContacts} onClick={exportPortableData}><Download size={14} />JSON</Button>{selectedIds.size === 2 && <Button size="small" variant="secondary" disabled={!canManageContacts} onClick={openContactMerge}><Merge size={14} />{t("contacts.reviewDuplicates")}</Button>}<Button size="small" variant="ghost" disabled={!canManageContacts} onClick={() => setArchiveRequest({ kind: "contact", ids: selectedContacts.map((contact) => contact.id) })}><Archive size={14} />{lifecycle === "archived" ? t("common.restore") : t("common.archive")}</Button></div>}
    {tab === "companies" && selectedIds.size > 0 && <div className="contacts-bulk-bar"><strong>{t("contacts.selected", { count: selectedIds.size })}</strong><Button size="small" variant="secondary" disabled={!canManageContacts} onClick={exportPortableData}><Download size={14} />JSON</Button>{selectedIds.size === 2 && <Button size="small" variant="secondary" disabled={!canManageContacts} onClick={openCompanyMerge}><Merge size={14} />{t("contacts.reviewDuplicates")}</Button>}<Button size="small" variant="ghost" disabled={!canManageContacts} onClick={() => setArchiveRequest({ kind: "company", ids: selectedCompanies.map((company) => company.id) })}><Archive size={14} />{lifecycle === "archived" ? t("common.restore") : t("common.archive")}</Button></div>}

    {tab === "people" ? <div className="contacts-layout">
      <section className="panel contacts-table-panel">
        {filteredContacts.length === 0 ? <EmptyState icon={<UserRound />} title={t("contacts.none")} text={t("contacts.noneText")} action={<Button onClick={openNew}><Plus size={15} />{t("contacts.newContact")}</Button>} /> : <div className="contacts-table">
          <div className="contacts-table-head" style={{ gridTemplateColumns: peopleGridColumns }}><label><input type="checkbox" aria-label={t("contacts.selectAll")} checked={filteredContacts.length > 0 && filteredContacts.every((contact) => selectedIds.has(contact.id))} onChange={(event) => setSelectedIds(event.target.checked ? new Set(filteredContacts.map((contact) => contact.id)) : new Set())} /></label><span>{t("contacts.person")}</span>{visibleColumns.has("company") && <span>{t("contacts.company")}</span>}{visibleColumns.has("details") && <span>{t("contacts.contactDetails")}</span>}{visibleColumns.has("projects") && <span>{t("contacts.projects")}</span>}{visibleColumns.has("source") && <span>{t("contacts.source")}</span>}{visibleColumns.has("updated") && <span>{t("contacts.updatedColumn")}</span>}</div>
          {visibleContacts.map((contact) => {
            const company = companyForContact(database, contact.id);
            const assignments = database.projectContactAssignments.filter((assignment) => assignment.contactId === contact.id && assignment.lifecycle === "active");
            return <article className={`contacts-table-row ${previewContact?.id === contact.id ? "is-active" : ""}`} style={{ gridTemplateColumns: peopleGridColumns }} key={contact.id}>
              <label><input type="checkbox" aria-label={t("contacts.selectContact", { name: contactDisplayName(contact) })} checked={selectedIds.has(contact.id)} onChange={() => toggleSelection(contact.id)} /></label>
              <button type="button" className="contact-identity contact-row-open" onClick={() => { setPreviewContactId(contact.id); navigate(`/contacts/people/${contact.id}`); }}><i>{contactDisplayName(contact).slice(0, 1).toUpperCase()}</i><span><strong>{contactDisplayName(contact)}</strong><small>{contact.tags.join(" · ") || t(`contacts.source.${contact.source}`)}</small></span></button>
              {visibleColumns.has("company") && <span>{company?.name || "—"}</span>}
              {visibleColumns.has("details") && <span><small>{primaryEmail(contact)?.value || "—"}</small><small>{primaryPhone(contact)?.value || ""}</small></span>}
              {visibleColumns.has("projects") && <span>{assignments.length ? <Badge tone="info">{assignments.length}</Badge> : "—"}</span>}
              {visibleColumns.has("source") && <span>{t(`contacts.source.${contact.source}`)}</span>}
              {visibleColumns.has("updated") && <span>{formatDate(contact.updatedAt)}</span>}
            </article>;
          })}{visibleCount < filteredContacts.length && <div className="contacts-load-more"><Button variant="secondary" size="small" onClick={() => setVisibleCount((current) => current + CONTACT_PAGE_SIZE)}>{t("contacts.showMore", { remaining: filteredContacts.length - visibleCount })}</Button></div>}
        </div>}
      </section>
      {previewContact && <ContactPreview contact={previewContact} canManage={canManageContacts} onEdit={() => { setEditingContact(previewContact); setContactFormOpen(true); }} onAddToProject={() => { setSelectedIds(new Set([previewContact.id])); setBulkProjectOpen(true); }} onExport={() => exportContactRecords([previewContact], "vcf")} onToggleLifecycle={() => setArchiveRequest({ kind: "contact", ids: [previewContact.id] })} onDelete={() => { setDeleteError(""); setDeleteContactId(previewContact.id); }} />}
    </div> : <div className="contacts-layout"><section className="panel contacts-table-panel">
      {filteredCompanies.length === 0 ? <EmptyState icon={<Building2 />} title={t("contacts.noCompanies")} text={t("contacts.noCompaniesText")} action={<Button onClick={openNew}><Plus size={15} />{t("contacts.newCompany")}</Button>} /> : <><div className="company-grid">{visibleCompanies.map((company) => {
        const contactCount = database.contactAffiliations.filter((affiliation) => affiliation.companyId === company.id && affiliation.lifecycle === "active").length;
        return <article className={previewCompany?.id === company.id ? "is-active" : ""} key={company.id}><label className="company-select"><input type="checkbox" aria-label={t("contacts.selectCompany", { name: company.name })} checked={selectedIds.has(company.id)} onChange={() => toggleSelection(company.id)} /></label><span className="company-icon"><Building2 /></span><button type="button" className="company-open" onClick={() => navigate(`/contacts/companies/${company.id}`)}><strong>{company.name}</strong><small>{company.domain || company.website || "—"}</small></button><Badge tone="info">{t("contacts.peopleCount", { count: contactCount })}</Badge><p>{company.email || company.phone || t(`contacts.source.${company.source}`)}</p><div className="row-actions"><Button size="small" variant="secondary" disabled={!canManageContacts} onClick={() => { setEditingCompany(company); setCompanyFormOpen(true); }}>{t("common.edit")}</Button><Button size="small" variant="ghost" disabled={!canManageContacts} onClick={() => setArchiveRequest({ kind: "company", ids: [company.id] })}>{company.lifecycle === "active" ? t("common.archive") : t("common.restore")}</Button></div></article>;
      })}</div>{visibleCount < filteredCompanies.length && <div className="contacts-load-more"><Button variant="secondary" size="small" onClick={() => setVisibleCount((current) => current + CONTACT_PAGE_SIZE)}>{t("contacts.showMore", { remaining: filteredCompanies.length - visibleCount })}</Button></div>}</>}
    </section>{previewCompany && <CompanyPreview company={previewCompany} canManage={canManageContacts} onEdit={() => { setEditingCompany(previewCompany); setCompanyFormOpen(true); }} onToggleLifecycle={() => setArchiveRequest({ kind: "company", ids: [previewCompany.id] })} onDelete={() => { setDeleteError(""); setDeleteCompanyId(previewCompany.id); }} />}</div>}

    {((tab === "people" && filteredContacts.length > 0) || (tab === "companies" && filteredCompanies.length > 0)) && <div className="contacts-export-footer"><span>{t("contacts.exportHelp")}</span>{tab === "people" && <><Button size="small" variant="secondary" disabled={!canManageContacts} onClick={() => exportContacts("csv")}><Download size={14} />CSV</Button><Button size="small" variant="secondary" disabled={!canManageContacts} onClick={() => exportContacts("vcf")}><Download size={14} />vCard</Button></>}<Button size="small" variant="secondary" disabled={!canManageContacts} onClick={exportPortableData}><Download size={14} />JSON</Button></div>}

    {contactFormOpen && <ContactFormModal key={editingContact?.id ?? "new"} open contact={editingContact} onClose={() => setContactFormOpen(false)} />}
    {companyFormOpen && <CompanyFormModal key={editingCompany?.id ?? "new"} open company={editingCompany} onClose={() => setCompanyFormOpen(false)} />}
    {importOpen && <ContactImportModal open onClose={() => setImportOpen(false)} />}

    <Modal open={bulkTagOpen} title={t("contacts.bulkTagTitle")} onClose={() => setBulkTagOpen(false)}>
      <div className="modal-body"><p>{t("contacts.bulkTagHelp", { count: selectedContacts.length })}</p><label className="field"><span>{t("contacts.tag")}</span><input value={bulkTag} maxLength={80} onChange={(event) => setBulkTag(event.target.value)} /></label></div>
      <div className="modal-footer"><Button variant="secondary" onClick={() => setBulkTagOpen(false)}>{t("common.cancel")}</Button><Button disabled={!bulkTag.trim()} onClick={() => { tagContacts(selectedContacts.map((contact) => contact.id), bulkTag); setBulkTag(""); setBulkTagOpen(false); }}>{t("common.apply")}</Button></div>
    </Modal>

    <Modal open={bulkProjectOpen} title={t("contacts.bulkAddProjectTitle")} onClose={() => setBulkProjectOpen(false)}>
      <div className="modal-body"><p>{t("contacts.bulkAddProjectHelp", { count: selectedContacts.length })}</p><div className="form-grid"><label className="field span-two"><span>{t("contacts.project")}</span><select value={bulkProjectId} onChange={(event) => setBulkProjectId(event.target.value)}><option value="">{t("contacts.chooseProject")}</option>{database.projects.filter((project) => project.status !== "archived").map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label className="field"><span>{t("contacts.role")}</span><select value={bulkRole} onChange={(event) => setBulkRole(event.target.value as ProjectParticipantRole)}>{(["client", "owner", "coordinator", "architect", "planner", "site_manager", "contractor", "custom"] as ProjectParticipantRole[]).map((value) => <option value={value} key={value}>{t(`contacts.role.${value}`)}</option>)}</select></label>{bulkRole === "custom" && <label className="field"><span>{t("contacts.customRole")}</span><input value={bulkCustomRole} onChange={(event) => setBulkCustomRole(event.target.value)} /></label>}</div></div>
      <div className="modal-footer"><Button variant="secondary" onClick={() => setBulkProjectOpen(false)}>{t("common.cancel")}</Button><Button disabled={!bulkProjectId || (bulkRole === "custom" && !bulkCustomRole.trim())} onClick={() => { assignContactsToProject(selectedContacts.map((contact) => contact.id), bulkProjectId, bulkRole, bulkCustomRole); setBulkProjectOpen(false); }}>{t("contacts.bulkAssign")}</Button></div>
    </Modal>

    <Modal open={mergeOpen} title={t("contacts.mergeTitle")} onClose={() => setMergeOpen(false)}>
      <div className="modal-body merge-review"><p>{t("contacts.mergeHelp")}</p><label className="field"><span>{t("contacts.keepContact")}</span><select value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)}>{selectedContacts.map((contact) => <option key={contact.id} value={contact.id}>{contactDisplayName(contact)}</option>)}</select></label><div className="merge-reference-summary">{selectedContacts.map((contact) => <article key={contact.id}><strong>{contactDisplayName(contact)}</strong><span>{t("contacts.mergeReferenceSummary", { affiliations: database.contactAffiliations.filter((item) => item.contactId === contact.id).length, assignments: database.projectContactAssignments.filter((item) => item.contactId === contact.id).length, identities: database.externalContactIdentities.filter((item) => item.contactId === contact.id).length, imports: database.contactImportBatches.filter((batch) => batch.items.some((item) => item.contactId === contact.id)).length })}</span></article>)}</div><div className="merge-field-list">{CONTACT_MERGE_FIELDS.map((field) => <fieldset key={field}><legend>{t(`contacts.mergeField.${field}`)}</legend>{selectedContacts.map((contact) => <label key={contact.id}><input type="radio" name={`contact-merge-${field}`} checked={contactMergeSources[field] === contact.id} onChange={() => setContactMergeSources((current) => ({ ...current, [field]: contact.id }))} /><span><strong>{contactDisplayName(contact)}</strong>{mergeValueLabel(contact[field])}</span></label>)}</fieldset>)}</div></div>
      <div className="modal-footer"><Button variant="secondary" onClick={() => setMergeOpen(false)}>{t("common.cancel")}</Button><Button onClick={confirmContactMerge}>{t("contacts.merge")}</Button></div>
    </Modal>

    <Modal open={companyMergeOpen} title={t("contacts.mergeCompaniesTitle")} onClose={() => setCompanyMergeOpen(false)}>
      <div className="modal-body merge-review"><p>{t("contacts.mergeCompaniesHelp")}</p><label className="field"><span>{t("contacts.keepCompany")}</span><select value={companyMergeTargetId} onChange={(event) => setCompanyMergeTargetId(event.target.value)}>{selectedCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><div className="merge-reference-summary">{selectedCompanies.map((company) => <article key={company.id}><strong>{company.name}</strong><span>{t("contacts.mergeCompanyReferenceSummary", { people: database.contactAffiliations.filter((item) => item.companyId === company.id).length, assignments: database.projectContactAssignments.filter((item) => item.companyId === company.id).length, imports: database.contactImportBatches.filter((batch) => batch.items.some((item) => item.companyId === company.id)).length })}</span></article>)}</div><div className="merge-field-list">{COMPANY_MERGE_FIELDS.map((field) => <fieldset key={field}><legend>{t(`contacts.mergeField.${field}`)}</legend>{selectedCompanies.map((company) => <label key={company.id}><input type="radio" name={`company-merge-${field}`} checked={companyMergeSources[field] === company.id} onChange={() => setCompanyMergeSources((current) => ({ ...current, [field]: company.id }))} /><span><strong>{company.name}</strong>{mergeValueLabel(company[field])}</span></label>)}</fieldset>)}</div></div>
      <div className="modal-footer"><Button variant="secondary" onClick={() => setCompanyMergeOpen(false)}>{t("common.cancel")}</Button><Button onClick={confirmCompanyMerge}>{t("contacts.merge")}</Button></div>
    </Modal>

    <Modal open={Boolean(archiveRequest)} title={t("contacts.lifecycleConfirmTitle")} onClose={() => setArchiveRequest(undefined)}>
      <div className="modal-body merge-review"><p>{t("contacts.lifecycleConfirmHelp")}</p><div className="merge-reference-summary">
        {archiveRequest?.kind === "contact" && archiveRequest.ids.map((id) => {
          const contact = database.contacts.find((candidate) => candidate.id === id);
          if (!contact) return null;
          return <article key={id}><strong>{contactDisplayName(contact)}</strong><span>{t("contacts.mergeReferenceSummary", {
            affiliations: database.contactAffiliations.filter((item) => item.contactId === id).length,
            assignments: database.projectContactAssignments.filter((item) => item.contactId === id).length,
            identities: database.externalContactIdentities.filter((item) => item.contactId === id).length,
            imports: database.contactImportBatches.filter((batch) => batch.items.some((item) => item.contactId === id)).length,
          })}</span></article>;
        })}
        {archiveRequest?.kind === "company" && archiveRequest.ids.map((id) => {
          const company = database.companies.find((candidate) => candidate.id === id);
          if (!company) return null;
          return <article key={id}><strong>{company.name}</strong><span>{t("contacts.mergeCompanyReferenceSummary", {
            people: database.contactAffiliations.filter((item) => item.companyId === id).length,
            assignments: database.projectContactAssignments.filter((item) => item.companyId === id).length,
            imports: database.contactImportBatches.filter((batch) => batch.items.some((item) => item.companyId === id)).length,
          })}</span></article>;
        })}
      </div></div>
      <div className="modal-footer"><Button variant="secondary" onClick={() => setArchiveRequest(undefined)}>{t("common.cancel")}</Button><Button onClick={confirmLifecycleChange}>{t("contacts.lifecycleConfirmAction")}</Button></div>
    </Modal>

    <Modal open={Boolean(deleteContactId)} title={t("contacts.deleteContactTitle")} onClose={() => setDeleteContactId("")}>
      <div className="modal-body merge-review"><p>{t("contacts.deleteContactHelp")}</p>{deleteContactId && <div className="merge-reference-summary"><article><strong>{contactDisplayName(database.contacts.find((contact) => contact.id === deleteContactId)!)}</strong><span>{t("contacts.mergeReferenceSummary", { affiliations: database.contactAffiliations.filter((item) => item.contactId === deleteContactId).length, assignments: database.projectContactAssignments.filter((item) => item.contactId === deleteContactId).length, identities: database.externalContactIdentities.filter((item) => item.contactId === deleteContactId).length, imports: database.contactImportBatches.filter((batch) => batch.items.some((item) => item.contactId === deleteContactId)).length })}</span></article></div>}{deleteError && <p className="form-error" role="alert">{deleteError}</p>}</div>
      <div className="modal-footer"><Button variant="secondary" onClick={() => setDeleteContactId("")}>{t("common.cancel")}</Button><Button variant="danger" onClick={() => { if (deleteContact(deleteContactId)) { setSelectedIds(new Set()); setDeleteContactId(""); navigate("/contacts"); } else setDeleteError(t("contacts.deleteBlocked")); }}>{t("contacts.deletePermanently")}</Button></div>
    </Modal>

    <Modal open={Boolean(deleteCompanyId)} title={t("contacts.deleteCompanyTitle")} onClose={() => setDeleteCompanyId("")}>
      <div className="modal-body merge-review"><p>{t("contacts.deleteCompanyHelp")}</p>{deleteCompanyId && <div className="merge-reference-summary"><article><strong>{database.companies.find((company) => company.id === deleteCompanyId)?.name}</strong><span>{t("contacts.mergeCompanyReferenceSummary", { people: database.contactAffiliations.filter((item) => item.companyId === deleteCompanyId).length, assignments: database.projectContactAssignments.filter((item) => item.companyId === deleteCompanyId).length, imports: database.contactImportBatches.filter((batch) => batch.items.some((item) => item.companyId === deleteCompanyId)).length })}</span></article></div>}{deleteError && <p className="form-error" role="alert">{deleteError}</p>}</div>
      <div className="modal-footer"><Button variant="secondary" onClick={() => setDeleteCompanyId("")}>{t("common.cancel")}</Button><Button variant="danger" onClick={() => { if (deleteCompany(deleteCompanyId)) { setSelectedIds(new Set()); setDeleteCompanyId(""); navigate("/contacts/companies"); } else setDeleteError(t("contacts.deleteBlocked")); }}>{t("contacts.deletePermanently")}</Button></div>
    </Modal>

    <Modal open={historyOpen} title={t("contacts.importHistory")} onClose={() => setHistoryOpen(false)}>
        <div className="modal-body import-history-list">{undoMessage && <p className="import-status" role="status">{undoMessage}</p>}{database.contactImportBatches.length === 0 ? <EmptyState icon={<History />} title={t("contacts.noImports")} text={t("contacts.noImportsText")} /> : database.contactImportBatches.map((batch) => <article key={batch.id}><span><strong>{batch.sourceLabel}</strong><small>{formatDate(batch.createdAt)} · {batch.items.length} {t("contacts.records")}</small></span><Badge tone={batch.status === "completed" ? "success" : "neutral"}>{t(`contacts.import.status.${batch.status}`)}</Badge>{batch.status === "completed" && <Button size="small" variant="ghost" disabled={!canManageContacts} onClick={() => { const undo = undoContactImportBatch(batch.id); setUndoMessage(t("contacts.undoResult", undo)); }}><RotateCcw size={14} />{t("contacts.undoImport")}</Button>}</article>)}</div>
      <div className="modal-footer"><Button onClick={() => setHistoryOpen(false)}>{t("common.close")}</Button></div>
    </Modal>
  </div>;
}

function CompanyPreview({ company, canManage, onEdit, onToggleLifecycle, onDelete }: { company: Company; canManage: boolean; onEdit: () => void; onToggleLifecycle: () => void; onDelete: () => void }) {
  const { database } = useApp();
  const { t, formatDate } = useI18n();
  const affiliations = database.contactAffiliations.filter((affiliation) => affiliation.companyId === company.id && affiliation.lifecycle === "active");
  const people = affiliations.flatMap((affiliation) => {
    const contact = database.contacts.find((candidate) => candidate.id === affiliation.contactId);
    return contact ? [{ contact, affiliation }] : [];
  });
  const projectIds = new Set(database.projectContactAssignments.filter((assignment) => assignment.companyId === company.id || people.some(({ contact }) => contact.id === assignment.contactId)).map((assignment) => assignment.projectId));
  return <aside className="panel contact-preview company-preview">
    <div className="contact-preview-hero"><span><Building2 /></span><h2>{company.name}</h2><p>{company.domain || t(`contacts.source.${company.source}`)}</p></div>
    <div className="contact-preview-actions"><Button size="small" disabled={!canManage} onClick={onEdit}>{t("common.edit")}</Button><Button size="small" variant="ghost" disabled={!canManage} onClick={onToggleLifecycle}>{company.lifecycle === "active" ? t("common.archive") : t("common.restore")}</Button>{company.lifecycle === "archived" && <Button size="small" variant="danger" disabled={!canManage} onClick={onDelete}><Trash2 size={13} />{t("contacts.deletePermanently")}</Button>}</div>
    <dl className="contact-preview-details">
      {company.website && <div><dt>{t("contacts.website")}</dt><dd>{/^https?:\/\//i.test(company.website) ? <a href={company.website} target="_blank" rel="noreferrer">{company.website}</a> : company.website}</dd></div>}
      {company.email && <div><dt><Mail size={14} />{t("contacts.email")}</dt><dd><a href={`mailto:${company.email}`}>{company.email}</a></dd></div>}
      {company.phone && <div><dt><Phone size={14} />{t("contacts.phone")}</dt><dd><a href={`tel:${company.phone}`}>{company.phone}</a></dd></div>}
      {company.address && <div><dt>{t("contacts.address")}</dt><dd>{[company.address.street, `${company.address.postalCode} ${company.address.city}`.trim(), company.address.region, company.address.country].filter(Boolean).join(", ")}</dd></div>}
      {company.tags.length > 0 && <div><dt>{t("contacts.tags")}</dt><dd className="contact-tags">{company.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</dd></div>}
      <div><dt>{t("contacts.source")}</dt><dd>{t(`contacts.source.${company.source}`)}</dd></div>
      {company.notes && <div><dt>{t("contacts.notes")}</dt><dd>{company.notes}</dd></div>}
    </dl>
    <div className="contact-projects"><h3>{t("contacts.people")}</h3>{people.length ? people.map(({ contact, affiliation }) => <Link key={affiliation.id} to={`/contacts/people/${contact.id}`}><strong>{contactDisplayName(contact)}</strong><span>{affiliation.jobTitle || affiliation.department}</span></Link>) : <p>{t("contacts.noAffiliatedPeople")}</p>}</div>
    <div className="contact-projects"><h3>{t("contacts.projects")}</h3>{projectIds.size ? [...projectIds].map((id) => { const project = database.projects.find((candidate) => candidate.id === id); return project && <Link key={id} to={`/projects/${id}`}><strong>{project.name}</strong></Link>; }) : <p>{t("contacts.noProjects")}</p>}</div>
    <small className="contact-updated">{t("contacts.createdAndUpdated", { created: formatDate(company.createdAt), updated: formatDate(company.updatedAt) })}</small>
  </aside>;
}

function ContactPreview({ contact, canManage, onEdit, onAddToProject, onExport, onToggleLifecycle, onDelete }: { contact: Contact; canManage: boolean; onEdit: () => void; onAddToProject: () => void; onExport: () => void; onToggleLifecycle: () => void; onDelete: () => void }) {
  const { database } = useApp();
  const { t, formatDate } = useI18n();
  const company = companyForContact(database, contact.id);
  const affiliation = database.contactAffiliations.find((candidate) => candidate.contactId === contact.id && candidate.primary);
  const assignments = database.projectContactAssignments.filter((assignment) => assignment.contactId === contact.id && assignment.lifecycle === "active");
  return <aside className="panel contact-preview">
    <div className="contact-preview-hero"><span>{contactDisplayName(contact).slice(0, 1).toUpperCase()}</span><h2>{contactDisplayName(contact)}</h2><p>{[affiliation?.jobTitle, company?.name].filter(Boolean).join(" · ") || t(`contacts.source.${contact.source}`)}</p></div>
    <div className="contact-preview-actions"><Button size="small" disabled={!canManage} onClick={onEdit}>{t("common.edit")}</Button><Button size="small" variant="secondary" disabled={!canManage} onClick={onAddToProject}>{t("contacts.bulkAddProject")}</Button><Button size="small" variant="secondary" disabled={!canManage} onClick={onExport}><Download size={13} />vCard</Button><Button size="small" variant="ghost" disabled={!canManage} onClick={onToggleLifecycle}>{contact.lifecycle === "active" ? t("common.archive") : t("common.restore")}</Button>{contact.lifecycle === "archived" && <Button size="small" variant="danger" disabled={!canManage} onClick={onDelete}><Trash2 size={13} />{t("contacts.deletePermanently")}</Button>}</div>
    <dl className="contact-preview-details">
      <div><dt><Mail size={14} />{t("contacts.emails")}</dt><dd>{contact.emails.length ? contact.emails.map((email) => <span className="contact-method-action" key={email.id}><a href={`mailto:${email.value}`}>{email.value}{email.primary && <Badge>{t("contacts.primary")}</Badge>}</a><button className="icon-button" type="button" aria-label={t("contacts.copyValue", { value: email.value })} onClick={() => void copyTextToClipboard(email.value)}><Copy size={12} /></button></span>) : "—"}</dd></div>
      <div><dt><Phone size={14} />{t("contacts.phones")}</dt><dd>{contact.phones.length ? contact.phones.map((phone) => <span className="contact-method-action" key={phone.id}><a href={`tel:${phone.value}`}>{phone.value}{phone.primary && <Badge>{t("contacts.primary")}</Badge>}</a><button className="icon-button" type="button" aria-label={t("contacts.copyValue", { value: phone.value })} onClick={() => void copyTextToClipboard(phone.value)}><Copy size={12} /></button></span>) : "—"}</dd></div>
      {contact.addresses.length > 0 && <div><dt>{t("contacts.address")}</dt><dd>{contact.addresses.map((address) => <span key={address.id}>{[address.street, `${address.postalCode} ${address.city}`.trim(), address.region, address.country].filter(Boolean).join(", ")}{address.primary && <Badge>{t("contacts.primary")}</Badge>}</span>)}</dd></div>}
      {contact.tags.length > 0 && <div><dt>{t("contacts.tags")}</dt><dd className="contact-tags">{contact.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</dd></div>}
      <div><dt>{t("contacts.source")}</dt><dd>{t(`contacts.source.${contact.source}`)}</dd></div>
      {contact.notes && <div><dt>{t("contacts.notes")}</dt><dd>{contact.notes}</dd></div>}
    </dl>
    <div className="contact-projects"><h3>{t("contacts.projects")}</h3>{assignments.length === 0 ? <p>{t("contacts.noProjects")}</p> : assignments.map((assignment) => {
      const project = database.projects.find((candidate) => candidate.id === assignment.projectId);
      return project && <Link key={assignment.id} to={`/projects/${project.id}`}><strong>{project.name}</strong><span>{assignment.roles.map((role) => role.role === "custom" ? role.customLabel : t(`contacts.role.${role.role}`)).join(", ")}</span></Link>;
    })}</div>
    <small className="contact-updated">{t("contacts.createdAndUpdated", { created: formatDate(contact.createdAt), updated: formatDate(contact.updatedAt) })}</small>
  </aside>;
}
