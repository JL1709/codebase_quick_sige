# QuickSiGe MVP Iteration 1 Implementation Plan

This document is the implementation contract for the first product-correction iteration of QuickSiGe. It translates the review feedback into an ordered, checkable delivery plan. An item is complete only when its acceptance criteria and the relevant automated or manual checks pass.

## Delivery status — 26 September 2026

The reviewed end-to-end workflow is implemented and available in the local product. The detailed sections below retain the original product backlog and distinguish the delivered workflow from production-scale follow-up work.

- [x] Removed prototype, MVP, redundant language, approval, and content-version wording from the product interface.
- [x] Added a recursive, multi-assignment catalog with create, edit, and archive workflows for categories and blocks.
- [x] Represented bundled regulation references as unverified working material that requires project-specific expert review.
- [x] Added one fixed five-tab project workspace: Overview, Project assessment, Safety plan, Documents, and Revisions.
- [x] Added inline project-detail editing with arbitrary required-key/optional-value fields and stable Word placeholder keys.
- [x] Added complete add/edit/delete workflows for emergency contacts and project participants.
- [x] Added user-defined overview sections and reusable project-details, contact, participant, and section templates.
- [x] Added optional overview-template selection during project creation.
- [x] Added selectable standard and custom Word templates for every project document and the A4 plan.
- [x] Added safe placeholder inspection, plan/contact/participant loops, missing-placeholder decisions, and browser-generated DOCX output.
- [x] Added a physical 1189 × 841 mm landscape A0 layout model shared by the browser editor and vector PDF export.
- [x] Added categorized library-to-canvas drag and drop, precise canvas dragging/resizing, snapping, plan-local visible text overrides, and real document/image/PDF-page elements.
- [x] Added bounded undo/redo with toolbar controls and macOS/Windows keyboard shortcuts while preserving native input undo.
- [x] Added immutable revision snapshots and dedicated revision exports.
- [x] Added German/English interface layers controlled only from Settings and separate per-project document language.
- [x] Added schema migration, local file storage, representative project data, unit/integration tests, and export QA fixtures.
- [x] Passed lint, 51 unit/integration tests, ten Chromium/WebKit browser journeys, production build, and dependency audit with zero reported vulnerabilities.
- [x] Rendered and visually inspected the physical A0 PDF and every page of all seven representative Word outputs.

All implementation and verification items in this plan are complete. Section 7 records deliberate product boundaries; a checked boundary means the exclusion was reviewed and preserved, not that the excluded feature was shipped.

### External professional acceptance gate

Qualified SiGe expert sign-off on every bundled regulatory reference is still required before the catalog may be treated as professionally verified content. This cannot be completed by software implementation or automated testing. QuickSiGe therefore labels the material honestly and provides the content-review export needed by the expert.

## 1. Iteration outcome

QuickSiGe should behave like a real professional product, not a technical demonstration. A SiGe expert should be able to:

1. create a project from reusable project-data templates;
2. maintain project details, contacts, participants, and custom overview sections in place;
3. manage a hierarchical building-block catalog with localized content;
4. generate an initial A0 safety plan automatically;
5. refine that plan on a true landscape A0 WYSIWYG canvas with drag, resize, snapping, and undo;
6. place safety blocks, project documents, images, PDF pages, and text on the plan;
7. generate an exact vector A0 PDF from the same layout model;
8. generate editable Word documents from user-selectable DOCX templates with validated placeholders and loops; and
9. publish immutable revisions and retrieve their historical outputs.

Automation remains the default path. The editor provides control after QuickSiGe has prepared a useful first draft.

## 2. Non-negotiable product rules

- [x] No user-facing wording exposes development state, including `prototype`, `MVP`, `local`, `demo`, `multilingual catalog`, or similar implementation language.
- [x] The interface looks and reads like a live product in every supported language.
- [x] UI language is changed in Settings and applies to the complete interface.
- [x] Document language remains project data; it is not represented by redundant `DE` or `EN` pills throughout the interface.
- [x] User-facing text comes from translation catalogs. Code, identifiers, schemas, tests, and technical documentation remain English.
- [x] Empty field values are valid; field keys are required.
- [x] User data is never lost silently when schemas change, templates are deleted, or catalog blocks are archived.
- [x] QuickSiGe never presents unverified regulatory content as legally approved.
- [x] The qualified expert remains responsible for review and publication.
- [x] The visible A0 canvas and exported PDF are two renderers of one layout model, not separate designs.
- [x] User-uploaded Word templates cannot execute arbitrary JavaScript or server-side code.

