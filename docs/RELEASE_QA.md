# Iteration 1 release QA

## Automated gate

`npm run check` runs ESLint, all Vitest suites, the production build, Chromium and WebKit Playwright journeys, and the high-severity dependency audit. CI executes the same command after installing both browser engines.

The browser journeys cover language changes, the fixed five-tab workspace, inline Overview changes, template-based project creation, guided plan generation, exact canvas placement, keyboard undo/redo, catalog create/edit/archive/restore, safe DOCX upload, missing-placeholder decisions, Word generation, publication, revision downloads, and serious/critical accessibility violations.

## Export inspection

`npm run qa:exports -- output/export-qa` generates one physical A0 PDF and seven representative Word files. Release QA renders the A0 PDF with Poppler and every DOCX page with LibreOffice, then inspects the resulting PNG pages.

The representative A0 fixture includes sections, block cards, visible text, a title block, a supporting-document widget, an image, and a PDF-page element. Verification includes:

- one 1189 mm × 841 mm landscape page;
- selectable vector text rather than a page-sized bitmap;
- no editor chrome, selection handles, or inspector state;
- readable fit-page and 100% views;
- exact shared layout coordinates; and
- graceful labelled fallbacks for corrupt legacy media.

## Product-content gate

Bundled legal and regulatory references are deliberately labelled as unverified working material. The catalog can export a review list with source/provenance metadata. A qualified SiGe professional must approve those references before anyone treats them as professionally verified content; software tests cannot substitute for that decision.
