# QuickSiGe MVP Iteration 2 Implementation Plan

This document is the implementation contract for the second product-correction iteration of QuickSiGe. It translates the 27 September 2026 review into ordered, testable work. A checkbox may be marked complete only after its observable acceptance criteria pass. The iteration may be called complete only when every checkbox in this document is checked.

## 1. Iteration outcome

QuickSiGe should become calmer and more direct:

1. Projects shows project information without unexplained scores or plan-content statistics.
2. Project creation presents reusable templates cleanly at every supported desktop size.
3. Templates is a first-class workspace rather than a subsection of Settings.
4. The block catalog contains product content without development-stage disclaimers.
5. The Safety plan behaves like a professional direct-manipulation document canvas.
6. Every visible plan component can be selected and, where it contains content, edited directly.
7. Canvas tools and validation live in a contextual top toolbar instead of a permanent right inspector.
8. Validation identifies the exact affected element and navigates the user to it.

## 2. Non-negotiable product rules

- [x] Do not expose unexplained percentages, technical heuristics, development disclaimers, or fixture-oriented helper text in the product interface.
- [x] Prefer direct manipulation and in-context actions over detours, permanent inspectors, and duplicated controls.
- [x] Keep all new user-facing text in the German and English translation catalogs; keep code and identifiers in English.
- [x] Preserve all existing projects, plans, templates, revisions, document outputs, and catalog content through schema changes.
- [x] Keep the on-screen A0 plan, exported A0 PDF, revision snapshots, and Word-plan data driven by compatible plan content.
- [x] Preserve undo and redo for every new canvas mutation.
- [x] Do not claim completion while any checkbox in this plan remains unchecked.

## 3. Phase 0 — baseline, investigation, and safeguards

- [x] Record the current lint, unit/component test, production-build, browser-test, and dependency-audit baseline.
- [x] Add or update deterministic fixtures for the dashboard, project-creation form, Templates workspace, and A0 editor.
- [x] Trace the current `Project completeness` implementation and document exactly why the seeded `Logistikzentrum West` project displays 89%.
- [x] Identify and remove dead completeness-score logic and translation keys after the visible score is removed, unless another tested workflow still requires them.
- [x] Identify the CSS rule causing Overview-template labels to leave their selection cards.
- [x] Reproduce the project-creation footer spacing problem at the viewport represented by the supplied screenshot.
- [x] Reproduce the stale selection rectangle after completing a canvas drag.
- [x] Confirm whether the stale rectangle originates in Moveable, Selecto, React selection state, or coordinate conversion before changing behavior.
- [x] Review established design-canvas zoom conventions and record the chosen mouse, trackpad, and keyboard behavior in the repository documentation.
- [x] Define a safe database migration before adding editable structural plan elements.

### Phase 0 acceptance

- [x] Existing saved local data loads without reset before implementation begins.
- [x] Every reported defect has a repeatable test or written reproduction sequence.
- [x] The chosen zoom interaction is consistent with professional canvas tools and does not unexpectedly zoom the browser chrome.

## 4. Phase 1 — Projects dashboard and project creation

### Projects dashboard

- [x] Remove `Project completeness` and its progress bar from every project tile.
- [x] Remove the building-block count tile or label from every project tile.
- [x] Remove associated inaccessible or obsolete status text, translation keys, and styling.
- [x] Keep project tiles focused on project identity and useful project information such as name, number, location, schedule, and status.
- [x] Keep the primary action and complete project tile keyboard-accessible without adding visual noise.
- [x] Verify that tiles with missing optional project information retain a balanced layout.

### Create Project layout

- [x] Keep every Overview-template checkbox, name, description, and template type inside its own selection row.
- [x] Make the complete template row clickable while preserving native checkbox semantics.
- [x] Prevent long German and English template names from overflowing or compressing adjacent content.
- [x] Give the template list a deliberate maximum height and internal scrolling when many templates exist.
- [x] Add consistent bottom and right padding around Cancel and Continue.
- [x] Keep the action footer visually separated from the form body and usable when the template list scrolls.
- [x] Prevent horizontal page overflow at all supported desktop widths.
- [x] Preserve template selection, project validation, Cancel, and Continue behavior.

### Phase 1 acceptance

- [x] No unexplained percentage or building-block count appears on Projects.
- [x] Project tiles communicate only project-level information.
- [x] Create Project is visually correct at 1280×720, 1440×900, 1728×1117, and 1920×1080.
- [x] The screenshot failure case is reproduced by a regression test and passes after the fix.
- [x] A project can still be created with no template, one template, or several compatible templates.

