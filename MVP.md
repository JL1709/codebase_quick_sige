# QuickSiGe MVP

QuickSiGe is an automation-first workspace for producing safety and health plans for construction projects. The product turns structured project facts and a short guided assessment into a useful first draft, then gives the SiGe expert precise control over the plan, editable Word documents, and immutable published revisions.

The detailed implementation and acceptance record is maintained in [`MVP_iteration_1.md`](./MVP_iteration_1.md). That file is the release checklist for the current local product.

## Delivered workflow

- [x] Create projects from reusable project-information, contact, participant, and custom-section templates.
- [x] Edit project details, arbitrary key/value fields, emergency contacts, participants, and custom overview sections in place.
- [x] Complete a guided project assessment and review explainable deterministic recommendations.
- [x] Generate a positioned landscape A0 plan automatically from the accepted recommendations.
- [x] Manage a recursive, localized, multi-category building-block catalog with create, edit, duplicate, archive, and restore workflows.
- [x] Refine the plan on a physical A0 WYSIWYG canvas with drag/drop, resize, snapping, multi-selection, alignment, layers, locking, duplication, keyboard nudging, and bounded undo/redo.
- [x] Place catalog blocks, text, project-document widgets, images, and selected PDF pages directly on the plan.
- [x] Export a one-page 1189 mm × 841 mm vector A0 PDF from the same physical layout model used by the editor.
- [x] Manage normal `.docx` templates and generate the A4 plan plus six supporting documents as editable Word files.
- [x] Resolve namespaced placeholders, scoped loops, images, grids, and controlled page breaks without executing template code.
- [x] Detect undefined template placeholders and let the user return to the project or intentionally generate empty values.
- [x] Publish named immutable revisions and regenerate historical A0 and Word outputs from their captured snapshots.
- [x] Use complete German and English interface layers selected in Settings, independently from each project's document language.
- [x] Preserve structured metadata in versioned local storage and binary files in IndexedDB, with migration backup and recovery.
- [x] Ship deterministic German and English evaluation projects, catalog content, templates, assets, and a published revision.

## Quality and security

- [x] Persisted records are validated at the repository boundary and migrated without silently discarding older projects.
- [x] Project-file uploads validate extension, MIME type, binary signature, file size, and total storage limits.
- [x] Word-template uploads reject macros, encryption, malformed packages, unsafe relationships, excessive expansion, and non-whitelisted commands.
- [x] Catalog provenance distinguishes starter, imported, and organization-owned content without presenting unverified regulations as approved.
- [x] The release command runs lint, 51 unit/integration tests, a production build, ten Chromium/WebKit browser journeys, and a high-severity dependency audit.
- [x] Representative exports include one A0 PDF and seven Word documents; every rendered page has been visually inspected.

## Professional responsibility

QuickSiGe supports qualified professional judgment and never claims that generated content is legally approved. Bundled regulation references are working material and must receive qualified SiGe expert review before customer or live-project use. The catalog's content-review export provides the provenance and reference list needed for that review.

## Deliberate product boundaries

The current release is a complete local product workflow. Hosted authentication and tenant enforcement, real-time collaboration, a browser-based DOCX designer, automatic legal updates, autonomous AI compliance decisions, mobile A0 editing, additional paper formats, and general-purpose freehand drawing are deliberately outside this iteration. The repository and domain boundaries keep those future capabilities possible without exposing incomplete controls in the current product.
