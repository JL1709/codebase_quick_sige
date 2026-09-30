# QuickSiGe MVP Iteration 3 Implementation Plan

This document is the implementation contract for the Contacts iteration of QuickSiGe. It translates the approved Contacts recommendation into ordered, testable work spanning the local product, future hosted persistence, imports, external providers, project integration, document generation, privacy, and quality assurance. A checkbox may be marked complete only after its observable acceptance criteria pass. The iteration may be called complete only when every checkbox in this document is checked.

**Implementation status (2026-09-30):** the production-local Contacts vertical slice, canonical migration, reusable organization project-role catalog, detached and editable project-section composition, unified ordered project overview, focused replaceable repository boundary, chunked file parsing/mapping, selectable Outlook folders and Google groups, provider adapters, project integration, portability/interoperability exports, hosted schema/RLS, reviewed field-level import/contact/company merge, hard-delete safeguards, persistent index preferences, bounded 10,000-contact rendering, and responsive Contacts matrix are implemented and automated gates are green. The iteration is intentionally not declared complete: the remaining unchecked work is external/manual acceptance or broader exhaustive matrix coverage, most notably live credentialed Microsoft/Google tests, current-client Outlook drag testing, real Outlook/Google/iCloud samples and round trips, and the remaining comprehensive bilingual/keyboard/document matrices.

## 1. Iteration outcome

QuickSiGe should gain a first-class, organization-wide Contacts workspace that remains focused on project delivery rather than becoming a sales CRM:

1. Contacts appears as a primary section alongside Projects, Block catalog, Templates, and Settings.
2. People and companies are maintained once and reused across projects.
3. Project roles belong to the relationship between a contact and a project rather than to the contact itself.
4. Existing project participants migrate without data loss or duplicate sources of truth.
5. Users can add contacts manually, import standards-based files, or connect Microsoft Outlook and Google Contacts.
6. Every import is previewable, validated, deduplicated, auditable, and reversible.
7. Contacts can be assigned to existing projects and during project creation without re-entering their details.
8. Active project outputs use current contact information while published revisions remain immutable historical snapshots.
9. Contact data, provider permissions, and credentials follow least-privilege and GDPR-oriented privacy rules.

## 2. Non-negotiable product and architecture rules

- [x] Name the top-level workspace `Contacts` in English and `Kontakte` in German.
- [x] Keep Contacts lightweight and project-oriented; do not add leads, sales pipelines, campaigns, marketing automation, email tracking, or unrelated CRM functionality.
- [x] Maintain one canonical source of truth for people, companies, contact methods, company affiliations, and project assignments.
- [x] Store project roles on project-contact assignments, never as a permanent property of a person.
- [x] Keep emergency services and other project-specific emergency contacts separate from the organization contact directory.
- [x] Keep all records scoped to an organization and enforce the same authorization rules in local use cases and hosted row-level security.
- [x] Preserve every existing project participant, participant-related overview value, generated document, plan, published revision, template, and audit event through migration.
- [x] Keep published revision snapshots immutable when a live contact, company, affiliation, or project assignment changes later.
- [x] Mark affected generated documents and active plans stale or draft when their resolved contact data changes.
- [x] Use delegated, read-only provider permissions for import; do not request permission to modify a user's Outlook or Google contacts.
- [x] Never persist OAuth access tokens or refresh tokens in `localStorage`, IndexedDB, the local `AppDatabase`, logs, audit details, or exported backups.
- [x] Parse local contact files locally unless a documented technical requirement makes server-side processing necessary.
- [x] Import only fields needed for project work by default; do not import birthdays, private photos, gender, personal interests, or unrelated profile information.
- [x] Keep all new user-facing text in the German and English translation catalogs; keep identifiers and code in English.
- [x] Use repository and provider boundaries so the local adapter, future Supabase adapter, and provider integrations share the same domain use cases.
- [x] Do not silently merge fuzzy duplicate candidates, overwrite non-empty QuickSiGe values, delete linked contacts, or propagate upstream deletions.
- [x] Do not claim universal direct Outlook drag-and-drop support unless the verified Outlook, operating-system, and browser combinations actually expose a usable file.
- [x] Do not claim completion while any checkbox in this plan remains unchecked.

## 3. Scope boundaries and terminology

### Included in Iteration 3

- [x] Organization-wide People and Companies records.
- [x] Contact-company affiliations and project-contact assignments with zero or more standard or custom project roles.
- [x] Search, filters, sorting, configurable columns, bulk actions, archive/restore, duplicate review, and merge.
- [x] Manual contact and company CRUD.
- [x] VCF/vCard, CSV, TSV, and XLSX import through file selection and drag-and-drop.
- [x] CSV and vCard export for all or selected contacts.
- [x] Microsoft 365/Outlook one-time import through Microsoft Graph with delegated `Contacts.Read`.
- [x] Google Contacts one-time import through the People API with `contacts.readonly`.
- [x] Re-import matching through stable external provider identifiers.
- [x] Contact selection and inline creation from existing-project and new-project workflows.
- [x] Migration of legacy participants and compatible participant overview data.
- [x] Local persistence, hosted Supabase schema, row-level security, tests, documentation, and operational configuration.

### Explicitly outside Iteration 3

The following are intentionally not implementation items in this iteration and therefore do not create unchecked completion work:

- Bidirectional writing back to Outlook, Google, Apple, or another contact system.
- Continuous background synchronization or storage of long-lived provider refresh tokens.
- Microsoft 365 organization-directory, global-address-list, recent-recipient, or autocomplete imports.
- Native Apple/iCloud OAuth integration; Apple/iCloud is supported through its standard vCard export.
- Direct CRM APIs for Salesforce, HubSpot, Pipedrive, or other CRMs; their CSV/XLSX exports are supported by the generic importer.
- CardDAV synchronization.
- Proprietary Outlook OLE/MAPI virtual objects or `.msg` contact parsing when the browser does not expose a standards-based contact file.
- Native mobile address-book access.

## 4. Phase 0 — baseline, investigation, and contracts

