# QuickSiGe Word templates

Create documents from **Templates → Create document → Select project**. A generated document is downloaded as DOCX; it is not saved to the project's Documents tab. Project-only reports work without a safety plan. The existing A4 action in the safety-plan toolbar remains available.

Upload any normal DOCX layout with supported placeholders. Edit the layout and placeholders in Word, then upload the file. Project edits never rewrite uploaded templates. All templates use the same data model; no document-specific field mapping is required.

## Supplied prototype templates

The prototype includes 20 German DOCX templates from the supplied SiGeKo documents. They share the approved company logo, compact project details with project number, and a real Word footer containing the company address, website, phone, mobile, fax, email and page numbers. Brandschutzordnung Teil A retains its approved red frame. Longer instructions retain multiple pages, illustrations, form questions and references from the originals.

The templates are available in either interface language. Choose **Templates → Create document → Logistikzentrum West** to test them; the resulting documents remain German. Use **Edit** to replace a template with your own DOCX, or download its source file to edit in Word.

Existing workspaces receive the library once when reloaded, without a reset. Subsequent template edits, file replacements and deletions are retained. The example project also receives an editable **Vorankündigung** section with fictional recipient, coordinator and workforce details. These use ordinary dynamic paths such as `{{qs.project.vorankuendigung.behoerde.name}}`; they follow the same rename rules as all other overview data. Contractor answers, site-specific decisions and signatures remain blank for completion in Word.

The **Alarmplan** repeats the project's emergency contacts and assigned participants. **Lageplan** inserts the project's image attachments with their proportions preserved. The **Flucht- und Rettungsplan** retains the supplied example illustration, clearly labeled for replacement with a project-specific plan.

The catalog in `src/data/wordTemplateCatalog.json` is the shared source for library metadata and authoring. The DOCX assets live in `public/word-templates/`. To rebuild them, run `scripts/generate_word_templates.py` using a Python runtime with `python-docx` and pass the original reference directory. The builder checks the originals' recorded hashes and leaves them unchanged. It uses the approved document in `artifacts/word-template-design/` as the design reference. Run `npm run qa:word-templates` to validate all files and generate example-project outputs for rendering and visual review.

## Placeholder reference

The reference in Templates groups organisation fields separately from project fields. Select a project to see its saved section and field names, in the same section order as its overview. Rows show the field label, its complete placeholder and a current or example value. Image fields show file information rather than binary image data. Preview dates and standard role values use the interface language; generated documents use the template language.

Search matches labels, paths and example values across collapsed sections and opens matching groups. Long paths wrap inside the panel. **Copy** always copies the complete token, including its braces.

Repeating groups have a separate example and **Copy repeat block** action. The copied block includes all of the group's fields even when search displays only one field. Nested groups include their surrounding loop markers so the block can be pasted directly into Word. Declared fields remain available for empty groups. **How to use placeholders in Word** explains placement, naming, renaming and unknown placeholders.

## Placeholder names

Organisation fields use `qs.organization.*`, such as `{{qs.organization.name}}`, `{{qs.organization.email}}`, and `{{qs.organization.address.city}}`. The reference in Templates lists all organisation fields, including the logo image.

Built-in project properties are `{{qs.project.name}}`, `{{qs.project.number}}`, and `{{qs.project.language}}`. Overview fields follow their visible hierarchy:

```text
{{qs.project.allgemein.nummer}}
{{qs.project.allgemein.geplanter_beginn}}
{{qs.project.allgemein.projektadresse.ort}}
```

The supplied example project has **Allgemein → Nummer** set to `LW-2026-001`. This is an ordinary editable overview field, using the same dynamic naming rules as other project data.

Names become lowercase, spaces and punctuation become underscores, and German characters are transliterated (`ü → ue`, `ß → ss`). Names starting with a digit get an initial underscore. Names must produce unique paths at the same level. Project section names cannot use the built-in keys `name`, `number`, `language`, `plan`, or `files`.

Renaming a section, group, or field changes its path. There are no stored placeholder keys or old-path aliases. Users are responsible for updating and reuploading their Word templates. Select a project in the placeholder reference to copy its current paths; template-editor copy actions also use the current labels.

Dates in overview fields are formatted for the template language. Values come from the same overview fields users edit, without separate legacy date or address placeholders.

**Vorlagensprache / Template language** controls date formatting, translated standard role values and safety-plan texts. It never changes placeholder names or translates text written in the DOCX or project free-text fields. The placeholder reference exposes the same paths in either interface language.

## Repeating content

Loop markers repeat paragraphs or table rows. Use the full collection path for fields inside a loop:

```text
{{#qs.project.notfallkontakte.kontakte}}
{{qs.project.notfallkontakte.kontakte.bezeichnung}}
{{qs.project.notfallkontakte.kontakte.telefon}}
{{/qs.project.notfallkontakte.kontakte}}
```

The project-participant section uses its visible title as the collection name. A German section named **Bauteam** exposes:

```text
{{#qs.project.bauteam}}
{{qs.project.bauteam.name}}
{{qs.project.bauteam.company}}
{{qs.project.bauteam.role}}
{{qs.project.bauteam.email}}
{{qs.project.bauteam.phone}}
{{/qs.project.bauteam}}
```

Standard participant fields always use `name`, `company`, `role`, `email` and `phone`, regardless of the interface or template language. The collection name follows the project's actual participant-section title. Renaming that title changes the collection path. Each assigned person appears once, with their project roles joined in the role field. Standard role values use the template language; custom role names and contact values remain as entered. Contact values come from the canonical project-contact assignments.

Loop paths must match at opening and closing. Nested collections use their complete paths, including each parent group. Up to three nested loops are supported. Declared fields remain discoverable and valid even when a collection has no records.

## Safety-plan content

The standard A4 template uses:

```text
{{#qs.project.plan.category_tree}}
{{qs.project.plan.category_tree.color}}{{qs.project.plan.category_tree.title}}
{{#qs.project.plan.category_tree.blocks}}
{{qs.project.plan.category_tree.blocks.color}}
{{qs.project.plan.category_tree.blocks.title}}
{{qs.project.plan.category_tree.blocks.image}}
{{qs.project.plan.category_tree.blocks.a4_description}}
{{qs.project.plan.category_tree.blocks.regulations}}
{{/qs.project.plan.category_tree.blocks}}
{{/qs.project.plan.category_tree}}
```

The category tree includes selected blocks and their ancestors in depth-first order. Categories provide `title`, `path`, `depth`, and `color`. Blocks also provide `category`, `a0_description`, and `expert_note`. `qs.project.plan.blocks` offers a flat list of the same selected blocks. Colour placeholders inside these loops apply table-cell shading and disappear from the output.

Project-file metadata is available through a loop over `qs.project.files`, with `filename` and an optional `image`.

## Unknown placeholders

Before creation, the application lists paths absent from the selected project's and organisation's data. Choose **Cancel** to edit and reupload the template, or **Continue with empty fields** to download with unknown values empty. Missing parent sections, nested fields, images, and collections are handled safely. A known field whose value is blank is not an unknown placeholder.

## Word layout and validation

Text, loops, and `{{PAGEBREAK}}` work in the body, headers, footers, and table cells. Image placeholders must be alone in their paragraph or cell. Word may split a placeholder across text runs; the engine preserves the layout while resolving it.

Only property paths and supported loop/page-break markers are allowed. Executable code, queries, HTML, raw XML, macros, ActiveX, embedded executable objects, encrypted packages, and external relationships are rejected.

Upload limits are 10 MB compressed, 40 MB expanded, 400 package entries, and a maximum per-entry compression ratio of 40:1.
