# QuickSiGe

QuickSiGe is an automation-first workspace for creating construction safety and health plans (SiGe-Pläne). A coordinator enters project facts once, completes a short adaptive assessment, reviews explainable recommendations, adjusts the generated plan, publishes a revision, and exports the resulting documentation package.

This repository contains a complete local QuickSiGe product build. It runs without external services so the full workflow can be evaluated immediately. The application is separated from persistence through repository and blob-storage boundaries so hosted adapters can be added without rewriting product workflows.

## Start QuickSiGe

Requirements: Node.js 24 and npm.

```bash
./run_local.sh
```

The launcher installs locked dependencies when needed and then starts the development server. Alternatively, run `npm install` followed by `npm run dev` manually.

Open [http://localhost:4173](http://localhost:4173). The port is fixed so links and QA instructions stay reproducible.

The browser starts with the supplied project **Logistikzentrum West**. Structured data is stored in browser `localStorage` and binary template files in IndexedDB; use **Settings → Reset workspace** to return to the supplied starting state.

## Suggested acceptance walkthrough

1. Open **Contacts**, review the reusable people and companies directory, and assign a contact to **Logistikzentrum West**.
2. Open **Safety plan** and choose **Create new draft → Guided project assessment**.
3. Change a few hazards and review the automatic recommendations. Each suggestion includes its reason and can be included or excluded.
4. Generate the plan and continue in the editor. The same dialog can also start empty, copy the current plan, or create a draft from a published revision.
5. Add emergency contacts and open **Documents** to attach a validated PNG, JPG, or PDF project file to the plan.
6. Search the categorized block library, drag blocks to exact A0 positions, resize them, and edit their visible title or description without changing the catalog default.
7. Run validation and publish a named revision.
8. Download the one-sheet vector A0 PDF or A4 Word plan from the plan toolbar. In **Templates**, choose **Create document**, select a project, and download a report from any uploaded Word template.
9. Switch the interface and template library between German and English in **Settings**. Word reports use their template language.

You can also create a completely new project from the dashboard. The seeded data uses `.test` email addresses and contains no real personal data.

## Implemented product scope

- Premium responsive project dashboard and guided workflow
- Organization-wide Contacts workspace with people, companies, deduplication, archive/restore, search, filtering, CSV/vCard export, and safe import undo
- vCard, CSV/TSV, and Excel imports with field mapping and duplicate review; optional one-time read-only Microsoft 365 and Google Contacts connectors
- Canonical project-contact assignments with multiple standard or custom roles, reused by plan previews and generated documents
- German and English UI catalogs with locale-aware formatting
- German and English Word template languages
- Organization profile settings with structured address, company contact details, website, validated logo upload, and owner/admin editing
- Recursive German/English building-block categories, multi-category assignment, and full catalog management
- Adaptive project assessment and indicative BaustellV requirement evaluation
- Versioned assessment runs and traceable plan origins without a separate assessment workspace tab
- One active working plan per project with preserved superseded drafts and immutable published revisions
- Deterministic, explainable recommendation engine
- Automatic plan composition followed by a physical A0 WYSIWYG editor with drag, resize, snapping, and undo/redo
- Validated PNG/JPG/PDF project assets and real document elements that can be positioned on the A0 page
- Inline project data and custom-section editing with reusable overview templates
- Plan validation, named approval, audit trail, and immutable revision snapshots
- Physical one-page A0 landscape PDF export
- User-managed DOCX templates with project selection, dynamic placeholders, loops, unknown-placeholder checks, and download-only Word output
- A4 safety-plan export plus arbitrary custom Word reports sharing the same project and organisation data
- Deterministic test data, automated tests, CI, Docker, and Fly.io configuration

The bundled safety content is starter material. Its regulation references are intentionally marked for project-specific professional verification before customer or live-project use. QuickSiGe supports qualified professional judgment; it does not replace it.

## Commands

```bash
npm run dev          # local app on port 4173
./run_local.sh       # install dependencies when needed and start the local app
npm run check        # lint, tests, build, Chromium/WebKit journeys, dependency audit
npm run test         # Vitest suite
npm run test:contacts-db # disposable PostgreSQL migration and Contacts RLS checks
npm run qa:exports   # write representative exports to /private/tmp/quicksige-export-qa
npm run build        # production bundle in dist/
npm run preview      # serve the production bundle locally
```

## Architecture

- `src/domain`: domain contracts, requirement assessment, and recommendation rules
- `src/data`: deterministic seed data and the local repository adapter
- `src/state`: application use cases and persistence orchestration
- `src/i18n`: semantic UI translation keys and locale formatting
- `src/pages` and `src/components`: React application and design system
- `src/documents`: restricted Word-template platform and generated placeholder reference
- `docs/WORD_TEMPLATES.md`: current placeholder syntax, dynamic naming, and document creation workflow
- `src/export`: physical A0 vector PDF rendering
- `docs/CONTACTS.md`: Contacts entities, migration, imports, connector setup, privacy, and troubleshooting
- `MVP.md` and `MVP_iteration_*.md`: product scope, delivery state, and checkable implementation plans

The UI is React 19, TypeScript, React Router, and Vite. The local adapter stores a versioned `AppDatabase` document and migrates existing browser data. All state changes go through `AppProvider` and `AppRepository`, keeping the UI independent of the future Supabase adapter. Published revisions snapshot the project, physical plan layout, category, and localized block content so old exports cannot silently change when catalog content evolves.

Organisation details are managed in **Settings → Organisation**, independently of the signed-in account. Only the name is required. Postal codes and house numbers remain text; phone, mobile, and fax numbers are validated and stored in international format, with separate landline and fax extensions. Phone fields show the country calling code separately from the international-format digits; national-number entry and pasted international numbers are accepted, with country-specific prefixes handled automatically. Each number has a searchable country calling-code selector showing country names and flags, defaulting to the organisation country while allowing independent choices. Logos accept verified PNG/JPG images up to 2 MB and 16 megapixels and retain their proportions. The local adapter stores logo bytes in IndexedDB and profile metadata in localStorage. Owners and admins can edit; editors and viewers have read access.

New A4 Word reports use the organisation profile for branding, and custom templates can reference `qs.organization` fields listed in Templates. Publishing captures the profile and its immutable logo reference. Profile changes mark current generated documents stale while preserving published snapshots and their logo files. Legacy revisions without an organisation snapshot remain unbranded. The corresponding Supabase profile migration includes owner/admin update policies and is covered by the disposable PostgreSQL migration gate; the app continues to use its local adapter until the hosted path below is connected.

## Hosted path

The current repository interfaces carry organization ownership and keep relational metadata separate from binary storage. `.env.example` documents the future public Supabase settings. The production container serves the static application through nginx and includes the Fly.io health endpoint.

Before a hosted pilot, connect the repository interface to Supabase Auth/Database/Storage, add server-side mutation authorization, finalize legal content review, and run tenant-isolation tests against a real local Supabase instance. These deployment hardening tasks do not block local product evaluation.

### Contact connector setup

File imports need no external configuration. Microsoft contact import uses Microsoft Graph scopes `User.Read` and `Contacts.Read`; Google import uses `contacts.readonly` plus basic account identity. Set `VITE_MICROSOFT_CLIENT_ID` and/or `VITE_GOOGLE_CLIENT_ID` from `.env.example`, and register the exact QuickSiGe origin in the corresponding SPA/OAuth client. Provider tokens use in-memory browser storage, are never written to the QuickSiGe database, and Google tokens are revoked after the one-time import. Imported records are previewed before commit and retain only the provider account/contact identifiers needed to recognize a later re-import.

## Quality status

The automated gate includes 282 Vitest tests across 34 files and 120 Playwright checks split across Chromium and WebKit. Contacts coverage includes create/import/export/project assignment, multi-role import, JSON portability export, persisted workspace preferences, bulk tagging, reviewed merge choices, company lifecycle impact review, a 10,000-contact bounded-rendering fixture, and five responsive viewport classes. A disposable PostgreSQL 17 gate verifies the Contacts migration against empty and Iteration 2-compatible databases plus owner/admin/editor/viewer/non-member and cross-tenant RLS behavior. The export QA fixture covers an exact one-page A0 landscape PDF and a template-generated four-page A4 DOCX; both are rendered and inspected during release QA.
