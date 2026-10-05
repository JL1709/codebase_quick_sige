# QuickSiGe Word templates

Create documents from **Templates → Create document → Select project**. A generated document is downloaded as DOCX; it is not saved to the project's Documents tab. Project-only reports work without a safety plan. The existing A4 action in the safety-plan toolbar remains available.

Upload any normal DOCX layout with supported placeholders. Edit the layout and placeholders in Word, then upload the file. Project edits never rewrite uploaded templates. All templates use the same data model; no document-specific field mapping is required.

## Placeholder names

Organisation fields use `qs.organization.*`, such as `{{qs.organization.name}}`, `{{qs.organization.email}}`, and `{{qs.organization.address.city}}`. The reference in Templates lists all organisation fields, including the logo image.

Built-in project properties are `{{qs.project.name}}`, `{{qs.project.number}}`, and `{{qs.project.language}}`. Overview fields follow their visible hierarchy:

```text
{{qs.project.allgemein.geplanter_beginn}}
{{qs.project.allgemein.projektadresse.ort}}
```

Names become lowercase, spaces and punctuation become underscores, and German characters are transliterated (`ü → ue`, `ß → ss`). Names starting with a digit get an initial underscore. Names must produce unique paths at the same level. Project section names cannot use the built-in keys `name`, `number`, `language`, `plan`, or `files`.

Renaming a section, group, or field changes its path. There are no stored placeholder keys or old-path aliases. Users are responsible for updating and reuploading their Word templates. Select a project in the placeholder reference to copy its current paths; template-editor copy actions also use the current labels.

Dates in overview fields are formatted for the template language. Values come from the same overview fields users edit, without separate legacy date or address placeholders.

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
{{qs.project.bauteam.unternehmen}}
{{qs.project.bauteam.rolle}}
{{qs.project.bauteam.e_mail}}
{{qs.project.bauteam.telefon}}
{{/qs.project.bauteam}}
```

Participant fields follow the template language's labels. Each assigned person appears once, with their project roles joined in the role field. Contact values come from the canonical project-contact assignments.

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