- [ ] Record the current Git state and preserve all unrelated user changes before implementation begins.
- [ ] Record the current lint, unit/component test, production-build, Chromium/WebKit browser-test, export-QA, and dependency-audit baseline.
- [x] Inventory every read and write of `Project.participants`, participant overview templates, participant overview sections, project emergency contacts, document placeholders, plan title blocks, exports, revisions, and generated-document staleness.
- [x] Trace the current seeded participant data and new-project participant behavior from UI input through persistence and every document/export consumer.
- [x] Document whether participant information can currently exist simultaneously in `Project.participants` and `Project.overviewSections`, including the stable template IDs and placeholder keys involved.
- [x] Define and record deterministic migration precedence when the same participant appears in legacy participant data and overview data.
- [x] Define and record how unrecognized or custom participant overview fields remain accessible without data loss.
- [x] Inventory the existing Supabase `contacts`, `project_participants`, and row-level-security definitions and identify all required forward-only migration changes.
- [x] Define the canonical local and hosted entity contracts for contacts, companies, contact methods, affiliations, project assignments, external identities, import batches, and import items before writing UI code.
- [x] Define the resolved project-participant view consumed by documents, plans, validation, project overview, and revision snapshots.
- [x] Define exact archive, restore, hard-delete, merge, import-undo, and upstream-deletion semantics before implementing mutations.
- [x] Define exact staleness propagation from contact/company/assignment mutations to active plans and generated documents.
- [x] Define provider configuration, redirect URIs, allowed origins, token lifetime, and token-disposal behavior for local, test, and production environments.
- [x] Create sanitized deterministic fixtures representing Outlook CSV, Google CSV, generic German CSV, XLSX, vCard 2.1, vCard 3.0, vCard 4.0, multiple contacts in one VCF, duplicate contacts, invalid rows, and malicious spreadsheet values.
- [x] Record the supported direct-drag test matrix for Classic Outlook on Windows, New Outlook on Windows, Outlook for Mac, Edge, and Chrome.
- [x] Add a repository architecture note showing the Contacts domain, import pipeline, provider adapters, project resolver, and persistence boundaries.

### Phase 0 acceptance

- [x] Existing saved local data loads without reset before Contacts schema work begins.
- [x] Every current participant source and consumer is accounted for in the migration and resolver contract.
- [ ] No Contacts implementation begins until the canonical domain model and migration rules have been reviewed against both local and hosted storage.
- [x] Provider integrations have documented local/test/production configuration that does not require secrets in committed frontend source.

## 5. Phase 1 — canonical Contacts domain model

### People, contact methods, and lifecycle

- [x] Add an organization-owned `Contact` entity with stable ID, structured name, display name, notes, tags, lifecycle, audit timestamps, and organization ownership.
- [x] Represent email addresses as typed contact methods with normalized value, display value, primary flag, and stable ID.
- [x] Represent phone numbers as typed contact methods with normalized value, display value, primary flag, and stable ID.
- [x] Represent postal addresses as typed structured values with primary flag and stable ID.
- [x] Allow contacts with incomplete but useful business data while requiring a meaningful display identity before save.
- [x] Preserve multiple emails, phones, and addresses during standards-based imports instead of silently discarding secondary values.
- [x] Normalize comparison values without destructively rewriting the user's preferred display formatting.
- [x] Use archive/restore lifecycle behavior for normal removal; reserve hard deletion for records that are provably unreferenced and explicitly confirmed.

### Companies and affiliations

- [x] Add an organization-owned `Company` entity with name, website/domain, central email and phone, structured address, notes, tags, lifecycle, and audit timestamps.
- [x] Add a contact-company affiliation entity with contact, company, job title, department, primary flag, and validity/lifecycle metadata needed for deterministic behavior.
- [x] Support a contact with no company, one primary company, or multiple affiliations without duplicating the person.
- [x] Ensure company updates flow to live contact and project views without rewriting published revision snapshots.
- [x] Prevent a company from being hard-deleted while a contact affiliation or import journal references it.

### Project assignments and roles

- [x] Add a project-contact assignment entity that references project, contact, assignment lifecycle, and audit timestamps while resolving company data only from the canonical contact affiliation.
- [x] Add project-role values separately from the assignment so one contact can hold multiple roles on one project without duplicate contact records.
- [x] Preserve the existing translated standard roles and add the protected responsible-third-party role: client, owner, responsible third party, coordinator, architect, planner, site manager, and contractor.
- [x] Add reusable organization-owned custom role definitions that can be created, renamed, reordered, archived, restored, and reused in every project.
- [x] Prevent duplicate active assignments for the same project and contact while allowing multiple roles on that assignment.
- [x] Keep removing a contact from a project independent from archiving or deleting the canonical contact.
- [x] Keep project emergency contacts in their existing project-owned model and clearly separate them from project participants.

### External identities and imports

- [x] Add an external contact identity entity with provider, provider account/connection identity, external contact ID, source revision/etag where available, and last-import timestamp.
- [x] Enforce uniqueness for organization, provider, provider account, and external contact ID.
- [x] Add an import-batch entity with source, filename or provider label, initiating user, timestamps, status, counts, and reversible-change metadata.
- [x] Add import-item results with source row/card identity, action, target contact/company IDs, validation messages, and safe pre-import values needed by undo.
- [x] Ensure provider metadata and import diagnostics never contain provider access tokens or unnecessary raw personal-data payloads.

### Phase 1 acceptance

- [x] The model can represent a person working for multiple companies and holding different roles on different projects without duplicated people.
- [x] Multiple contact methods survive save, load, export, migration, and revision resolution.
- [x] Emergency contacts and personal/business contacts remain distinct domain concepts.
- [x] Domain invariants and normalization behavior have focused unit tests.

## 6. Phase 2 — persistence, schema migration, and authorization

### Local repository migration

- [x] Increment the local database schema version and add contacts, companies, affiliations, project assignments, external identities, and import batches to `AppDatabase`.
- [x] Update runtime persistence validation for every new collection and required invariant.
- [x] Implement a forward-only, idempotent migration from existing embedded participants to canonical contacts and project assignments.
- [x] Deduplicate migrated legacy participants only when deterministic normalized identifiers prove they are the same record.
- [x] Convert compatible participant overview rows using stable template/placeholder identity rather than localized visible labels.
- [x] Preserve incompatible or custom participant overview content in a lossless legacy/custom section rather than discarding it.
- [x] Avoid creating duplicate canonical records when the same participant exists in both embedded and recognized overview data.
- [x] Preserve original created/updated timestamps where they are meaningful and use a deterministic migration timestamp otherwise.
- [x] Preserve a migration backup and expose the existing recovery behavior if migration validation fails.
- [x] Add migration tests for empty workspaces, seeded data, user-created participants, duplicate legacy participants, partially filled rows, localized overview labels, custom fields, and repeated loading after migration.

### Supabase schema and RLS

- [x] Add forward-only Supabase migrations for the canonical Contacts schema rather than rewriting the initial migration history.
- [x] Normalize the existing hosted `contacts.company`, email, and phone shape into the approved contact, method, company, affiliation, and assignment tables without destructive data loss.
- [x] Add indexes and uniqueness constraints supporting search, external identity matching, normalized email/phone matching, affiliations, and project assignments.
- [x] Add organization membership read policies and editor-or-higher mutation policies for all Contacts tables.
- [x] Add project-derived authorization checks for project-contact assignments and roles.
- [x] Prevent cross-organization contact, company, affiliation, external identity, or project assignment references at the database boundary.
- [x] Preserve `on delete restrict` or equivalent safeguards for referenced contacts and companies.
- [x] Add hosted migration and RLS tests for owner, admin, editor, viewer, non-member, and cross-tenant access.

### Repository and use-case boundaries

