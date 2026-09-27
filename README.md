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

1. Open **Logistikzentrum West** and review the project facts, participants, and contact data.
2. Open **Guided assessment**, change a few hazards, and save the answers.
3. Review the automatic recommendations. Each suggestion includes its reason and can be included or excluded.
4. Generate the plan and open the editor.
5. Add emergency contacts and open **Documents** to attach a validated PNG, JPG, or PDF project file to the plan.
6. Search the categorized block library, drag blocks to exact A0 positions, resize them, and edit their visible title or description without changing the catalog default.
7. Run validation and publish a named revision.
8. Download the one-sheet vector A0 PDF and generate the A4 plan and supporting documents from selectable Word templates.
9. Switch the complete interface between German and English in **Settings**; the document language remains a project setting.

You can also create a completely new project from the dashboard. The seeded data uses `.test` email addresses and contains no real personal data.

## Implemented product scope

- Premium responsive project dashboard and guided workflow
- German and English UI catalogs with locale-aware formatting
- Independent UI and document languages
- Recursive German/English building-block categories, multi-category assignment, and full catalog management
- Adaptive project assessment and indicative BaustellV requirement evaluation
- Deterministic, explainable recommendation engine
- Automatic plan composition followed by a physical A0 WYSIWYG editor with drag, resize, snapping, and undo/redo
- Validated PNG/JPG/PDF project assets and real document elements that can be positioned on the A0 page
- Inline project data, participant, contact, and custom-section editing with reusable overview templates
- Plan validation, named approval, audit trail, and immutable revision snapshots
- Physical one-page A0 landscape PDF export
- Selectable and user-managed DOCX templates with safe placeholders, loops, missing-field checks, and editable Word output
- A4 plan block loops plus Word outputs for site principles, alarm, fire, first aid, participants, and advance notice
- Deterministic test data, automated tests, CI, Docker, and Fly.io configuration

The bundled safety content is starter material. Its regulation references are intentionally marked for project-specific professional verification before customer or live-project use. QuickSiGe supports qualified professional judgment; it does not replace it.

## Commands

```bash
npm run dev          # local app on port 4173
./run_local.sh       # install dependencies when needed and start the local app
npm run check        # lint, unit/component tests, type-check, production build
npm run test         # Vitest suite
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
- `src/documents`: restricted Word-template platform and placeholder registry
- `src/export`: physical A0 vector PDF rendering
- `MVP.md` and `MVP_iteration_1.md`: product scope, delivery state, and future work

The UI is React 19, TypeScript, React Router, and Vite. The local adapter stores a versioned `AppDatabase` document and migrates existing browser data. All state changes go through `AppProvider` and `AppRepository`, keeping the UI independent of the future Supabase adapter. Published revisions snapshot the project, physical plan layout, category, and localized block content so old exports cannot silently change when catalog content evolves.

## Hosted path

The current repository interfaces carry organization ownership and keep relational metadata separate from binary storage. `.env.example` documents the future public Supabase settings. The production container serves the static application through nginx and includes the Fly.io health endpoint.

Before a hosted pilot, connect the repository interface to Supabase Auth/Database/Storage, add server-side mutation authorization, finalize legal content review, and run tenant-isolation tests against a real local Supabase instance. These deployment hardening tasks do not block local product evaluation.

## Quality status

`npm run check` currently passes with 51 tests across twelve suites and ten Playwright journeys split across Chromium and WebKit. The export QA fixture has been rendered and inspected as an exact one-page A0 landscape PDF, a two-page template-generated A4 DOCX, and six template-generated supporting DOCX files. The dependency audit reports no known vulnerabilities.