## 5. Phase 2 — Templates as a first-class workspace

### Navigation and routing

- [x] Add `Templates` as a primary sidebar destination alongside Projects, Block catalog, and Settings.
- [x] Add a dedicated `/templates` route with a production-quality title and description.
- [x] Give Templates an appropriate navigation icon and active state.
- [x] Ensure browser Back/Forward navigation and direct deep links work for Templates.
- [x] Add German and English navigation, page, empty-state, action, and dialog copy.

### Template workspace

- [x] Move project-details templates out of Settings and into Templates.
- [x] Move emergency-contact templates out of Settings and into Templates.
- [x] Move participant templates out of Settings and into Templates.
- [x] Move custom-section templates out of Settings and into Templates.
- [x] Move Word document templates out of Settings and into Templates.
- [x] Move the placeholder reference and search into Templates.
- [x] Group template types clearly without describing technical implementation details.
- [x] Preserve create, edit, duplicate, archive, restore, download, replace, and safe-delete behavior.
- [x] Keep standard and organization-created templates visually consistent while retaining necessary ownership behavior internally.
- [x] Preserve selection of templates during project creation and document generation.

### Settings cleanup

- [x] Remove all template management and placeholder content from Settings.
- [x] Keep Settings limited to actual preferences and workspace controls, including interface language and local-data recovery/reset.
- [x] Remove empty layout gaps, obsolete headings, and unused template-specific styles from Settings.

### Phase 2 acceptance

- [x] No template-management UI remains under Settings.
- [x] Every template workflow available before the move still works from Templates.
- [x] Existing saved template IDs and project-template selections remain valid after the route move.
- [x] Templates and Settings pass keyboard, responsive-layout, and serious/critical accessibility checks in German and English.

## 6. Phase 3 — Block catalog product cleanup

- [x] Remove the visible starter-content and regulatory-reference helper sentence from the catalog.
- [x] Remove its translation keys and unused notice styling.
- [x] Close the resulting whitespace so search, filters, categories, and catalog cards retain a balanced hierarchy.
- [x] Remove internal provenance, review metadata, and the expert-review export from the block catalog.
- [x] Confirm that catalog search, category filtering, block overflow actions, archive/restore, and editing still work.

### Phase 3 acceptance

- [x] The catalog contains no development-stage disclaimer or fixture-oriented helper text.
- [x] Catalog layout remains visually balanced with the notice removed.
- [x] Catalog CRUD and accessibility browser tests pass in Chromium and WebKit.

## 7. Phase 4 — A0 viewport, fit, pan, and deep zoom

### Fit behavior

- [x] Replace the separate `Fit page` and `100%` preset actions with one unambiguous `Fit plan` action.
- [x] Calculate fit zoom from the actual canvas viewport after subtracting navigation, toolbar, and open library space.
- [x] Fit the complete landscape A0 page with a deliberate safety gutter and without cutting off any edge.
- [x] Recalculate fit correctly after window resizing and opening or closing the block library.
- [x] Keep the current zoom percentage as passive feedback rather than a competing preset action.
- [x] Provide a localized tooltip and accessible label explaining `Fit plan`.

### Zoom and pan behavior

- [x] Replace the 115% ceiling with named zoom limits that support detailed editing; target at least 10%–800% unless testing proves a different safe range.
- [x] Make toolbar zoom-in and zoom-out use predictable steps across the complete range.
- [x] Zoom toward the pointer position so the detail under the cursor remains stable.
- [x] Support `Ctrl + wheel` on Windows/Linux and the verified platform-standard modifier on macOS while the pointer is over the canvas.
- [x] Support trackpad pinch-to-zoom without triggering browser-page zoom.
- [x] Support `Ctrl/Cmd + +`, `Ctrl/Cmd + -`, and the documented fit shortcut when focus is not inside a text input.
- [x] Keep ordinary wheel/trackpad scrolling available for canvas navigation and support horizontal navigation through the established platform gesture.
- [x] Prevent canvas shortcuts from overriding native editing shortcuts while an input or inline editor has focus.
- [x] Keep zoom and pan as transient view state; never write them into the physical A0 layout or revision snapshot.

### Phase 4 acceptance