- [x] Extend the repository contract with focused Contacts read/write operations rather than exposing page-level direct database mutations.
- [x] Implement local repository operations and keep their signatures compatible with a future Supabase adapter.
- [x] Add domain selectors for searchable contact rows, company rows, project assignments, resolved project participants, duplicate candidates, and affected output dependencies.
- [x] Make multi-record import, merge, and undo operations atomic from the application's perspective.
- [x] Add audit events for create, update, archive, restore, merge, import, import undo, assignment, unassignment, provider connect, provider disconnect, and export.
- [x] Keep audit details useful without copying complete contact records or secrets into the audit log.

### Phase 2 acceptance

- [x] Existing workspaces migrate automatically with no reset and no lost participant or overview information.
- [x] Reloading a migrated workspace does not create additional contacts or assignments.
- [x] Local repository tests and hosted RLS tests enforce the same organization and role rules.
- [x] A repository implementation can be replaced without changing Contacts pages or import-domain logic.

## 7. Phase 3 — Contacts navigation and index workspace

### Navigation and routing

- [x] Add Contacts to the primary sidebar directly after Projects.
- [x] Add dedicated `/contacts` and contact/company detail routes with direct deep-link and browser Back/Forward support.
- [x] Add an appropriate navigation icon, active state, page title, description, and localized accessible names.
- [x] Preserve Projects, Block catalog, Templates, and Settings navigation behavior.

### People and Companies index

- [x] Add People and Companies tabs under the single Contacts workspace.
- [x] Make People the deliberate default view and preserve the selected tab in navigation history.
- [x] Add debounced search across display name, company, job title, email, phone, tag, project name, and project role.
- [x] Add filters for company, project, project role, tag, source/provider, lifecycle, and incomplete records where applicable.
- [x] Add deterministic sorting for name, company, updated date, created date, and project count.
- [x] Add configurable table columns with a sensible role-specific default set.
- [x] Persist each user's tab, sort, filters, and visible-column preferences without mixing them into shared contact data.
- [x] Add pagination or another tested bounded rendering strategy that remains responsive with at least 10,000 contacts.
- [x] Display names, primary company, job title, primary email, primary phone, associated projects/roles, source, lifecycle, and updated date clearly.
- [x] Add row selection and focused bulk actions for add to project, export, archive, restore, and duplicate review.
- [x] Add empty, no-results, loading, import-in-progress, and recoverable-error states.
- [x] Provide an efficient mobile/card presentation without removing core actions or information.

### Preview and quick actions

- [x] Add a keyboard-accessible contact preview that does not require leaving the index.
- [x] Show contact methods, affiliations, current project assignments, source, and last update in the preview.
- [x] Add quick actions for edit, add to project, export vCard, archive/restore, and open full details.
- [x] Keep destructive and merge actions out of accidental single-click paths.
- [x] Ensure index state remains intact after closing a preview or returning from a detail page.

### Phase 3 acceptance

- [x] Contacts appears as a polished first-class workspace in German and English.
- [x] A user can find a contact by any primary business identifier and filter by the projects and roles that matter to QuickSiGe.
- [x] Index interactions remain responsive with the large deterministic fixture.
- [x] Every index action is usable with keyboard and assistive technology.

## 8. Phase 4 — contact and company management

### Contact CRUD

- [x] Add manual contact creation with structured name, multiple emails, multiple phones, addresses, notes, tags, and affiliations.
- [x] Add contact editing with validation, primary-method selection, normalization preview where useful, and cancel behavior that preserves stored data.
- [x] Add clear copy-to-clipboard, `mailto:`, and `tel:` actions where supported.
- [x] Add archive and restore with explanations of project and document impact.
- [x] Block unsafe hard deletion when assignments, revisions, import history, or other protected references exist.
- [x] Allow hard deletion only through an explicit, audited flow for safely unreferenced records.
- [x] Show created, updated, source, and import provenance without exposing internal implementation noise.

### Company CRUD

- [x] Add company creation and editing with normalized domain/website, central contact methods, address, notes, and tags.
- [x] Show affiliated people and associated projects on company details.
- [x] Add archive/restore and safe-delete behavior consistent with contact references.
- [x] Provide company merge with a deliberate surviving record and per-field conflict choices.

### Duplicate review and merge

- [x] Add exact duplicate detection using external identity and normalized non-empty email where safe.
- [x] Add high-confidence candidate detection using normalized phone and deterministic company/name combinations.
- [x] Treat fuzzy name/company similarity as a review suggestion only.
- [x] Provide a side-by-side merge review showing source, target, conflicting fields, affiliations, assignments, external identities, and import history.
- [x] Require the user to select the surviving value for every material conflict.
- [x] Rewire project assignments, affiliations, external identities, and safe references atomically during merge.
- [x] Preserve published revision snapshots unchanged during merge.
- [x] Record merge provenance and allow the archived merged record to redirect to the surviving record.
- [x] Prevent merge when organization boundaries or incompatible invariants would be violated.

### Phase 4 acceptance

- [x] People and companies can be created, edited, archived, restored, and safely merged without orphaned references.
- [x] Duplicate review never performs a fuzzy merge without an explicit user decision.
- [x] Contact forms preserve multiple methods and remain usable with long German labels and international values.

## 9. Phase 5 — project assignment and single-source resolution

### Existing projects

- [x] Replace embedded participant editing with a dedicated project-participant experience backed by canonical project assignments.
- [x] Add `Add from Contacts` search and multi-select from an existing project's overview.
- [x] Allow creating a new canonical contact inline without leaving the project and immediately assign it to the project.
- [x] Keep imports in the Contacts workspace and remove the import action from project participant flows.
- [x] Keep project roles fully optional, never preselect a role, and allow assignments to be created or retained with no roles.
- [x] Allow one person to hold several roles without duplicating the person or their contact methods.
- [x] Keep contact identity and company editing exclusively in Contacts; project participant rows edit only project roles.
- [x] Replace the assignment-edit dialog with an inline role picker and remove the project-level company override.
- [x] Allow removing an assignment while retaining the canonical contact and its other projects.
- [x] Show where else the contact is used before archive, merge, or removal actions that could affect projects.

### New project creation

- [x] Add an optional Participants step or section to new-project creation without making contacts mandatory for a valid project.
- [x] Support searching and selecting existing contacts and creating a canonical contact inline during new-project creation; keep imports in the Contacts workspace.
- [x] Show the selected contact's company, primary email, and primary phone during project creation, matching the project overview identity row.
- [x] Preserve selected contacts and roles when navigating backward and forward in the creation workflow.
- [x] Prevent duplicate assignments if the same contact is selected more than once.
- [x] Replace the single additional-information area with repeatable, editable custom project sections while preserving overview-template selection.
- [x] Create the project and all selected assignments atomically so a failed assignment does not leave a partially configured project.

### Resolved project data and outputs

