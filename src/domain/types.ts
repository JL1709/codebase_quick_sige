export type Locale = "de" | "en";

export type ProjectStatus = "draft" | "in_review" | "published" | "archived";
export type ConstructionType = "new_build" | "renovation" | "demolition";
export type Season = "spring" | "summer" | "autumn" | "winter" | "year_round";
export type RecommendationStrength = "required_review" | "strong" | "optional";
export type RecordLifecycle = "active" | "archived";
export type ContactMethodType = "work" | "mobile" | "home" | "other";
export type ProjectParticipantRole = "client" | "owner" | "responsible_third_party" | "coordinator" | "architect" | "planner" | "site_manager" | "contractor" | "custom";
export type ContactSource = "manual" | "migration" | "vcard" | "csv" | "xlsx" | "microsoft" | "google";
export type ContactsCatalogVisibility = "listed" | "project_only";

export interface OrganizationAddress {
  street: string;
  houseNumber: string;
  addressAddition: string;
  postalCode: string;
  city: string;
  region: string;
  countryCode: string;
}
export interface OrganizationLogo {
  blobId: string;
  filename: string;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
}
export interface OrganizationProfile {
  name: string;
  address: OrganizationAddress;
  phone: string;
  phoneExtension: string;
  mobilePhone: string;
  fax: string;
  faxExtension: string;
  email: string;
  website: string;
  logo?: OrganizationLogo;
}
export interface Organization extends OrganizationProfile { id: string; accentColor: string }
export interface AppUser { id: string; organizationId: string; name: string; email: string; role: "owner" | "admin" | "editor" | "viewer"; preferredLocale: Locale }

export interface Participant {
  id: string;
  role: ProjectParticipantRole;
  customRole?: string;
  company: string;
  name: string;
  email: string;
  phone: string;
}

export interface ContactEmail {
  id: string;
  type: ContactMethodType;
  value: string;
  normalizedValue: string;
  primary: boolean;
}

export interface ContactPhone {
  id: string;
  type: ContactMethodType;
  value: string;
  normalizedValue: string;
  primary: boolean;
}

export interface ContactAddress {
  id: string;
  type: ContactMethodType;
  street: string;
  postalCode: string;
  city: string;
  region: string;
  country: string;
  primary: boolean;
}

