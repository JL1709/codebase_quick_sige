# Safety-plan canvas interaction conventions

QuickSiGe follows established design-canvas conventions while protecting browser and text-editing behavior.

- `Fit plan` centers the A0 page at the largest zoom that keeps all four edges visible with a 48 px viewport gutter. The view recalculates after viewport or library-width changes while fit mode is active.
- Zoom is transient view state between 10% and 800%; it never changes saved A0 geometry or exports.
- Toolbar `+`/`−`, `Cmd/Ctrl + +`, and `Cmd/Ctrl + -` zoom by a consistent multiplicative step. `Shift + 1` fits the plan, following Figma’s documented canvas shortcut.
- `Cmd + wheel` on macOS and `Ctrl + wheel` on Windows/Linux keep the document point under the pointer fixed on screen. Wheel and trackpad pinch deltas produce proportional zoom; toolbar and keyboard steps use the viewport center. Scale and translation are one transient viewport state, independent of browser scroll limits and saved plan geometry.
- An ordinary wheel gesture pans the workspace, including when the page is smaller than the viewport. `Shift + wheel` pans horizontally. Validation navigation centers the affected element through the same viewport controller.
- PDF previews are identified by source, page number and resolution. A page shows its matching cached preview or a numbered placeholder; the document cover is used only for page one. Concurrent requests share a document renderer, and a bounded raster cache survives sidebar and editor remounts.
- Canvas shortcuts do not run while an input, textarea, select, or content-editable field owns focus.
- Inline canvas text saves when clicking outside or moving focus with `Tab`. `Enter` saves single-line headings; multiline fields keep `Enter` for line breaks and save with `Cmd/Ctrl + Enter`. `Escape` cancels only the current edit. A changed field is one undo step, and unchanged text creates no history entry.
- Category headings, block titles, descriptions and images edited in a plan are plan-local overrides. They never update catalog records or other projects. Draft plans still read unmodified content, references and category presentation from the current catalog; published revisions retain immutable catalog snapshots.

References: Figma’s official “Adjust your zoom and view options” and “Use Figma products with a keyboard” documentation, and Miro’s official “Shortcuts and hotkeys” documentation, reviewed 27 September 2026.