- [x] Replace document/export consumers of embedded `Project.participants` with one tested resolved-participant selector.
- [x] Update project overview, plan title block, publication defaults, A0 PDF, A4 Word plan, participant documents, placeholders, and supporting documents to use the resolver.
- [x] Retain existing placeholder names and loop behavior unless a versioned migration deliberately changes them.
- [x] Mark current generated documents stale when a linked contact, company, affiliation, role, or assignment changes.
- [x] Return an active published plan to the established draft/review state only when the existing product rules require it.
- [x] Snapshot resolved contact, company, contact-method, and role values into new published revisions.
- [x] Keep previously published revision rendering and exports byte-stable in meaning when live Contacts data later changes.
- [x] Ensure archived contacts already present in historical revisions remain renderable.

### Reusable project roles and ordered overview composition

- [x] Model custom project roles as organization-owned reusable definitions instead of one-off assignment labels.
- [x] Support project-scoped custom roles alongside reusable organization roles, with project-scoped roles available to every participant in that project and nowhere else.
- [x] Present selected participant roles as removable pills and manage multi-role selection through one searchable role picker in project creation and existing projects.
- [x] Let project users create a role from the picker and explicitly choose whether to save it as a reusable template role, defaulting that choice to true.
- [x] Keep standard roles protected and add responsible third party as a stable domain role.
- [x] Migrate legacy custom labels into deduplicated reusable definitions and keep assignments linked by stable role-definition ID.
- [x] Use the reusable role catalog in existing-project assignment, new-project creation, bulk assignment, and contact import-to-project flows.
- [x] Add role create, rename, reorder, archive, and restore management to Templates.
- [x] Keep multiple participants with the same role and multiple roles on one participant unrestricted.
- [x] Hide the legacy participant overview template from template management and project-template selection.
- [x] Show canonical project participants in both project overview and Edit project information.
- [x] Persist one ordered project-overview composition containing participants and all overview sections.
- [x] Support pointer drag-and-drop plus accessible move-up/move-down controls for overview sections.
- [x] Apply the persisted order to the overview display and the stored overview-section sequence consumed by generated data.
- [x] Add local migration, hosted migration/RLS, unit, component, Chromium, and WebKit coverage for role reuse and overview ordering.

### Detached project-section composition

- [x] Separate the project name from optional project composition with a persistent left-side section library.
- [x] Start new projects with only the project-name panel and clear guidance for adding participants, templates, or custom sections.
- [x] Preview reusable templates in a dialog and allow adding them directly from the section library.
- [x] Deep-copy template content into project-owned sections without retaining a template ID, synchronization link, or audit reference.
- [x] Ensure subsequent template edits and project-section edits never change one another.
- [x] Allow any number of project-owned custom sections, each created with the editable initial title `Custom section`/`Eigener Bereich`.
- [x] Make participant and field-section titles editable during creation, in Edit project information, and from the project overview.
- [x] Make copied-template and custom-section labels, types, nesting, values, titles, deletion, and ordering project-editable.
- [x] Replace project-participant contact dropdowns with a keyboard-accessible autocomplete searching name, company, job title, email, and phone while excluding assigned contacts.
- [x] Preserve accessible move controls and implement animated sortable drag-and-drop where surrounding sections make room for the prospective position.
- [x] Keep section dimensions stable during drag, remove cross-height scaling, and use a compact drag overlay plus a visible destination placeholder.
- [x] Migrate existing projects to editable participant titles and strip legacy template references from persisted project sections.
- [x] Cover empty composition, repeatable custom sections, template preview/copy, direct overview editing, migration, and template/project independence in unit and Chromium/WebKit journeys.

### Phase 5 acceptance

- [x] A contact can be added to an existing project and during project creation without retyping contact information.
- [x] The same contact can have different roles on different projects while every live project resolves the contact's canonical primary company.
- [x] Editing a live contact updates current project views and invalidates dependent generated documents.
- [x] Historical revisions and exports continue to show the values captured at publication time.
- [x] No production workflow reads a second mutable participant source after migration.

## 10. Phase 6 — shared import pipeline and wizard

### Source-neutral import architecture

- [x] Define one canonical `ContactImportCandidate` shape used by file parsers and provider adapters.
- [x] Define source adapters for vCard, delimited text, XLSX, Microsoft Graph, and Google People without duplicating mapping or deduplication logic.
- [x] Separate parsing, field mapping, normalization, validation, matching, user decisions, persistence, and reporting into testable responsibilities.
- [x] Keep source-specific raw values available only as long as needed for preview and diagnostics.
- [x] Process large imports in bounded chunks without blocking the main interface.
- [x] Support cancellation before commit without persisting a partial batch.
- [x] Commit accepted import actions atomically or provide a deterministic resumable failure state.

### Guided import experience

- [x] Provide `Import contacts` only from the Contacts workspace; project participant flows reuse or create canonical Contacts without duplicating the import experience.
- [x] Start with a source chooser for files, Microsoft Outlook, and Google Contacts.
- [x] Show supported formats, privacy behavior, and provider scope before the user selects a source.
- [x] Add a file drop zone and keyboard-accessible file chooser.
- [x] Preview detected people, companies, contact methods, source row/card, and validation state before import.
- [x] Auto-map known German, English, Outlook, Google, and common CRM column headings.
- [x] Provide manual mapping for every supported canonical field and allow unmapped source columns.
- [x] Prevent two incompatible source columns from silently mapping to the same singleton field.
- [x] Allow selecting a worksheet for multi-sheet XLSX input.
- [x] Show normalization results and invalid values without changing the original source preview invisibly.
- [x] Show exact matches, possible duplicates, new contacts, updates, skipped rows, and errors as distinct review groups.
- [x] Offer per-item and bulk decisions: create, update empty fields, overwrite selected fields, merge after review, or skip.
- [x] Default to preserving non-empty QuickSiGe values unless the user explicitly chooses an overwrite.
- [x] Allow applying tags and optionally assigning accepted contacts to a selected project and roles.
- [x] Require a final summary confirmation before persistence.
- [x] Show imported, updated, merged, skipped, and failed counts after commit.
- [x] Provide a downloadable, privacy-conscious error report that does not expose more personal data than necessary.

### Validation and normalization

- [x] Trim insignificant whitespace and normalize comparison-only email casing.
- [x] Validate email syntax without rejecting legitimate international or uncommon addresses solely because of an overly narrow regular expression.
- [x] Normalize phone comparison values and preserve the user's original display format.
- [x] Normalize company domains and websites safely without inventing a domain from an email address without confirmation.
- [x] Reject spreadsheet formula execution and escape dangerous leading characters during CSV export.
- [x] Never render imported notes or values as unsanitized HTML.
- [x] Enforce named file-size, row-count, card-count, field-length, and decompression limits with localized errors.
- [x] Reject password-protected, malformed, unsupported, or suspicious files without partially importing them.

### Import undo

