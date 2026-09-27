# Safety-plan canvas interaction conventions

QuickSiGe follows established design-canvas conventions while protecting browser and text-editing behavior.

- `Fit plan` computes the largest zoom that keeps all four A0 edges visible with a 48 px viewport gutter. The view recalculates after viewport or library-width changes.
- Zoom is transient view state between 10% and 800%; it never changes saved A0 geometry or exports.
- Toolbar `+`/`−`, `Cmd/Ctrl + +`, and `Cmd/Ctrl + -` zoom by a consistent multiplicative step. `Shift + 1` fits the plan, following Figma’s documented canvas shortcut.
- `Cmd + wheel` on macOS and `Ctrl + wheel` on Windows/Linux zoom toward the pointer. Browser trackpad pinch events are handled through the same non-passive wheel path. An ordinary wheel gesture continues to pan/scroll the viewport.
- Canvas shortcuts do not run while an input, textarea, select, or content-editable field owns focus.

References: Figma’s official “Adjust your zoom and view options” and “Use Figma products with a keyboard” documentation, and Miro’s official “Shortcuts and hotkeys” documentation, reviewed 27 September 2026.
