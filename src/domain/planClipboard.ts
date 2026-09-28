import { getUsableCanvasBounds } from "./planLayout";
import type { Plan, PlanElement, PlanItem } from "./types";

const PASTE_OFFSET_GRID_STEPS = 4;
const NON_DUPLICABLE_ELEMENT_KINDS = new Set<PlanElement["kind"]>(["block_area", "header", "title_block"]);

interface CanvasClipboardEntry {
  element: PlanElement;
  blockItem?: PlanItem;
}

export interface CanvasClipboardSnapshot {
  entries: CanvasClipboardEntry[];
  pasteCount: number;
}

export interface PasteCanvasClipboardResult {
  clipboard: CanvasClipboardSnapshot;
  pastedElementIds: string[];
  plan: Plan;
}

export function isCanvasElementDuplicable(element: PlanElement): boolean {
  return !NON_DUPLICABLE_ELEMENT_KINDS.has(element.kind);
}

export function createCanvasClipboard(plan: Plan, selectedElementIds: string[]): CanvasClipboardSnapshot | null {
  const selectedIds = new Set(selectedElementIds);
  const entries = plan.layout.elements.flatMap((element): CanvasClipboardEntry[] => {
    if (!selectedIds.has(element.id) || !isCanvasElementDuplicable(element)) return [];
    if (element.kind !== "block") return [{ element: structuredClone(element) }];

    const blockItem = plan.sections
      .find((section) => section.id === element.sectionId)
      ?.items.find((item) => item.id === element.itemId);
    return blockItem ? [{ element: structuredClone(element), blockItem: structuredClone(blockItem) }] : [];
  });

  return entries.length ? { entries, pasteCount: 0 } : null;
}

function calculatePasteOffset(plan: Plan, clipboard: CanvasClipboardSnapshot): { x: number; y: number } {
  const requestedOffset = plan.layout.gridSize * PASTE_OFFSET_GRID_STEPS * (clipboard.pasteCount + 1);
  const minimumLeft = Math.min(...clipboard.entries.map(({ element }) => element.x));
  const minimumTop = Math.min(...clipboard.entries.map(({ element }) => element.y));
  const maximumRight = Math.max(...clipboard.entries.map(({ element }) => element.x + element.width));
  const maximumBottom = Math.max(...clipboard.entries.map(({ element }) => element.y + element.height));
  const usableBounds = getUsableCanvasBounds(plan.layout);
  const clampTranslation = (requested: number, minimum: number, maximum: number) => (
    minimum <= maximum ? Math.min(Math.max(requested, minimum), maximum) : minimum
  );

  return {
    x: clampTranslation(requestedOffset, usableBounds.x - minimumLeft, usableBounds.right - maximumRight),
    y: clampTranslation(requestedOffset, usableBounds.y - minimumTop, usableBounds.bottom - maximumBottom),
  };
}

export function pasteCanvasClipboard(
  plan: Plan,
  clipboard: CanvasClipboardSnapshot,
  createId: (prefix: string) => string,
): PasteCanvasClipboardResult | null {
  if (!clipboard.entries.length) return null;

  const offset = calculatePasteOffset(plan, clipboard);
  const addedItemsBySectionId = new Map<string, PlanItem[]>();
  const pastedElements: PlanElement[] = [];

  clipboard.entries.forEach(({ element, blockItem }) => {
    if (element.kind === "block") {
      if (!blockItem || !plan.sections.some((section) => section.id === element.sectionId)) return;
      const pastedItem = { ...structuredClone(blockItem), id: createId("item") };
      addedItemsBySectionId.set(element.sectionId, [
        ...(addedItemsBySectionId.get(element.sectionId) ?? []),
        pastedItem,
      ]);
      pastedElements.push({
        ...structuredClone(element),
        id: createId("layout-block"),
        itemId: pastedItem.id,
        x: element.x + offset.x,
        y: element.y + offset.y,
        zIndex: element.zIndex + 1,
      });
      return;
    }

    pastedElements.push({
      ...structuredClone(element),
      id: createId(`layout-${element.kind}`),
      x: element.x + offset.x,
      y: element.y + offset.y,
      zIndex: element.zIndex + 1,
    });
  });

  if (!pastedElements.length) return null;

  return {
    plan: {
      ...plan,
      sections: plan.sections.map((section) => {
        const addedItems = addedItemsBySectionId.get(section.id);
        return addedItems ? { ...section, items: [...section.items, ...addedItems] } : section;
      }),
      layout: { ...plan.layout, elements: [...plan.layout.elements, ...pastedElements] },
    },
    pastedElementIds: pastedElements.map((element) => element.id),
    clipboard: { ...clipboard, pasteCount: clipboard.pasteCount + 1 },
  };
}