- [x] Allow an authorized user to undo a completed import batch from its result and history views.
- [x] Restore overwritten values from captured pre-import state when no incompatible later edit exists.
- [x] Remove or archive newly created contacts and companies only when doing so cannot break assignments or later work.
- [x] Detect post-import edits or references and present conflicts rather than silently erasing newer data.
- [x] Audit import undo and retain a compact result record after personal-data payloads are no longer needed.

### Phase 6 acceptance

- [x] Every source passes through the same mapping, validation, duplicate, decision, commit, and reporting pipeline.
- [x] Cancelling before commit leaves the database unchanged.
- [x] Failed commits do not leave half-imported contacts or companies.
- [x] Import undo restores safe changes and clearly reports conflicts for unsafe reversals.

## 11. Phase 7 — vCard, CSV/TSV, XLSX, drag-and-drop, and export

### vCard

- [x] Parse vCard 2.1, 3.0, and 4.0 files with UTF-8 and supported legacy encodings.
- [x] Support one contact, many individual vCards, and multiple `VCARD` records in one `.vcf` file.
- [x] Correctly unfold folded lines and decode escaped delimiters, quoted-printable values, structured names, organizations, titles, emails, phones, and addresses.
- [x] Preserve supported type and preference metadata for multiple contact methods.
- [x] Ignore photos, keys, audio, birthdays, gender, and unrelated private fields by default and report ignored categories transparently.
- [x] Handle malformed individual cards as item errors without losing valid cards when safe.
- [x] Export selected or individual contacts as standards-compliant UTF-8 vCard 4.0.
- [ ] Verify exported vCards can be imported by current Outlook, Google Contacts, and iCloud flows used for acceptance testing.

### CSV and TSV

- [x] Detect comma, semicolon, and tab delimiters with an explicit override.
- [x] Detect UTF-8 with and without BOM and provide an encoding override for supported legacy Outlook exports.
- [x] Preserve quoted delimiters, embedded newlines, escaped quotes, empty values, and international characters.
- [x] Support Outlook CSV, Google CSV, generic German/English headers, and user-defined mappings.
- [x] Provide a downloadable QuickSiGe CSV template with German and English guidance.
- [x] Export selected or all contacts as correctly escaped UTF-8 CSV suitable for spreadsheet use.
- [x] Prevent formula injection in all exported text cells.

### XLSX

- [x] Parse `.xlsx` workbooks without executing macros or formulas.
- [x] Let users select a worksheet and header row when automatic detection is uncertain.
- [x] Use displayed/cached values safely and report unsupported formula-only cells.
- [x] Preserve international text, dates stored as text, and leading zeros in phone/postal fields.
- [x] Reject legacy `.xls`, macro-enabled, password-protected, or malformed workbooks with an actionable explanation unless explicit safe support is added and tested.

### Drag-and-drop and Outlook compatibility

- [x] Accept supported files dragged from Finder, Explorer, desktop, email attachments, and browser download surfaces.
- [x] Inspect dropped file names, types, and signatures rather than trusting MIME type alone.
- [ ] Test direct contact drag from each supported Outlook/browser combination in the Phase 0 matrix.
- [x] Import directly when Outlook exposes a supported `.vcf`, `.csv`, or `.xlsx` file.
- [x] When Outlook exposes `.msg`, a proprietary virtual item, or no usable browser file, show the Connect Outlook and vCard/CSV alternatives without claiming the drop succeeded.
- [ ] Document verified direct-drag combinations and limitations in user-facing help and release notes.

### Phase 7 acceptance

- [ ] Official Outlook CSV, Google CSV/vCard, and iCloud vCard exports import through sanitized acceptance fixtures and real smoke samples.
- [x] German semicolon CSV, international names, multiple contact methods, and large files preserve their data accurately.
- [x] Unsupported or malformed files fail safely with no persisted partial data.
- [ ] Direct Outlook drag behavior is documented from observed results rather than assumption.
- [x] QuickSiGe vCard and CSV exports round-trip without losing supported canonical fields.

## 12. Phase 8 — Microsoft 365/Outlook connector

### Authentication and permissions

- [ ] Register and document a Microsoft identity application for local, test, and production redirect URIs.
- [x] Use authorization code with PKCE through a supported Microsoft authentication library.
- [x] Request delegated `Contacts.Read` and only the minimal identity scopes required to identify the connection.
- [x] Do not request application-wide mailbox access, `Contacts.ReadWrite`, shared-contact access, directory access, or mail access.
- [x] Support both Microsoft work/school accounts and personal Microsoft accounts where the official permission permits them.
- [x] Keep access tokens in memory only for the active import session and clear them on completion, cancellation, sign-out, error, or page teardown.
- [x] Hide or explain the connector when required public application configuration is absent instead of presenting a broken sign-in action.
- [x] Provide provider-specific consent, disconnect, expired-session, denied-consent, conditional-access, and account-switching states.

### Contact retrieval and mapping

- [x] List accessible Outlook contact folders using Microsoft Graph and let the user choose one or more folders.
- [x] Page through all selected contacts without silently truncating results.
- [x] Request only the Graph fields mapped by QuickSiGe.
- [x] Map structured names, display name, organizations, job title, email addresses, business/mobile/home phones as allowed by import policy, and business addresses.
- [x] Ignore unrelated provider fields according to the data-minimization policy.
- [x] Store the Graph contact ID, account identity, source revision/etag where available, and import timestamp as an external identity.
- [x] Route imported Outlook contacts through the shared preview, mapping, validation, duplicate, and commit workflow.
- [x] Match later one-time re-imports by external identity before considering email or phone candidates.
- [x] Treat a provider contact missing on a later import as information only; never delete or archive the QuickSiGe contact automatically.

### Reliability and verification

- [x] Handle pagination, throttling, transient network failure, token expiry, permission revocation, and malformed provider records with actionable retry behavior.
- [x] Prevent duplicate persistence when an import request or page is retried.
- [x] Add deterministic mocked Graph contract tests that contain no real personal data or tokens.
- [ ] Complete and record a live smoke import using a dedicated test account with multiple folders, duplicate candidates, international values, and re-import.
- [ ] Verify the Microsoft connection can be discarded completely after import and no token appears in browser persistence or backups.

### Phase 8 acceptance

- [ ] A configured user can connect Outlook, choose contacts, review them, import them, and assign them to a project.
- [ ] The connector uses delegated read-only access and stores no OAuth token after the import session.
- [ ] Re-import updates through stable external identities without duplicating the contact.
- [ ] Network, permission, cancellation, and throttling failures leave the Contacts database consistent.

## 13. Phase 9 — Google Contacts connector

### Authentication and permissions

- [ ] Register and document Google OAuth configuration for local, test, and production origins/redirect behavior.
- [x] Use the supported Google Identity Services browser authorization flow.
- [x] Request `https://www.googleapis.com/auth/contacts.readonly` and only the minimal identity scopes needed for the connection label.
- [x] Do not request write access, Gmail access, broad Workspace directory access, or unrelated profile scopes.
- [x] Keep access tokens in memory only for the active import session and clear them on completion, cancellation, sign-out, error, or page teardown.
- [x] Hide or explain the connector when required public configuration is absent.
- [x] Provide provider-specific consent, disconnect, expired-session, denied-consent, popup-blocked, and account-switching states.

