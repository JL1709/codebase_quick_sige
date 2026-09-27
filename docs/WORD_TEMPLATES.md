# QuickSiGe Word template contract

QuickSiGe accepts normal `.docx` files. Templates are edited in Microsoft Word or another OOXML-compatible editor. The uploaded package remains the visual source of truth: page setup, fonts, headers, footers, tables, spacing, colors, and branding are preserved by the renderer.

## Command syntax

- Text: `{{INS qs.project.name}}`
- Image: `{{IMAGE $block.image}}`
- Loop start: `{{FOR block IN qs.plan.blocks}}`
- Loop end: `{{END-FOR block}}`
- Controlled page break: `{{PAGEBREAK}}`

Only namespaced property paths and the commands above are accepted. JavaScript expressions, `EXEC`, `QUERY`, raw XML, HTML, macros, ActiveX, embedded executables, encrypted packages, and external package relationships are rejected.

Text, loops, and page breaks work in the document body, headers, footers, paragraphs, and table cells. An image command must be the only visible content in its paragraph or table cell. Loops may be nested to two levels, which supports a section loop containing a block-row loop.

## Project data

- `qs.project.number`
- `qs.project.name`
- `qs.project.description`
- `qs.project.address`
- `qs.project.city`
- `qs.project.construction_type`
- `qs.project.construction_type_label`
- `qs.project.start_date`
- `qs.project.end_date`
- `qs.project.language`

Every custom project field is also available as `qs.overview.<stable_field_key>`. Custom-section fields use `qs.overview.<stable_section_key>.<stable_field_key>`. Display labels may change without changing these stable keys.

## Contact and participant loops

Use `{{FOR contact IN qs.emergency_contacts}}` with `$contact.label`, `$contact.name`, and `$contact.phone`.

Use `{{FOR participant IN qs.participants}}` with `$participant.role`, `$participant.role_label`, `$participant.company`, `$participant.name`, `$participant.email`, and `$participant.phone`.

## Plan loops

Use `{{FOR section IN qs.plan.sections}}` for semantic sections. A section provides `$section.title`, `$section.category_id`, and `$section.blocks`. The section's block collection can be repeated as a Word table row to create a compact grid.

Use `{{FOR block IN qs.plan.blocks}}` for the flattened semantic block order. A block provides:

- `$block.code`
- `$block.category`
- `$block.title`
- `$block.a0_description`
- `$block.a4_description`
- `$block.short_description`
- `$block.long_description`
- `$block.regulations`
- `$block.image`
- `$block.expert_note`

Plan-specific title, description, and image overrides take precedence over catalog defaults. Expert notes are emitted only when the chosen template explicitly includes `$block.expert_note`.

## Missing and empty data

A key with an empty value is defined and renders as empty text. A key that does not exist is undefined. Before generation, QuickSiGe lists undefined keys and lets the user return to the Overview or explicitly generate that copy with those values empty.

## Upload limits

Templates are limited to 10 MB compressed, 40 MB expanded, 400 package entries, and a maximum per-entry compression ratio of 40:1. MIME type, extension, ZIP structure, Word parts, relationships, commands, loop scopes, and image placement are validated before a replacement becomes active.