export interface Contact {
  id: string;
  organizationId: string;
  prefix: string;
  givenName: string;
  familyName: string;
  suffix: string;
  emails: ContactEmail[];
  phones: ContactPhone[];
  addresses: ContactAddress[];
  notes: string;
  tags: string[];
  lifecycle: RecordLifecycle;
  source: ContactSource;
  catalogVisibility?: ContactsCatalogVisibility;
  mergedIntoId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Company {
  id: string;
  organizationId: string;
  name: string;
  website: string;
  domain: string;
  email: string;
  phone: string;
  address?: ContactAddress;
  notes: string;
  tags: string[];
  lifecycle: RecordLifecycle;
  source: ContactSource;
  catalogVisibility?: ContactsCatalogVisibility;
  mergedIntoId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContactCompanyAffiliation {
  id: string;
  organizationId: string;
  contactId: string;
  companyId: string;
  jobTitle: string;
  department: string;
  primary: boolean;
  lifecycle: RecordLifecycle;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectContactRole {
  id: string;
  role: ProjectParticipantRole;
  roleDefinitionId?: string;
  customLabel?: string;
}

export interface ProjectRoleDefinition {
  id: string;
  organizationId: string;
  projectId?: string;
  name: string;
  lifecycle: RecordLifecycle;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectContactAssignment {
  id: string;
  organizationId: string;
  projectId: string;
  contactId: string;
  roles: ProjectContactRole[];
  lifecycle: RecordLifecycle;
  createdAt: string;
  updatedAt: string;
}

export type ExternalContactProvider = "microsoft" | "google";
export interface ExternalContactIdentity {
  id: string;
  organizationId: string;
  contactId: string;
  provider: ExternalContactProvider;
  providerAccountId: string;
  externalContactId: string;
  sourceRevision?: string;
  lastImportedAt: string;
}

export type ContactImportAction = "created" | "updated" | "merged" | "skipped" | "failed";
export interface ContactImportItem {
  id: string;
  sourceKey: string;
  action: ContactImportAction;
  contactId?: string;
  companyId?: string;
  messages: string[];
  previousContact?: Contact;
  previousCompany?: Company;
  previousAffiliation?: ContactCompanyAffiliation;
  previousAffiliations?: ContactCompanyAffiliation[];
  previousAssignment?: ProjectContactAssignment;
  previousExternalIdentity?: ExternalContactIdentity;
  companyCreated?: boolean;
  affiliationIds?: string[];
  assignmentIds?: string[];
  externalIdentityIds?: string[];
}

export interface ContactImportBatch {
  id: string;
  organizationId: string;
  source: ContactSource;
  sourceLabel: string;
  initiatedByName: string;
  status: "completed" | "undone" | "partially_undone";
  items: ContactImportItem[];
  createdAt: string;
  undoneAt?: string;
}

export interface EmergencyContact { id: string; label: string; name: string; phone: string }
export interface CustomField { id: string; key: string; value: string }
export interface CustomSection { id: string; title: string; fields: CustomField[] }

export type OverviewEntryType = "text" | "date" | "group" | "repeating_group";
export interface LocalizedOverviewTemplateEntryContent {
  label: string;
  defaultValue: string;
}

export interface OverviewTemplateEntry {
  id: string;
  label: string;
  type: OverviewEntryType;
  defaultValue: string;
  children: OverviewTemplateEntry[];
  translations?: Partial<Record<Locale, LocalizedOverviewTemplateEntryContent>>;
}

export interface ProjectOverviewEntry {
  id: string;
  label: string;
  type: OverviewEntryType;
  value: string;
  children: ProjectOverviewEntry[];
  items: ProjectOverviewEntry[][];
}

export interface ProjectOverviewSection {
  id: string;
  name: string;
  entries: ProjectOverviewEntry[];
}

export interface ProjectAsset {
  id: string;
  filename: string;
  mimeType:
    | "image/png"
    | "image/jpeg"
    | "application/pdf"
    | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  byteSize: number;
  folderId?: string;
  /** Binary content lives in IndexedDB. These data URLs are migration-only. */
  blobId?: string;
  previewBlobId?: string;
  dataUrl?: string;
  previewDataUrl?: string;
  pageCount?: number;
  /** Native PDF page dimensions. They preserve page orientation and aspect ratio without rasterizing the source. */
  pdfPages?: PdfPageMetadata[];
  width?: number;
  height?: number;
  createdAt: string;
}

export interface PdfPageMetadata {
  pageNumber: number;
  width: number;
  height: number;
}

export interface ProjectDocumentFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  projectNumber?: string;
  name: string;
  description?: string;
  address?: string;
  city?: string;
  constructionType?: ConstructionType;
  startDate?: string;
  endDate?: string;
  status: ProjectStatus;
  participants: Participant[];
  emergencyContacts: EmergencyContact[];
  customFields: CustomField[];
  customSections: CustomSection[];
  participantsSectionName: string;
  overviewSections: ProjectOverviewSection[];
  overviewSectionOrder: string[];
  assets: ProjectAsset[];
  documentFolders: ProjectDocumentFolder[];
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentAnswers {
  employerCount: number; maxWorkers: number; workDays: number; estimatedPersonDays: number;
  liveOperations: boolean; publicTraffic: boolean; existingUtilities: boolean; excavationDepth: number;
  maxWorkHeight: number; cranesOrLifting: boolean; scaffolding: boolean; temporaryPower: boolean;
  hotWorks: boolean; hazardousSubstances: boolean; waterOrDrowningRisk: boolean; confinedSpaces: boolean;
  season: Season; notes: string;
}

export interface ProjectAssessmentRun {
  id: string;
  projectId: string;
  definitionVersion: number;
  answers: AssessmentAnswers;
  reason?: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface LocalizedBuildingBlockContent {
  title: string;
  shortDescription: string;
  longDescription: string;
  searchTerms: string[];
}

export interface BuildingBlock {
  id: string;
  primaryCategoryId: string;
  categoryIds: string[];
  /** Retained while existing version-two data is migrated. */
  categoryId?: string;
  visualKey: string;
  imageDataUrl?: string;
  regulations: string[];
  lifecycle: RecordLifecycle;
  translations: Record<Locale, LocalizedBuildingBlockContent>;
}

export interface BuildingBlockCategory {
  id: string;
  parentId?: string;
  /** Only root categories own a persisted color; descendant colors are derived from depth. */
  color?: string;
  sortOrder: number;
  lifecycle: RecordLifecycle;
  translations: Record<Locale, { name: string; description: string }>;
}

export interface Recommendation {
  id: string; blockId: string; strength: RecommendationStrength; reasonKey: string;
  reasonParams?: Record<string, string | number>; included: boolean; excludedReason?: string;
}
export interface RequirementAssessment { advanceNoticeLikelyRequired: boolean; sigePlanLikelyRequired: boolean; particularlyHazardousWork: boolean; reasons: string[] }

export interface PlanItem {
  id: string;
  blockId: string;
  customTitle?: Partial<Record<Locale, string>>;
  customShortDescription?: Partial<Record<Locale, string>>;
  /** Optional plan-local raster image. Catalog imagery remains unchanged. */
  imageDataUrl?: string;
  expertNote?: string;
}
export interface PlanSection { id: string; categoryId: string; titleOverrides?: Partial<Record<Locale, string>>; items: PlanItem[] }

export type SupportingDocumentType = "site_rules" | "alarm_plan" | "fire_safety" | "first_aid" | "participants" | "advance_notice";
export interface PlanSupportingDocument { id: string; type: SupportingDocumentType; included: boolean }

export type BlockLayoutMode = "vertical" | "horizontal" | "best_fit";
export type PlanAnnotationShape = "rectangle" | "line" | "arrow" | "callout";
export type PlanTextAlignment = "left" | "center" | "right";
export type PlanPaperRaster = "none" | "A1" | "A2" | "A3" | "A4" | "A5";
export interface PlanMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export interface PlanAnnotationStyle {
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  textColor?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  textAlign?: PlanTextAlignment;
  opacity?: number;
}
export type PlanElementKind = "block_area" | "header" | "section" | "block" | "image" | "pdf_page" | "document" | "text" | "shape" | "title_block";
export interface PlanElementBase {
  id: string;
  kind: PlanElementKind;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  semanticOrder?: number;
  /** Scale chosen by the layout engine for all visual content inside managed elements. */
  contentScale?: number;
  locked?: boolean;
  hidden?: boolean;
}
export interface PlanSectionElement extends PlanElementBase { kind: "section"; sectionId: string }
export interface PlanBlockElement extends PlanElementBase { kind: "block"; sectionId: string; itemId: string; blockId: string }
export interface PlanBlockAreaElement extends PlanElementBase { kind: "block_area"; layoutMode: BlockLayoutMode }
export interface PlanAssetElement extends PlanElementBase {
  kind: "image" | "pdf_page";
  assetId: string;
  pageNumber?: number;
  fitMode?: "contain" | "cover";
  crop?: { x: number; y: number; width: number; height: number };
}
export interface PlanDocumentElement extends PlanElementBase {
  kind: "document";
  documentType: SupportingDocumentType;
  displayVariant?: "compact" | "emergency_card" | "participant_list" | "qr_link";
}
export interface PlanConnectorPoint { x: number; y: number }
export interface PlanTextElement extends PlanElementBase, PlanAnnotationStyle { kind: "text"; text: Partial<Record<Locale, string>> }
export interface PlanShapeElement extends PlanElementBase, PlanAnnotationStyle {
  kind: "shape";
  shape: PlanAnnotationShape;
  text?: Partial<Record<Locale, string>>;
  connectorStart?: PlanConnectorPoint;
  connectorEnd?: PlanConnectorPoint;
}
export interface PlanHeaderElement extends PlanElementBase {
  kind: "header";
  brandText?: Partial<Record<Locale, string>>;
  titleText?: Partial<Record<Locale, string>>;
  projectNameText?: Partial<Record<Locale, string>>;
  projectDetailsText?: Partial<Record<Locale, string>>;
  statusText?: Partial<Record<Locale, string>>;
}
export interface PlanTitleBlockElement extends PlanElementBase {
  kind: "title_block";
  projectNameText?: Partial<Record<Locale, string>>;
  coordinatorText?: Partial<Record<Locale, string>>;
  referenceText?: Partial<Record<Locale, string>>;
}
export type PlanElement = PlanBlockAreaElement | PlanHeaderElement | PlanSectionElement | PlanBlockElement | PlanAssetElement | PlanDocumentElement | PlanTextElement | PlanShapeElement | PlanTitleBlockElement;

/** Coordinates are integer tenths of a millimetre to avoid floating-point drift. */
export interface PlanLayout {
  layoutVersion: 5;
  format: "A0";
  orientation: "landscape";
  width: number;
  height: number;
  margins: PlanMargins;
  paperRaster: PlanPaperRaster;
  gridSize: number;
  elements: PlanElement[];
}

export interface Plan {
  id: string; projectId: string; status: "draft" | "published";
  provenance: {
    method: "guided_assessment" | "blank" | "current_plan" | "revision";
    createdByName: string;
    reason?: string;
    sourceAssessmentRunId?: string;
    sourcePlanId?: string;
    sourceRevisionId?: string;
  };
  supersededAt?: string;
  supersededByPlanId?: string;
  sections: PlanSection[]; layout: PlanLayout; recommendations: Recommendation[]; requirementAssessment: RequirementAssessment;
  supportingDocuments: PlanSupportingDocument[]; includedAssetIds: string[]; createdAt: string; updatedAt: string;
}

export interface OverviewTemplate {
  id: string;
  organizationId: string;
  name: string;
  sourceLocale?: Locale;
  translations?: Partial<Record<Locale, { name: string }>>;
  entries: OverviewTemplateEntry[];
  createdAt: string;
  updatedAt: string;
}

export type DocumentType = SupportingDocumentType | "a4_plan" | "project_document";
export interface DocumentTemplate {
  id: string; organizationId: string; name: string; documentType: DocumentType; locale: Locale;
  origin: "standard" | "custom"; blobId?: string; filename: string; description: string;
  lifecycle?: RecordLifecycle;
  revision?: number;
  validation?: {
    status: "valid" | "invalid";
    checkedAt: string;
    placeholders: string[];
    messages: string[];
  };
  createdAt: string; updatedAt: string;
}
export interface ProjectDocumentConfiguration { id: string; projectId: string; documentType: DocumentType; templateId: string }
export interface GeneratedDocument {
  id: string;
  projectId: string;
  documentType: DocumentType;
  templateId: string;
  templateRevision: number;
  filename: string;
  blobId: string;
  projectSnapshot: Project;
  organizationSnapshot?: Organization;
  planSnapshot?: Plan;
  language: Locale;
  generatedAt: string;
  dependencyFingerprint: string;
  stale?: boolean;
}

export interface RevisionSnapshot {
  organization?: Organization;
  project: Project;
  plan: Plan;
  blocks: BuildingBlock[];
  categories: BuildingBlockCategory[];
  documentTemplates: DocumentTemplate[];
  documentConfigurations: ProjectDocumentConfiguration[];
  generatedDocuments: GeneratedDocument[];
}
export interface PlanRevision { id: string; projectId: string; planId: string; index: string; changeSummary: string; approvedBy: string; publishedAt: string; snapshot: RevisionSnapshot }
export interface AuditEvent { id: string; projectId?: string; action: string; actorName: string; createdAt: string; details: string }

export interface AppDatabase {
  schemaVersion: number; organization: Organization; user: AppUser; projects: Project[];
  contacts: Contact[]; companies: Company[]; contactAffiliations: ContactCompanyAffiliation[];
  projectContactAssignments: ProjectContactAssignment[]; projectRoleDefinitions: ProjectRoleDefinition[]; externalContactIdentities: ExternalContactIdentity[];
  contactImportBatches: ContactImportBatch[];
  assessmentRuns: ProjectAssessmentRun[]; blocks: BuildingBlock[]; categories: BuildingBlockCategory[];
  plans: Plan[]; revisions: PlanRevision[]; overviewTemplates: OverviewTemplate[]; documentTemplates: DocumentTemplate[];
  documentConfigurations: ProjectDocumentConfiguration[]; generatedDocuments: GeneratedDocument[]; auditEvents: AuditEvent[];
}

export interface ProjectFormValues {
  name: string;
  participantsSectionName: string;
  overviewSections: ProjectOverviewSection[];
  overviewSectionOrder: string[];
}