### Contact retrieval and mapping

- [x] List the authenticated user's saved Google Contacts through the People API rather than treating Gmail recipients as contacts.
- [x] Allow selection by contact group when membership information is available under the approved scope.
- [x] Page through all selected contacts without silent truncation.
- [x] Request only the People fields mapped by QuickSiGe.
- [x] Map names, organizations, titles, email addresses, phone numbers, and business-relevant addresses while applying the data-minimization policy.
- [x] Store the Google resource name, account identity, etag/source revision where available, and import timestamp as an external identity.
- [x] Route imported Google contacts through the shared preview, validation, duplicate, and commit workflow.
- [x] Match later one-time re-imports by external identity before considering email or phone candidates.
- [x] Do not import Google `Other contacts`, Workspace directory people, or merged profile-only people as saved contacts unless a future reviewed scope explicitly adds them.

### Reliability and verification

- [x] Handle pagination, quotas, transient network failure, token expiry, permission revocation, and partially populated People records.
- [x] Prevent duplicate persistence when an import request or page is retried.
- [x] Add deterministic mocked People API contract tests containing no real personal data or tokens.
- [ ] Complete and record a live smoke import using a dedicated test account with groups, duplicate candidates, international values, and re-import.
- [ ] Verify the Google connection can be discarded completely after import and no token appears in browser persistence or backups.

### Phase 9 acceptance

- [ ] A configured user can connect Google Contacts, choose contacts, review them, import them, and assign them to a project.
- [ ] The connector uses read-only access and stores no OAuth token after the import session.
- [ ] Re-import updates through stable external identities without duplicating the contact.
- [ ] Quota, permission, cancellation, and network failures leave the Contacts database consistent.

## 14. Phase 10 — privacy, security, permissions, and auditability

- [x] Document the product purpose and field-level data-minimization choices for Contacts imports.
- [x] Show users which provider data categories QuickSiGe will read before provider consent/import.
- [x] Provide clear provenance for manual, file, Outlook, Google, migrated, and merged records.
- [x] Add authorization checks so viewers are read-only and only approved organization roles can create, edit, import, merge, archive, restore, export, or assign contacts.
- [x] Treat exporting contact data as a permissioned and audited operation.
- [x] Prevent cross-tenant identifiers in route parameters, imports, merges, assignments, and repository calls from revealing whether another organization's record exists.
- [x] Sanitize imported filenames, worksheet names, field names, notes, tags, URLs, and display values before rendering.
- [x] Enforce upload and decompression limits before allocating unbounded memory.
- [x] Ensure OAuth codes, tokens, provider responses, and contact payloads are absent from application logs, URLs after callback cleanup, error telemetry, screenshots, and audit details.
- [x] Ensure local backup export includes canonical contact data intentionally but never provider tokens or transient raw imports.
- [x] Add complete contact/company export and authorized erasure/archive workflows needed to support data-subject and organization requests.
- [x] Add retention cleanup for transient raw import state and detailed error payloads after the documented interval.
- [x] Review dependency licenses, maintenance, browser support, bundle size, and known vulnerabilities before adding vCard, spreadsheet, phone, or OAuth libraries.
- [x] Threat-model CSV formula injection, malicious XLSX/ZIP input, stored XSS, OAuth CSRF/state mismatch, token leakage, IDOR/cross-tenant access, duplicate poisoning, and destructive import undo.
- [x] Add focused regression tests for every identified threat and document accepted residual risks.

### Phase 10 acceptance

- [x] Contacts follows purpose limitation, data minimization, accuracy, storage limitation, confidentiality, and accountability in the implemented workflows.
- [x] No provider credential or token is present in persisted browser data, exported backups, logs, or audits.
- [x] Viewer/editor/admin/owner behavior is consistent in the UI, repository, and hosted RLS.
- [x] Malicious import fixtures cannot execute formulas/scripts, exhaust unbounded resources, cross tenants, or leave partial data.

## 15. Phase 11 — localization, accessibility, responsive design, and usability

- [x] Add German and English translation keys for navigation, index views, fields, filters, roles, custom roles, forms, import steps, mapping, duplicate review, merge, provider consent, errors, results, undo, exports, and help.
- [x] Keep translation-catalog key parity and remove participant copy that becomes obsolete after migration.
- [x] Use locale-aware person-name display without assuming every name follows a Western given-name/family-name order.
- [x] Support international phone numbers, email addresses, company names, postal addresses, and right-to-left characters as data even though the UI locales remain German and English.
- [x] Ensure every table, tab, filter, dialog, drawer, menu, file drop zone, progress state, mapping control, merge decision, and provider action has an accessible name and keyboard behavior.
- [x] Make drag-and-drop optional; every drop action must have an equivalent file-picker or connector action.
- [x] Announce parsing, import progress, validation errors, result counts, and undo outcomes appropriately to assistive technology.
- [x] Preserve visible focus and logical focus return across previews, dialogs, nested mapping controls, provider popups, and route navigation.
- [x] Ensure color is not the sole indicator of source, duplicate confidence, validation state, or import outcome.
- [x] Verify long German company names, roles, headings, and validation messages wrap without clipping.
- [x] Verify Contacts at compact laptop, standard desktop, wide desktop, tablet, and supported mobile widths.
- [x] Prevent horizontal application overflow while allowing an intentionally scrollable data table where needed.
- [x] Add concise in-product import help for Outlook CSV/vCard, Google export, iCloud vCard, and direct-drag limitations.

### Phase 11 acceptance

- [ ] Every Contacts workflow is complete and understandable in German and English.
- [ ] Keyboard-only users can create, find, import, map, merge, assign, export, archive, and restore contacts.
- [x] Serious and critical accessibility checks pass on all Contacts and project-participant surfaces.
- [x] Contacts remains usable at every supported viewport without hidden primary actions.

## 16. Phase 12 — automated tests, visual QA, and live acceptance

### Domain and repository tests

- [x] Test contact, company, affiliation, contact-method, assignment, role, external-identity, import-batch, archive, and merge invariants.
- [x] Test name, email, phone, domain, and address normalization without destructive display changes.
- [x] Test duplicate ranking and prove fuzzy candidates never merge automatically.
- [x] Test atomic create/update/merge/import/undo behavior and conflict handling.
- [x] Test resolved project participants and staleness propagation for every dependent output.
- [ ] Test published revision immutability after live contact, company, affiliation, assignment, merge, archive, and import updates.
- [x] Test local schema migration across all legacy fixtures and prove repeated migration is idempotent.
- [x] Test repository organization isolation and role permissions.
- [x] Test Supabase migration constraints and RLS with local hosted-schema tests.

### Parser and import tests

