# Production dependency decisions

The dependency lockfile is authoritative for exact versions. The release gate runs `npm audit --audit-level=high`.

| Package | Purpose | License |
| --- | --- | --- |
| React / React DOM | Application UI | MIT |
| React Router | Project workspace routing | MIT |
| react-moveable | Canvas transforms, resize, snapping, and group transforms | MIT |
| react-selecto | Click and marquee multi-selection | MIT |
| dnd-kit core/utilities | Pointer and keyboard library-to-canvas drag operations | MIT |
| jsPDF | Deterministic vector A0 PDF rendering | MIT |
| pdfjs-dist | Local PDF inspection and page preview | Apache-2.0 |
| docx-templates | Restricted OOXML template rendering behind the QuickSiGe adapter | MIT |
| docx | Standard editable DOCX template creation | MIT |
| idb | IndexedDB blob repository | ISC |
| Zod | Persisted-data and form validation | MIT |
| Lucide React | Product icons | ISC |

The application does not include tldraw. Its licensing and broad infinite-canvas model do not fit this document-focused editor. Uploaded templates never receive direct access to the general `docx-templates` expression language; QuickSiGe validates and whitelists every command first.
