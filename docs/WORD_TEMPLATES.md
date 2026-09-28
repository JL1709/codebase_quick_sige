# QuickSiGe Word template contract

QuickSiGe accepts normal `.docx` files. Templates are edited in Microsoft Word or another OOXML-compatible editor. The uploaded package remains the visual source of truth: page setup, fonts, headers, footers, tables, spacing, colors, and branding are preserved by the renderer.

## Placeholder syntax

- Text: `{{qs.project.name}}`
- Image: `{{qs.block.image}}`
- Loop start: `{{#qs.plan.category_tree}}`
- Loop end: `{{/qs.plan.category_tree}}`
- Controlled page break: `{{PAGEBREAK}}`

The opening and closing paths of a loop must match. Inside a loop, use the singular context shown by the standard template, such as `qs.category` or `qs.block`. Image placeholders must be the only visible content in their paragraph or table cell.

Only namespaced property paths and the commands documented here are accepted. JavaScript expressions, `EXEC`, `QUERY`, raw XML, HTML, macros, ActiveX, embedded executables, encrypted packages, and external package relationships are rejected.

Text, loops, and page breaks work in the document body, headers, footers, paragraphs, and table cells. Loops may be nested to three levels. The A4 template uses a category-tree loop containing a block loop.

## Project data

- `{{qs.project.number}}`
- `{{qs.project.name}}`
- `{{qs.project.description}}`
- `{{qs.project.address}}`
- `{{qs.project.city}}`
- `{{qs.project.construction_type}}`
- `{{qs.project.construction_type_label}}`
- `{{qs.project.start_date}}`
- `{{qs.project.end_date}}`
- `{{qs.project.language}}`

Every custom project field is also available as `{{qs.overview.<stable_field_key>}}`. Custom-section fields use `{{qs.overview.<stable_section_key>.<stable_field_key>}}`. Display labels may change without changing these stable keys.

## Contact and participant loops

Use `{{#qs.emergency_contacts}}` with `{{qs.contact.label}}`, `{{qs.contact.name}}`, and `{{qs.contact.phone}}`, followed by `{{/qs.emergency_contacts}}`.

Use `{{#qs.participants}}` with `{{qs.participant.role}}`, `{{qs.participant.role_label}}`, `{{qs.participant.company}}`, `{{qs.participant.name}}`, `{{qs.participant.email}}`, and `{{qs.participant.phone}}`, followed by `{{/qs.participants}}`.

## Hierarchical A4 plan

The standard A4 template preserves the catalog hierarchy:

```text
{{#qs.plan.category_tree}}
{{qs.category.color}}{{qs.category.title}}
{{#qs.category.blocks}}
{{qs.block.color}}{{qs.block.title}}
{{qs.block.image}}
{{qs.block.a4_description}}
{{qs.block.regulations}}
{{/qs.category.blocks}}
{{/qs.plan.category_tree}}
```

`qs.category.color` and `qs.block.color` are optional cell-formatting placeholders. When placed in a Word table cell, they apply the catalog color to that cell and disappear from the generated document.

`qs.plan.category_tree` is a depth-first view of the selected catalog hierarchy. QuickSiGe includes every ancestor of a selected block and flattens the recursive tree before Word rendering, so categories can be nested to any depth without requiring recursive template commands. Each category provides `title`, `path`, `depth`, `color`, and the blocks assigned directly to that category. A block provides:

- `{{qs.block.category}}`
- `{{qs.block.title}}`
- `{{qs.block.a0_description}}`
- `{{qs.block.a4_description}}`
- `{{qs.block.short_description}}`
- `{{qs.block.long_description}}`
- `{{qs.block.regulations}}`
- `{{qs.block.image}}`
- `{{qs.block.expert_note}}`

The category tree is the source of truth for A4 output. There is no separate Word-template section layer.

## Missing and empty data

A key with an empty value is defined and renders as empty text. A key that does not exist is undefined. Before generation, QuickSiGe lists undefined keys and lets the user return to the Overview or explicitly generate that copy with those values empty.

## Upload limits

Templates are limited to 10 MB compressed, 40 MB expanded, 400 package entries, and a maximum per-entry compression ratio of 40:1. MIME type, extension, ZIP structure, Word parts, relationships, commands, loop scopes, and image placement are validated before a replacement becomes active.