- [ ] Test vCard 2.1, 3.0, and 4.0, folded lines, quoted-printable values, escaping, multiple cards, multiple methods, international data, malformed cards, and ignored private fields.
- [ ] Test comma, semicolon, and tab delimiters; BOM; quoted newlines; embedded delimiters; localized headers; empty columns; encoding errors; and oversized input.
- [ ] Test XLSX sheet/header selection, leading zeros, cached values, formula cells, malformed ZIPs, excessive expansion, unsupported formats, and password protection.
- [ ] Test automatic and manual field mapping for Outlook, Google, German, English, and generic CRM fixtures.
- [ ] Test import preview, overwrite decisions, duplicate handling, optional project assignment, reporting, cancellation, retry, and undo.
- [ ] Test CSV formula-injection protection and HTML/script rendering protection.
- [x] Test vCard and CSV export round trips.

### Provider tests

- [ ] Test Microsoft authentication state, least-privilege scopes, folder selection, pagination, mapping, external identity, re-import, cancellation, throttling, token expiry, and retry through mocks.
- [ ] Test Google authentication state, least-privilege scopes, group selection, pagination, mapping, external identity, re-import, cancellation, quota errors, token expiry, and retry through mocks.
- [x] Test that tokens and raw provider payloads are not persisted or included in backups/audits.
- [x] Test connector-unconfigured states without requiring production secrets in automated CI.
- [ ] Record successful credentialed live smoke tests for Microsoft and Google using dedicated test accounts.

### Component and browser journeys

- [ ] Add Contacts navigation, direct-link, tab, search, filter, sort, column, pagination, preview, and bulk-action component coverage.
- [ ] Add complete manual person and company create/edit/archive/restore journeys.
- [ ] Add duplicate detection and contact/company merge journeys.
- [ ] Add file import journeys for vCard, Outlook CSV, German semicolon CSV, Google CSV, multi-sheet XLSX, invalid files, cancellation, result reporting, and undo.
- [ ] Add mocked Connect Outlook and Connect Google browser journeys through final import and optional project assignment.
- [x] Add an existing-project journey that searches Contacts, assigns several roles, changes a role, and removes an assignment without deleting the contact.
- [ ] Add a new-project journey that selects existing contacts, creates one inline, preserves selections through navigation, and creates assignments atomically.
- [ ] Add a regression journey proving contact edits mark current documents stale while an existing published revision remains unchanged.
- [ ] Add viewer-permission and cross-organization denial journeys.
- [x] Run all primary Contacts and project-assignment journeys in Chromium and WebKit.

### Visual and manual QA

- [ ] Inspect People and Companies indexes, previews, details, forms, filters, bulk actions, empty states, and archived states in German and English.
- [ ] Inspect every import-wizard step with new, duplicate, invalid, large, partial, cancelled, successful, and undo-conflict data.
- [ ] Inspect contact selection during existing-project and new-project workflows at all supported desktop sizes.
- [ ] Inspect responsive/mobile layouts and keyboard focus order.
- [ ] Run the direct Outlook drag matrix and record actual results by Outlook/browser/operating-system combination.
- [ ] Import real sanitized exports produced by current Outlook, Google Contacts, and iCloud rather than relying only on handcrafted fixtures.
- [ ] Export QuickSiGe contacts and verify import into current Outlook, Google Contacts, and iCloud where supported.
- [ ] Generate and inspect representative participant Word documents, A0 PDF, A4 plan, plan title block, and revision exports before and after a live contact update.
- [ ] Verify no provider tokens, import controls, contact-management chrome, stale indicators, or current values leak into historical exported revisions.

### Quality gate

- [x] `npm run lint` passes with zero warnings.
- [x] All unit and component tests pass with the final exact counts recorded.
- [x] The production TypeScript/Vite build passes.
- [x] All Chromium and WebKit browser tests pass with the final exact counts recorded.
- [x] Contact/export QA fixtures generate successfully and are visually inspected.
- [x] Supabase migrations apply cleanly to an empty database and an Iteration 2-compatible database.
- [x] Supabase RLS tests pass for every organization role and cross-tenant case.
- [x] The dependency audit reports no high or critical vulnerabilities.
- [x] `run_local.sh` starts the completed product successfully at the documented URL.
- [ ] A production-like build with configured Microsoft and Google test applications completes both live import smoke tests.

## 17. Phase 13 — documentation and operational readiness

- [x] Update the README implemented scope, acceptance walkthrough, architecture, hosted path, and quality status for Contacts.
- [x] Add a dedicated Contacts architecture document covering entities, relationships, resolver behavior, imports, providers, snapshots, and privacy decisions.
- [x] Document every local schema migration and hosted Supabase migration, including rollback/recovery expectations.
- [x] Update `.env.example` with non-secret Microsoft and Google application configuration and clear setup comments.
- [x] Document Microsoft and Google app registration, redirect URIs, allowed origins, test accounts, least-privilege scopes, and credential rotation/removal.
- [x] Document how to export contacts from current Outlook, Google Contacts, and iCloud for file import.
- [ ] Document verified direct Outlook drag support and fallbacks without overstating compatibility.
- [x] Document import limits, supported encodings/formats, matching rules, overwrite behavior, merge behavior, undo limitations, and error-report privacy.
- [x] Document viewer/editor/admin/owner permissions for Contacts and exports.
- [x] Add release and migration notes explaining how existing project participants become reusable Contacts.
- [x] Update backup/recovery documentation to explain included contact data and excluded transient provider credentials.
- [x] Add a support checklist for failed OAuth consent, blocked popups, expired tokens, provider throttling/quotas, malformed files, duplicate confusion, and import undo conflicts.

### Phase 13 acceptance

- [x] A developer can configure and verify both provider connectors without undocumented steps or committed secrets.
- [x] A user can understand file import, provider import, matching, overwrite, merge, assignment, export, and undo behavior from product help/documentation.
- [x] Operations can diagnose a failed import without collecting access tokens or unnecessary personal data.

## 18. Definition of done

Iteration 3 is complete only when all of the following are true:

- [ ] Every checkbox in Sections 2 through 18 is checked.
- [x] Contacts is a dedicated primary workspace named Contacts/Kontakte with People and Companies views.
- [x] People, companies, affiliations, contact methods, project assignments, roles, and external identities have one canonical source of truth.
- [x] Existing participant and compatible overview data migrates automatically without loss or duplication.
- [x] Emergency contacts remain separate and continue to work.
- [x] Contacts can be created, edited, searched, filtered, sorted, configured, archived, restored, exported, duplicate-reviewed, and safely merged.
- [x] VCF, CSV/TSV, and XLSX file imports provide preview, mapping, validation, duplicate decisions, atomic commit, reporting, and safe undo.
- [x] Drag-and-drop accepts supported contact files and accurately communicates direct Outlook limitations.
- [ ] Microsoft Outlook import works end to end with delegated `Contacts.Read` and no persisted token.
- [ ] Google Contacts import works end to end with `contacts.readonly` and no persisted token.
- [x] Contacts can be assigned to existing projects and during project creation with zero or more standard/custom roles.
- [x] All current project views, plans, documents, placeholders, exports, and publication flows use the canonical resolved-participant selector.
- [x] Live contact changes invalidate dependent current outputs while historical revision snapshots remain unchanged.
- [x] Local persistence, Supabase migrations, constraints, RLS, backups, and audit events are implemented and tested.
- [ ] German and English interfaces, responsive layouts, keyboard workflows, and accessibility checks pass.
- [x] Security, privacy, malicious-import, cross-tenant, permission, and token-leakage tests pass.
- [ ] Automated quality gates, real sanitized file smoke tests, provider live smoke tests, visual QA, document QA, and export round trips pass.
- [ ] Documentation and operational setup are complete and match observed behavior.
- [ ] The final implementation summary reports exact test counts, provider/file test coverage, migration results, remaining explicitly out-of-scope work, and confirms that no unchecked implementation item remains.