- [x] One click fits all four A0 edges inside every supported viewport.
- [x] A user can zoom from a full-plan view into small text and handles without hitting the former 115% limit.
- [x] Modifier-wheel, trackpad, toolbar, and keyboard zoom are tested in Chromium and WebKit.
- [x] Zooming never changes element geometry in the saved plan or exported PDF.

## 8. Phase 5 — Stable selection and drag interaction

- [x] Remove the stale selection/transform rectangle left at an element’s drag origin.
- [x] Keep the active selection outline synchronized with the element’s final position during and after pointer drag.
- [x] Refresh Moveable/Selecto geometry after drag, resize, zoom, fit, library collapse, and viewport resize.
- [x] Ensure only one selection treatment represents a selected element.
- [x] Keep the final moved element selected without flashing or jumping back to its old location.
- [x] Preserve snapping guides while ensuring guides disappear when the interaction ends.
- [x] Verify drag behavior for blocks, images, PDF pages, document cards, text, and newly editable structural elements.
- [x] Verify repeated drag → undo → redo → drag sequences do not accumulate stale overlays.

### Phase 5 acceptance

- [x] The supplied before/after drag scenario leaves no box at the original position.
- [x] Selection remains accurate at fit zoom and deep zoom.
- [x] Pointer, keyboard, and undo/redo tests cover moved-element geometry and selection state.

## 9. Phase 6 — Every visible plan component becomes interactive

### Plan-element model

- [x] Extend the plan-element model and migration so currently static structural content can participate in selection and editing.
- [x] Represent the plan header, QuickSiGe brand label, plan title, project metadata, category/section bands, and footer/title block as identifiable canvas elements or editable structural groups.
- [x] Give every interactive element a stable ID, kind, bounds, z-order, lock state, and revision-safe content snapshot.
- [x] Preserve default automatic plan composition for newly generated plans.
- [x] Migrate existing plans to equivalent editable structural elements without changing their visible layout.
- [x] Preserve vector-text and layout parity in A0 PDF export.

### Direct editing

- [x] Allow every visible canvas element to be selected by clicking it.
- [x] Enter inline text editing by double-clicking an editable text-bearing element.
- [x] Commit inline edits with the established confirmation behavior and cancel with Escape.
- [x] Keep inline text within its element bounds and surface overflow through validation.
- [x] Make project-specific plan edits overrides; do not silently rewrite catalog defaults or project overview data.
- [x] Support move, resize, lock/unlock, duplicate, layer ordering, and remove where those actions are valid for the element kind.
- [x] Protect required plan structure from accidental permanent loss through undo and an appropriate restore/default action.
- [x] Add every structural edit to the same undo/redo history as normal plan elements.

### Phase 6 acceptance

- [x] The QuickSiGe header label can be selected and edited directly on the canvas.
- [x] The plan title, project metadata, category bands, and title block can be selected and edited without a right sidebar.
- [x] Double-click editing works without moving the element or triggering browser text selection unexpectedly.
- [x] Saved drafts, published revisions, and A0 exports retain structural edits.
- [x] Existing revision snapshots continue to render correctly after migration.

## 10. Phase 7 — Contextual top toolbar and removal of the right inspector

- [x] Remove the permanent Properties/Validation right sidebar from the Safety plan.
- [x] Expand the canvas into the released horizontal space.
- [x] Keep global plan actions visually separate from selected-element actions.
- [x] Show contextual controls in the top toolbar only when an element is selected.
- [x] Provide the selected element’s identity in the toolbar without consuming excessive space.
- [x] Expose relevant content, style, image-fit/crop, alignment, layer, lock, duplicate, and remove actions according to element kind.
- [x] Use compact, accessible popovers for controls that do not fit as direct toolbar actions.
- [x] Ensure toolbar actions update immediately when the selection changes.
- [x] Keep destructive actions distinct and confirm only when undo cannot provide sufficient recovery.
- [x] Provide tooltips, accessible names, focus order, Escape behavior, and outside-click dismissal for every toolbar popover.
- [x] Prevent toolbar overflow at supported desktop widths; place lower-frequency actions in one contextual overflow menu when required.

### Phase 7 acceptance

- [x] No Properties or Validation sidebar remains.
- [x] All previously supported block, text, image, asset, and document-element properties remain editable from the canvas or top toolbar.
- [x] The wider canvas still supports collapsible access to the block library.
- [x] The top toolbar remains calm when nothing is selected and useful when an element is selected.