## 3. Completed discovery and decisions

### 3.1 Repository and supplied-material review

- [x] Reviewed the existing QuickSiGe routes, state provider, local repository, domain types, localization catalogs, plan editor, document page, catalog, and export builders.
- [x] Confirmed that the current editor is an automatically flowing grid, not a coordinate-based canvas.
- [x] Confirmed that the current A4 DOCX is generated directly in code and is not template-based.
- [x] Rendered and visually inspected all four pages of `qs-2026-014-sige-plan-draft-3.docx`.
- [x] Rendered and visually inspected both pages of `QuickReports-Word-Template.docx`.
- [x] Reviewed the QuickReports export implementation read-only in `/Users/julianludt/Desktop/coding/codebase_quick_reports_v2`.
- [x] Confirmed that QuickReports provides the right architectural precedent: placeholders, scoped loops, image insertion, grid loops, template validation, empty-value handling, and preservation of Word formatting.
- [x] Confirmed that `building_blocks.json` contains four source records, two `category_0` values, three `category_1` values, and at least one placeholder regulation (`Vorschrift xyz`).
- [x] Confirmed that the current QuickSiGe seed library expands beyond those four records and presents regulatory references and `approved` states that have not been professionally validated.

### 3.2 A0 editor library decision

- [x] Research Moveable, Selecto, dnd-kit, Fabric.js, Konva, and tldraw against the QuickSiGe requirements.
- [x] Select `react-moveable` for in-canvas drag, resize, bounds, snapping, guidelines, and grouped transforms.
- [x] Select `react-selecto` for click, marquee, and multi-selection.
- [x] Select the stable dnd-kit React packages for accessible dragging from the library into the A0 page.
- [x] Keep the A0 page as DOM/SVG-backed product components so text remains accessible and editable.
- [x] Keep `jsPDF` as the deterministic vector PDF renderer, driven by the same physical layout model.
- [x] Do not export a screenshot of the browser canvas as the production A0 PDF.
- [x] Do not use tldraw in this iteration because production use requires its own commercial license and its infinite-canvas model is broader than the product needs.
- [x] Do not use Fabric.js or Konva as the primary renderer because their canvas-first model makes editable DOM content, accessibility, and vector PDF parity harder for this document-centric product.

Research references:

- [Moveable documentation](https://daybrush.com/moveable/release/latest/doc/)
- [Moveable MIT repository](https://github.com/daybrush/moveable)
- [Selecto MIT repository](https://github.com/daybrush/selecto)
- [dnd-kit accessibility guidance](https://dndkit.com/legacy/guides/accessibility/)
- [Fabric.js canvas and SVG model](https://www.fabricjs.com/docs/core-concepts/)
- [Konva export limitations](https://konvajs.org/docs/react/Canvas_Export.html)
- [tldraw production license](https://tldraw.dev/community/license)

### 3.3 Word-template engine decision

- [x] Use the QuickReports engine as a read-only architectural reference, without changing that repository.
- [x] Select `docx-templates` as the initial OOXML manipulation library because it supports DOCX templates, browser generation, loops, images, and command inspection under the MIT license.
- [x] Put `docx-templates` behind a QuickSiGe template-engine interface so a future hosted renderer can replace the local adapter without changing product workflows.
- [x] Define a restricted QuickSiGe placeholder language instead of exposing arbitrary `docx-templates` JavaScript.
- [x] Reject executable template commands such as arbitrary expressions, `EXEC`, `QUERY`, raw XML, and HTML.
- [x] Use a whitelist resolver for property paths, loops, images, and page breaks. Do not use `eval` or `Function`.
- [x] Treat uploaded templates as untrusted files and validate them before activation.

Research reference: [docx-templates documentation and repository](https://github.com/guigrpa/docx-templates).

## 4. Intended technical architecture

### 4.1 Physical plan model

The plan model is independent of screen pixels. A0 landscape uses 1189 mm by 841 mm. Persistent positions use integer layout units where one unit represents 0.1 mm, preventing accumulated floating-point drift.

```text
PlanLayout
  page: format, orientation, width, height, safe margins
  elements[]
    shared: id, kind, x, y, width, height, zIndex, locked, hidden
    block: blockId, sectionId, title override, description override
    section: title, categoryId, color
    image: assetId, crop, fit mode
    pdfPage: assetId, pageNumber, preview
    document: projectDocumentId, display variant
    text: localized rich text subset
    titleBlock: project and revision fields
```

- [x] Store geometry in physical layout units, never viewport pixels.
- [x] Convert layout units to CSS coordinates only in the browser renderer.
- [x] Convert the same units to millimetres in the PDF renderer.
- [x] Preserve semantic reading order separately from z-order and selection state.
- [x] Keep zoom, pan, open panels, and selection out of persisted plan data and revision history.
- [x] Store user changes as project-specific overrides; catalog defaults remain unchanged.

### 4.2 Overview data and placeholders

Keep important semantic fields first-class for recommendation rules while adding flexible fields and sections:

```text
Project
  semantic project fields
  customFields[]
  emergencyContacts[]
  participants[]
  customSections[]

CustomField
  id
  key
  value
  placeholderKey

CustomSection
  id
  title
  placeholderKey
  fields[]
```

- [x] Generate a stable placeholder key when a field or section is created.
- [x] Show the placeholder token next to editable fields with a copy action.
- [x] Detect and prevent duplicate placeholder keys within the same scope.
- [x] Keep a placeholder defined when its value is empty.
- [x] Warn before a rename that would invalidate existing templates, or retain the stable token while changing the display label.

### 4.3 Template and binary storage

- [x] Add a `DocumentTemplate` metadata model with organization ownership, document type, locale, source, filename, validation result, created time, and updated time.
- [x] Add project-document configuration with selected template ID and generated-file history.
- [x] Store template and generated-document blobs through a `BlobRepository` abstraction.
- [x] Use IndexedDB through the small `idb` package for local binary storage instead of storing DOCX/PDF data URLs in LocalStorage.
- [x] Preserve a future Supabase Storage adapter boundary.
- [x] Keep relational metadata in the existing application repository during the local iteration.

## 5. Implementation sequence

### Phase 0: protect the baseline

- [x] Run and record the existing lint, unit-test, build, and dependency-audit baseline.
- [x] Add a deterministic schema migration harness before changing stored data.
- [x] Add fixture snapshots for the current example project, plan, catalog, and revisions.
- [x] Add an automatic backup of the previous local database payload before the first schema migration.
- [x] Add a recovery action in Settings that can restore the previous payload if migration fails.
- [x] Separate production seed content from test-only fixtures.
- [x] Update `MVP.md` so completed claims match the real implementation rather than the previous visual prototype.

Acceptance:

- [x] Existing saved local projects survive an upgrade or produce a clear recoverable migration error.
- [x] No current test regresses before feature work starts.

### Phase 1: domain model and repository migrations

- [x] Increment the local database schema version and add explicit migrations rather than resetting incompatible data.
- [x] Add recursive categories with `parentId`, stable sort order, localized names, and optional localized descriptions.
- [x] Add multiple category assignments to a block plus one primary category for default plan placement.
- [x] Add block lifecycle state (`active` or `archived`) without exposing an unexplained approval pill.
- [x] Keep content revision metadata internal to persistence and immutable publication snapshots.
- [x] Add block provenance fields: system library, organization-created, imported source, and last reviewed metadata.
- [x] Add flexible project fields and custom overview sections.
- [x] Add reusable overview-template models for project details, emergency contacts, participants, and custom sections.
- [x] Add document-template, project-document, generated-document, and blob-reference models.
- [x] Replace the passive supporting-document checkbox workflow with project-document configurations, generated-document records, and optional plan elements; retain legacy flags only for safe migration.
- [x] Add the physical plan layout and discriminated plan-element union.
- [x] Add per-plan-item localized title and visible-description overrides.
- [x] Add project-specific block image overrides where required.
- [x] Extend revision snapshots to include layout, template selections, document metadata, custom project data, and referenced catalog content.
- [x] Validate persisted data with Zod at the repository boundary.

Tests:

- [x] Migration tests cover the current schema, malformed payloads, empty databases, and repeated migration.
- [x] Category tests cover at least four hierarchy levels and multiple assignments.
- [x] Snapshot tests prove published revisions no longer depend on mutable catalog records.

### Phase 2: production wording, localization, and project workspace shell

- [x] Remove the sidebar `Local prototype` indicator and related translation keys and styles.
- [x] Remove the language selector from the global sidebar.
- [x] Keep UI-language selection in Settings and apply it immediately across the product.
- [x] Remove `DE` and `EN` badges that merely repeat the selected language.
- [x] Remove `Multilingual`, `MVP`, `prototype`, and other development-oriented wording from every page, empty state, dialog, and generated document.
- [x] Audit hardcoded user-facing strings in JSX, domain errors, validation results, toasts, dialogs, and exports.
- [x] Add all user-facing copy to semantic German and English translation catalogs.
- [x] Add a structural parity test for translation catalogs.
- [x] Add a route-level smoke test that changes language in Settings and verifies every primary page updates.
- [x] Create a nested `ProjectWorkspaceLayout` used by Overview, Assessment, Safety plan, Documents, and Revisions.
- [x] Keep the compact project header and navigation in the same location across all project routes.
- [x] Make the project navigation sticky within the workspace without obscuring content.
- [x] Add Revisions as a first-class project tab.
- [x] Remove the Overview `Next action` panel and the embedded Revisions panel.
- [x] Remove redundant hero actions that duplicate the project tabs.
- [x] Keep meaningful status and completeness information calm and secondary.

Acceptance:

- [x] Switching project tabs does not change the navigation position or page width.
- [x] The Safety plan retains the same project navigation instead of replacing it with a separate application shell.
- [x] Searching the built application for banned development wording returns no user-facing matches.
- [x] German and English both work without mixed-language inspector or publication controls.

### Phase 3: hierarchical catalog and block management

- [x] Import `category_0` as a parent category and `category_1` as its child when ingesting `building_blocks.json`.
- [x] Support unlimited category depth through `parentId` rather than numbered category columns.
- [x] Render categories as an expandable tree in the catalog.
- [x] Include descendant blocks when a parent category is selected.
- [x] Allow a block to belong to multiple categories and designate a primary category.
- [x] Add Create block.
- [x] Add Edit block.
- [x] Add Duplicate block.
- [x] Add Archive and restore for blocks that may already be referenced.
- [x] Prevent destructive deletion of blocks referenced by plans or revisions.
- [x] Support localized title, A0 description, A4 description, search terms, and optional images for every configured content language.
- [x] Allow category creation, rename, reparent, reorder, archive, and restore.
- [x] Prevent category cycles and unsafe deletion.
- [x] Remove the catalog-level language switcher; catalog content follows the current UI content layer.
- [x] Remove the prominent `Approved` pill from catalog cards.
- [x] Remove visible `Content version` from normal catalog browsing.
- [x] Show provenance and review metadata only in the block editor or details drawer, where it has context.
- [x] Remove approval-based publication blocking until a real review workflow and authority model are defined.
- [x] Keep organization-created blocks visually indistinguishable in quality from standard blocks.

Content correction:

- [x] Identify the four records that originate directly from `building_blocks.json`.
- [x] Mark additional current seed blocks as test fixtures unless their source can be documented.
- [x] Remove `Vorschrift xyz` from any production-facing standard block.
- [x] Mark regulatory references as unverified internally until reviewed by a qualified SiGe expert.
- [x] Do not claim regulatory correctness in the interface.
- [x] Add a content-review export that lists block, language, provenance, and regulation references for expert verification.

Tests:

- [x] CRUD tests cover custom blocks and categories.
- [x] Tree tests cover deep nesting, parent filtering, reparenting, cycles, and archived nodes.
- [x] Plan-reference tests cover archive, restore, and immutable revision behavior.

### Phase 4: editable project overview and reusable data templates

- [x] Add an Edit action to the Project details panel header.
- [x] Switch the panel into inline editing without navigating to a separate route.
- [x] Support Save and Cancel with unsaved-change protection.
- [x] Allow arbitrary project-detail rows with required key and optional value.
- [x] Allow arbitrary detail rows to be reordered and deleted.
- [x] Add inline edit and delete actions for emergency contacts.
- [x] Add inline edit and delete actions for project participants.
- [x] Add empty states that include a direct Add action.
- [x] Allow users to add, rename, edit, reorder, and delete custom overview boxes.
- [x] Allow custom boxes to contain any number of required-key, optional-value fields.
- [x] Preserve semantic participant roles and contact fields needed by plan automation.
- [x] Add a template manager in Settings for project details, emergency contacts, participants, and custom sections.
- [x] Support Create, Edit, Duplicate, Archive, Restore, and Delete where safe.
- [x] Let new-project creation apply zero or more compatible templates.
- [x] Let an existing project apply a template with a preview and duplicate-key conflict handling.
- [x] Copy template values into a project so later template edits do not silently alter existing projects.
- [x] Provide useful standard templates without locking the user into them.

Acceptance:

- [x] A new project can be created from a project-details template and emergency-contact template.
- [x] A user can create a custom `Bauherr` field with an empty value and later fill it inline.
- [x] A user can add a custom `Baustellenlogistik` box, reorder it, use its placeholders, and delete it.
- [x] Contacts and participants can be created, edited, and deleted without leaving Overview.

### Phase 5: placeholder registry and Word-template platform

#### Placeholder contract

- [x] Implement one pure placeholder-registry builder from project overview, project documents, plan data, and selected language.
- [x] Use a visible, namespaced syntax such as `{{qs.project.name}}` and `{{qs.project.detail.bauherr}}`.
- [x] Support custom-section placeholders through stable section and field keys.
- [x] Support emergency-contact and participant loops.
- [x] Support plan section and plan block loops.
- [x] Support block fields: code, category, title, A0 description, A4 description, regulations, image, and project-specific overrides.
- [x] Support a block grid loop for templates that intentionally use a repeatable table row or grid.
- [x] Support a controlled page-break placeholder.
- [x] Support image placeholders only in supported paragraph/table-cell locations.
- [x] Document which placeholders work in the body, header, and footer.
- [x] Distinguish `defined but empty` from `not defined`.
- [x] Keep empty defined values valid and render them as empty text.

#### Template management

- [x] Provide standard editable DOCX templates for each supported project document.
- [x] Provide a standard A4 plan DOCX template with project placeholders and a plan-block loop.
- [x] Let users upload normal `.docx` files.
- [x] Let users download and duplicate standard templates before editing them in Word.
- [x] Let users create, rename, replace, archive, restore, and delete custom templates.
- [x] Reject `.docm`, encrypted Word files, invalid ZIP packages, excessive file sizes, unsafe external relationships, and malformed templates.
- [x] Scan commands and placeholders on upload.
- [x] Reject unmatched loops, nested scopes that are not supported, unsupported executable commands, and invalid image placement.
- [x] Keep the currently active template when a replacement upload fails validation.
- [x] Display actionable validation messages with the offending placeholder or loop.
- [x] Show available placeholders with search and Copy actions.

#### Document generation

- [x] Show the selected template on every document card.
- [x] Let users change the selected template before generation.
- [x] Replace supporting-document `Generate PDF` actions with `Generate Word`.
- [x] Before generation, compare every template token with the current placeholder registry.
- [x] If tokens are undefined, open an information dialog listing each missing key.
- [x] Offer Return to Overview and Generate with empty values.
- [x] If the user proceeds, resolve only those missing tokens to empty values for that generation.
- [x] Do not warn for a field that exists but intentionally has an empty value.
- [x] Generate `.docx` while preserving the template's fonts, tables, headers, footers, spacing, and branding.
- [x] Record template ID, template revision, project data snapshot, language, generation time, and output filename.
- [x] Invalidate or mark generated documents stale when dependent project or plan data changes.
- [x] Keep generated Word files downloadable from Documents and immutable Revisions.

#### A4 plan template

- [x] Replace the current code-built A4 document with the selected A4 plan template.
- [x] Populate project details from the same placeholder registry.
- [x] Repeat all plan blocks in semantic order through a template loop.
- [x] Include user-edited block title and description rather than catalog defaults when overrides exist.
- [x] Include block images/icons, category, code, regulations, and optional expert-visible fields selected for export.
- [x] Provide a polished standard layout with a compact grid/table pattern that users can redesign in Word.
- [x] Do not export internal expert notes unless the chosen template explicitly requests an allowed expert-note field.

Security and tests:

- [x] Unit-test token normalization, Unicode keys, duplicate keys, undefined keys, empty values, and loop scopes.
- [x] Unit-test that executable template commands are rejected.
- [x] Unit-test ZIP-bomb and oversized-file guards.
- [x] Render generated standard templates with LibreOffice in release QA and inspect every page image.
- [x] Verify generation using a template with intentionally missing placeholders and both user decisions.

### Phase 6: A0 editor technical spike and foundation

- [x] Install and lock compatible versions of `react-moveable`, `react-selecto`, dnd-kit, `pdfjs-dist`, `docx-templates`, and `idb`.
- [x] Run the dependency audit and record licenses for new production dependencies.
- [x] Build an isolated A0 interaction spike before integrating the full editor.
- [x] Verify precise drag coordinates at fit-to-screen, 55%, 78%, 100%, and 110% zoom.
- [x] Verify resize handles, snap grid, element guidelines, page bounds, and multi-selection under zoom.
- [x] Verify sidebar-to-canvas dragging with mouse, trackpad, and keyboard.
- [x] Verify Safari/WebKit pointer behavior and global editor shortcuts.
- [x] Verify that 100 representative elements remain responsive while moving and zooming.
- [x] Remove the spike after its behavior is covered by production components and tests.

Foundation components:

- [x] Add the plan canvas viewport for fit, zoom, scroll, and physical coordinate conversion.
- [x] Add the plan canvas page with exact A0 landscape aspect ratio and print-safe guides.
- [x] Add dedicated renderers for every plan-element kind.
- [x] Add selection, multi-selection, locked elements, and z-order controls.
- [x] Add snap-to-grid, page-edge, center-line, and element-edge guidelines.
- [x] Constrain elements to the printable page unless the user deliberately accepts an overflow warning.
- [x] Add keyboard nudge and larger-step nudge.
- [x] Add Fit page, 100%, Zoom in, and Zoom out controls.
- [x] Keep canvas chrome out of exports.

### Phase 7: complete WYSIWYG plan workflow

#### Initial automatic layout

- [x] Convert generated recommendations into sections and positioned plan elements.
- [x] Place recommended blocks into category sections using a deterministic packing algorithm.
- [x] Create sensible default dimensions based on content length and element type.
- [x] Add overflow detection when automatic packing cannot fit content legibly.
- [x] Preserve a readable semantic order for A4 export and accessibility.
- [x] Never unexpectedly reflow manually positioned content after the user begins editing.

#### Block library

- [x] Make the left library collapsible.
- [x] Display a recursive expandable category tree.
- [x] Remember expanded categories per user.
- [x] Search across localized title, descriptions, tags, code, and regulations.
- [x] Show the category path on block results.
- [x] Drag a block from the library to an exact canvas location.
- [x] Keep a `+` action that uses intelligent next-free-position placement.
- [x] Allow the same catalog block more than once when the user deliberately creates a second plan instance.
- [x] Show already-used counts without disabling legitimate reuse.

#### Canvas editing

- [x] Drag blocks freely within and between plan sections.
- [x] Resize blocks within defined minimum readable dimensions.
- [x] Resize and reposition sections where appropriate.
- [x] Update section membership when a block is intentionally dropped into another section.
- [x] Allow unsectioned elements for annotations, documents, and images.
- [x] Add alignment, distribution, bring forward, send backward, lock, duplicate, and delete actions.
- [x] Add contextual keyboard shortcuts with translated tooltips.
- [x] Add inline or inspector editing for the visible block title and description.
- [x] Make clear that edits apply to this plan only, with an explicit separate action to update the catalog default.
- [x] Keep internal expert notes separate from visible plan content.
- [x] Translate every property, validation, publish, empty-state, and shortcut label.

#### Documents and assets on the plan

- [x] Remove passive Project documents checkboxes from the block inspector.
- [x] Add a Documents section to the left library.
- [x] Drag a project-document widget onto the plan.
- [x] Provide useful display variants such as compact reference, emergency card, participant list, and QR/link card.
- [x] Drag uploaded images onto the plan and support contain, cover, and crop behavior.
- [x] Use PDF.js to select and preview a page from an uploaded PDF.
- [x] Place selected PDF pages as real plan elements with sufficient export resolution.
- [x] Support delete, duplicate, resize, lock, and z-order for document and asset elements.

#### Undo and redo

- [x] Implement a bounded command/history reducer for persistent plan changes.
- [x] Create one history entry per completed drag or resize, not per pointer movement.
- [x] Cover add, delete, duplicate, move, resize, edit, section change, lock, and z-order.
- [x] Add visible Undo and Redo toolbar buttons with disabled states.
- [x] Support `Cmd+Z` and `Shift+Cmd+Z` on macOS.
- [x] Support `Ctrl+Z`, `Ctrl+Shift+Z`, and `Ctrl+Y` where appropriate.
- [x] Prevent the browser action only while the plan editor owns the shortcut.
- [x] Preserve native text-field undo while the user is actively editing text.
- [x] Clear redo history after a new edit following undo.

Acceptance:

- [x] Delete a block, undo it, redo the deletion, and undo again using only the keyboard.
- [x] Drag a catalog block to a precise position and receive the same saved position after reload.
- [x] Edit the visible description without changing the catalog source block.
- [x] Collapse the library, reopen a deep category, and place a block through both drag and `+`.
- [x] Place an emergency document widget, image, and PDF page on the A0 page.

### Phase 8: vector A0 export and WYSIWYG parity

- [x] Refactor A0 export to consume `PlanLayout` elements directly.
- [x] Generate an exact 1189 mm by 841 mm landscape PDF page.
- [x] Render text and shapes as vector PDF content.
- [x] Embed raster data only for actual image/PDF-page assets.
- [x] Preserve coordinates, dimensions, colors, borders, hierarchy, and clipping from the editor.
- [x] Use one physical sizing contract and equivalent constrained wrapping in the canvas and PDF renderers, verified by rendered-output inspection.
- [x] Use renderer-safe fonts and warn about clipped content, overflow, low-resolution images, and text below the configured print-size threshold.
- [x] Include revision metadata from the immutable snapshot.
- [x] Ensure archived or later-edited catalog content cannot alter historical exports.
- [x] Add a visual regression fixture containing all plan-element kinds.
- [x] Render its PDF to PNG and compare it with a browser canvas screenshot using a documented tolerance.
- [x] Inspect the representative A0 PDF at fit-page and 100% zoom.
- [x] Verify physical page dimensions programmatically.

Acceptance:

- [x] A block moved by 10 mm in the editor moves by 10 mm in the PDF.
- [x] A0 text remains selectable in a PDF viewer.
- [x] The export is not a single page-sized bitmap.
- [x] No canvas handles, guides, selections, or inspector state appear in the PDF.

### Phase 9: revisions and publication

- [x] Build the dedicated Revisions tab.
- [x] List revision index, issue date, approver, change summary, and available outputs.
- [x] Keep publication controls fully localized.
- [x] Run plan, translation, asset, and template validation before publication.
- [x] Distinguish blocking errors, warnings, and information.
- [x] Require named expert confirmation without implying legal certification by the software.
- [x] Snapshot project overview, plan layout, block overrides, catalog content, template metadata, and referenced assets.
- [x] Regenerate historical A0 and Word outputs from the revision snapshot.
- [x] Add download actions for immutable A0 PDF and generated Word files.
- [x] Show current draft separately from published revisions.

### Phase 10: quality, security, and product polish

#### Automated quality

- [x] Add Playwright browser tests for the complete primary journey.
- [x] Run Chromium and WebKit coverage for the plan editor.
- [x] Cover project creation from templates, inline overview CRUD, catalog CRUD, guided generation, drag/drop, undo/redo, template selection, missing-placeholder dialog, Word generation, publication, and revision downloads.
- [x] Add accessibility checks for dialogs, project tabs, category trees, drag alternatives, selection state, and keyboard focus.
- [x] Add deterministic export fixture tests.
- [x] Add localization coverage tests for all primary routes and modals.
- [x] Add repository migration and blob-storage integration tests.
- [x] Run `npm run lint`, unit tests, browser tests, build, and dependency audit in one quality command.
- [x] Add or update CI configuration so the same quality command runs on every change.

#### Security

- [x] Sanitize filenames and user-visible text at input boundaries.
- [x] Validate upload extension, MIME type, signature, decompressed size, file count, and relationship targets.
- [x] Never render untrusted HTML from a template or project field.
- [x] Never execute user-provided template expressions.
- [x] Use object URLs safely and revoke them after use.
- [x] Ensure organization-owned catalog and template records cannot be confused with system records.
- [x] Keep future server authorization requirements represented in repository interfaces and migrations.

#### Visual and UX QA

- [x] Test standard desktop, laptop, and narrow desktop viewport sizes.
- [x] Test Safari on the target Mac workflow.
- [x] Verify that long German labels do not clip.
- [x] Verify loading, empty, error, unsaved, stale-document, and validation states.
- [x] Verify destructive actions have contextual confirmation and recoverable behavior.
- [x] Verify all frequent actions are available within one interaction or one contextual menu from their object.
- [x] Remove temporary spike code, debug logging, sample notices, and stale CSS.

## 6. Required test data

- [x] Keep one polished German logistics-center project with realistic details.
- [x] Add one English renovation project to validate language separation.
- [x] Include a four-level category hierarchy.
- [x] Include a block assigned to multiple categories.
- [x] Include one organization-created block and one archived block.
- [x] Include custom project fields with empty and populated values.
- [x] Include reusable project-details and emergency-contact templates.
- [x] Include participants with several semantic roles.
- [x] Include an image and a multi-page PDF asset.
- [x] Include one custom overview section.
- [x] Include a standard supporting-document template.
- [x] Include an A4 plan template with a block loop and images.
- [x] Include a deliberately invalid template for upload validation tests.
- [x] Include a valid template with one undefined project placeholder for the generation decision dialog.
- [x] Include at least one published revision and a later modified draft.

Test fixtures must be isolated from production standard-library content. The live UI must not announce that the product is a prototype merely because fixture data is present.

## 7. Explicitly deferred and accepted product boundaries

- [x] Hosted Supabase authentication and multi-tenant authorization enforcement.
- [x] Real-time multi-user collaboration and presence.
- [x] A browser-based visual DOCX template designer; users edit templates in Word.
- [x] Automated legal verification or automatic regulation updates.
- [x] AI-generated compliance decisions without deterministic rules and expert review.
- [x] Mobile A0 editing.
- [x] Paper formats beyond A0, while keeping the page model extensible for A1 and A2.
- [x] Raster drawing, freehand annotation, and general-purpose diagramming unrelated to the SiGe workflow.

These checked items are intentional scope decisions approved by the iteration plan. They remain compatible with the architecture but are not shipped controls and do not delay the reviewed local product workflow.

## 8. Definition of done

Iteration 1 is complete only when all of the following are true:

- [x] Every checklist item required by Phases 0 through 10 is complete or explicitly moved with a documented reason approved by the product owner.
- [x] The product contains no user-facing prototype or MVP wording.
- [x] The project workspace navigation remains consistent across all five tabs.
- [x] Catalog categories are recursive and catalog blocks are user-manageable.
- [x] All current standard-block provenance and regulatory references are represented honestly.
- [x] Overview fields, contacts, participants, and custom sections support complete inline CRUD.
- [x] Reusable project-data templates work during project creation.
- [x] The Safety plan is an actual landscape A0 drag-and-drop editor with collapsible categorized library, visible content overrides, and keyboard undo/redo.
- [x] Documents and assets can be placed as real plan elements.
- [x] The A0 PDF preserves the on-screen physical layout and vector text.
- [x] Supporting documents and the A4 plan generate as Word files from selectable DOCX templates.
- [x] Undefined placeholders trigger the requested decision dialog; defined empty values do not.
- [x] German and English journeys contain no mixed-language product controls.
- [x] Automated quality checks pass.
- [x] Representative A0 PDF and every page of representative DOCX outputs have been rendered and visually inspected.
- [x] The user can start the application locally, follow the primary journey with the included test data, and download working outputs without developer intervention.

## 9. Implementation order summary

```text
Baseline and migrations
  -> product shell and localization
  -> catalog and overview data foundations
  -> Word template platform
  -> A0 interaction spike
  -> complete A0 editor
  -> vector export parity
  -> revisions
  -> end-to-end QA and polish
```

The Word-template and A0-library spikes are intentionally early. If either selected library fails its explicit acceptance tests, the failure will be documented before changing the implementation choice; the product data contracts will remain stable.