## 19. Implementation order summary

```text
Baseline and complete participant/source inventory
  -> canonical Contacts contracts and migration rules
  -> local and Supabase persistence with authorization
  -> Contacts navigation, index, details, CRUD, archive, and merge
  -> existing-project and new-project assignment workflows
  -> single resolved-participant path for documents, plans, and revisions
  -> shared import pipeline, validation, deduplication, reporting, and undo
  -> vCard, CSV/TSV, XLSX, drag-and-drop, and exports
  -> Microsoft Outlook connector
  -> Google Contacts connector
  -> privacy/security hardening, localization, accessibility, and responsiveness
  -> automated tests, real-file/provider smoke tests, visual/document QA
  -> documentation and final all-checkbox audit
```

Implementation must follow this dependency order. Provider and file adapters must reuse the source-neutral import pipeline. Project UI and documents must consume the canonical assignment resolver. Historical revisions must be verified before any legacy participant source is removed. The final audit must inspect this actual file and may not rely on memory, compilation alone, or a partial test run.

## 20. Primary implementation references

- Microsoft Graph contact resource and supported operations: <https://learn.microsoft.com/en-us/graph/api/resources/contact?view=graph-rest-1.0>
- Microsoft Graph permission reference for delegated `Contacts.Read`: <https://learn.microsoft.com/en-us/graph/permissions-reference>
- Microsoft authorization code flow with PKCE: <https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow>
- Google People API contact operations: <https://developers.google.com/people/v1/contacts>
- Google People API JavaScript read-only scope example: <https://developers.google.com/people/quickstart/js>
- Google OAuth security best practices: <https://developers.google.com/identity/protocols/oauth2/resources/best-practices>
- vCard 4.0 format standard: <https://www.rfc-editor.org/info/rfc6350/>
- Microsoft Outlook CSV import/export behavior: <https://support.microsoft.com/en-us/outlook/people/import-or-export-contacts-in-outlook-using-a-csv-file>
- Microsoft Outlook vCard behavior: <https://support.microsoft.com/en-us/outlook/send-and-save-contacts-as-vcards-vcf-files>
- Google Contacts file export behavior: <https://support.google.com/contacts/answer/7199294>
- Apple iCloud vCard import/export behavior: <https://support.apple.com/en-gb/guide/icloud/mmfba748b2/1.0/icloud/1.0?pp=iaqb>
- European Commission GDPR principles: <https://commission.europa.eu/law/law-topic/data-protection/information-business-and-organisations/principles-gdpr_en>

## 21. Verification record

Complete this section with measured results during implementation; do not mark any item from intention alone.

- [ ] Baseline Git state and unrelated changes recorded:
- [ ] Baseline lint result recorded:
- [ ] Baseline unit/component test counts recorded:
- [ ] Baseline production-build result recorded:
- [ ] Baseline Chromium/WebKit browser-test counts recorded:
- [ ] Baseline export-QA result recorded:
- [ ] Baseline dependency-audit result recorded:
- [x] Final local schema version and migration fixtures recorded: schema 36; seeded, empty, legacy participant/company override/project number, custom overview, reusable project roles, ordered project overview, detached project sections, idempotency, malformed-payload, and backup/recovery fixtures pass.
- [x] Final Supabase migration identifiers and RLS test results recorded: `202609290001_contacts_workspace.sql`, `202609300001_project_roles_overview_order.sql`, `202609300002_project_scoped_roles.sql`, and `202609300003_canonical_contact_company.sql`; empty and Iteration 2-compatible PostgreSQL 17 migrations plus canonical-company, owner/admin/editor/viewer/non-member/cross-tenant role assertions pass.
- [x] Final lint result recorded: `npm run lint` passes with zero warnings.
- [x] Final unit/component test counts recorded: 234 tests across 32 files pass.
- [x] Final production-build result recorded: TypeScript project build and Vite production bundle pass.
- [x] Final Chromium/WebKit browser-test counts recorded: 70 tests pass.
- [x] Final accessibility result recorded: the Contacts journey reports zero serious or critical axe violations in Chromium and WebKit.
- [x] Final dependency-audit result recorded: `npm audit --audit-level=high` reports zero vulnerabilities.
- [ ] Outlook CSV/vCard real sanitized smoke result recorded: pending a current Outlook-generated sanitized sample.
- [ ] Google CSV/vCard real sanitized smoke result recorded: pending a current Google Contacts-generated sanitized sample.
- [ ] iCloud vCard real sanitized smoke result recorded: pending a current iCloud-generated sanitized sample.
- [ ] XLSX import and round-trip result recorded: real XLSX parser fixtures pass; application/export round-trip acceptance remains pending.
- [ ] Direct Outlook drag matrix recorded: documented as unverified pending Windows/macOS client access.
- [ ] Microsoft Graph live test-account import and re-import result recorded: pending configured Entra test application and account.
- [ ] Google People live test-account import and re-import result recorded: pending configured Google OAuth test application and account.
- [ ] Provider token-persistence inspection recorded: mocked adapter tests verify in-memory operation; live browser-storage inspection remains pending.
- [ ] Contact CSV/vCard export round-trip results recorded: generated formats are structurally tested; live Outlook/Google/iCloud round trips remain pending.
- [x] Project assignment and new-project participant acceptance recorded: Chromium/WebKit existing-project journey and atomic multi-role new-project component test pass.
- [ ] A0 PDF, A4 Word plan, participant document, and published-revision QA recorded: A0 and four-page A4 visual QA pass; participant/revision export inspection after a live edit remains pending.
- [ ] German/English visual and responsive QA recorded: automated localization/accessibility, long German content, and five Contacts viewport classes pass in Chromium/WebKit; the full manual bilingual/focus-order matrix remains pending.
- [x] `run_local.sh` startup and HTTP result recorded: Vite ready on `http://localhost:4173/` and returned HTTP 200.
- [ ] Final audit confirms every implementation checkbox is checked: intentionally false while the explicitly recorded acceptance work above remains.