## 11. Phase 8 — Actionable validation in the toolbar

### Validation model and messages

- [x] Give each validation issue a stable issue ID, severity, rule code, affected element ID, localized title, explanation, and suggested action.
- [x] Replace generic overflow warnings with messages that name the exact element and explain what exceeds its available bounds.
- [x] Include the meaningful localized element name where available.
- [x] Keep professional-review warnings separate from technical layout errors so users understand what they can fix on the canvas.
- [x] Recalculate affected validation results after content edits, resizing, moving, deleting, undo, and redo.
- [x] Remove resolved issues immediately without changing unrelated issue order.

### Toolbar validation experience

- [x] Add one validation control with severity-aware issue count to the top toolbar.
- [x] Open validation results in an accessible dropdown or popover instead of a permanent sidebar.
- [x] Group or sort issues by severity and keep their labels readable in German and English.
- [x] Make every element-specific issue clickable.
- [x] When clicked, center the canvas on the affected element, adjust the view only as needed, select the element, and visibly focus or pulse it.
- [x] Keep keyboard focus predictable when navigating from an issue to the canvas.
- [x] Handle issues whose element was deleted or changed without crashing or navigating to stale coordinates.
- [x] Preserve publication blocking for actual errors while allowing the existing reviewed warning workflow.

### Phase 8 acceptance

- [x] No validation message concatenates severity, review wording, and problem text without spacing or hierarchy.
- [x] An overflow issue identifies the exact overflowing element.
- [x] Activating that issue visibly navigates to and selects the correct element at any zoom level.
- [x] Empty, warning-only, and error states are understandable without opening another page.

## 12. Phase 9 — Localization, accessibility, and responsive polish

- [x] Audit every new route, toolbar action, tooltip, popover, validation message, and empty state for German/English parity.
- [x] Remove obsolete translation keys for completeness, catalog notice, old zoom presets, Settings templates, and the right inspector.
- [x] Verify long German labels do not clip in project creation, Templates, or the Safety-plan toolbar.
- [x] Preserve visible keyboard focus throughout sidebar navigation, template cards, inline canvas editing, toolbar popovers, and validation navigation.
- [x] Ensure icon-only actions have localized accessible names.
- [x] Ensure popovers expose correct expanded state and return focus to their trigger when closed with Escape.
- [x] Maintain sufficient target sizes and contrast for canvas controls.
- [x] Test the editor at laptop, standard desktop, and wide desktop sizes without overlapping toolbars or hidden A0 edges.
- [x] Ensure there is no horizontal application overflow outside the intentional canvas viewport.

## 13. Phase 10 — automated tests and visual QA

### Unit and integration tests

- [x] Test the fit-zoom calculation across representative viewport and panel dimensions.
- [x] Test zoom clamping, zoom stepping, pointer anchoring, and transient view state.
- [x] Test project completeness removal and eliminate obsolete score expectations.
- [x] Test plan migration from static structural content to editable elements.
- [x] Test inline structural-content overrides, undo/redo, persistence, and revision snapshots.
- [x] Test validation issue metadata, element association, resolution, and stale-element handling.
- [x] Test route and repository behavior after moving Templates out of Settings.
- [x] Keep translation-catalog structural parity tests passing.

### Browser journeys

- [x] Add a Projects-page test proving project cards contain no completeness or building-block statistic.
- [x] Add a responsive Create Project template-selection test based on the supplied screenshot.
- [x] Add a Templates navigation and complete template-management journey.
- [x] Update Settings tests to prove template management is absent.
- [x] Add a catalog test proving the helper notice is absent while CRUD still works.
- [x] Add fit-plan tests at every supported viewport.
- [x] Add deep-zoom and modifier-wheel tests without browser-page zoom.
- [x] Add drag-selection synchronization regression coverage for the supplied stale-outline defect.
- [x] Add double-click inline editing tests for the QuickSiGe label and another structural element.
- [x] Add contextual-toolbar tests for every supported element family.
- [x] Add validation-popover tests that activate an issue and select its exact canvas element.
- [x] Run critical accessibility checks on Projects, Create Project, Templates, Settings, Catalog, and Safety plan.
- [x] Run the primary editor journey in Chromium and WebKit.

### Visual and export QA

- [x] Compare before/after screenshots for all three supplied defect cases.
- [x] Inspect the Projects dashboard and Create Project at all supported desktop viewports.
- [x] Inspect Templates and the cleaned Settings page in German and English.
- [x] Inspect fit view, deep zoom, inline editing, contextual controls, and validation navigation on the A0 canvas.
- [x] Generate and render a representative A0 PDF after structural edits.
- [x] Verify the PDF contains the edited header, title, metadata, section, and footer content in the correct physical positions.
- [x] Verify no selection handles, focus pulses, popovers, validation badges, or editor chrome appear in exported documents.

### Quality gate

- [x] `npm run lint` passes with zero warnings.
- [x] All unit and component tests pass.
- [x] The production TypeScript/Vite build passes.
- [x] All Chromium and WebKit browser tests pass.
- [x] The dependency audit reports no high or critical vulnerabilities.
- [x] `run_local.sh` starts the completed product successfully at the documented URL.

## 14. Definition of done

Iteration 2 is complete only when all of the following are true:

- [x] Every checkbox in Sections 2 through 14 is checked.
- [x] Projects contains only understandable project information and no completeness percentage or building-block count.
- [x] Create Project template selection and footer spacing are correct at every supported viewport.
- [x] Templates is a dedicated primary workspace and Settings contains no template management.
- [x] The block catalog contains no development-stage helper notice.
- [x] The A0 editor provides one reliable Fit plan action and deep, platform-appropriate zooming.
- [x] Canvas dragging leaves no stale selection rectangle.
- [x] Every visible plan component is selectable and editable as appropriate, including the header and QuickSiGe label.
- [x] The right inspector is gone and selected-element controls are available from the top toolbar or direct editing.
- [x] Validation names exact affected elements and clicking an issue navigates to the correct element.
- [x] Draft persistence, undo/redo, revisions, A0 PDF, Word generation, catalog management, and project creation have no regressions.
- [x] German and English interfaces contain no mixed-language or clipped controls.
- [x] Automated quality checks and visual/export QA pass.
- [x] The final implementation summary reports the exact test counts and confirms that no unchecked plan item remains.

## 15. Implementation order summary

```text
Baseline and reproducible defects
  -> Projects and project-creation cleanup
  -> dedicated Templates workspace and Settings cleanup
  -> catalog cleanup
  -> fit, zoom, pan, and selection synchronization
  -> editable structural plan elements and migrations
  -> contextual top toolbar and right-inspector removal
  -> actionable validation navigation
  -> localization, accessibility, browser tests, and export QA
  -> final all-checkbox audit
```

Implementation should follow this order because the editor’s structural-element model affects selection, toolbar actions, validation targeting, persistence, revisions, and export parity. The final audit must inspect the actual file and may not rely on memory or a partial test run.

## 16. Verification record

- Baseline captured before implementation: lint passed, 12 unit-test files with 51 tests passed, the production build passed, 10 Chromium/WebKit browser journeys passed, and the dependency audit reported zero vulnerabilities.
- The former 89% score was traced to `8 / 9` truthy completeness signals: all seeded fields were present except a published plan. The score, its translations, styles, implementation, and obsolete tests were removed.
- The project-template overflow was reproduced at the supplied laptop viewport and traced to the previous unconstrained selection-row layout. The rows now use contained, wrapping content with a bounded internal list and padded action footer.
- The stale canvas rectangle was reproduced after drag and traced to Moveable target geometry remaining at its pre-commit coordinates. Geometry is now refreshed after drag/resize and all view changes; the final target stays selected.
- Canvas interaction conventions and shortcuts are recorded in `docs/canvas-interactions.md` with primary-source references.
- Final automated gate on 27 September 2026: `npm run check` passed end to end—ESLint with zero warnings; 14 Vitest files and 61 tests; the TypeScript/Vite production build; 16 Playwright tests across Chromium and WebKit; and `npm audit --audit-level=high` with zero vulnerabilities.
- Visual QA covered Projects, Create Project, Templates, Settings, Catalog, contextual canvas controls, validation navigation, fit view, and exported output at the supported desktop widths and in both interface languages.
- Export QA generated and rendered `/private/tmp/quicksige-iteration-2-export-qa/demo-sige-plan-a0.pdf`: one landscape A0 page at 3370.39 × 2383.94 pt containing the representative edited header, title, project metadata, section title, coordinator, and footer reference, with no editor chrome.
- `run_local.sh` resolves the repository, validates Node.js/npm, installs locked dependencies when required, and starts Vite at `http://localhost:4173`; the completed product returned HTTP 200 at that URL during the final check.
