import type { BuildingBlock, Plan, PlanBlockElement, PlanElement, PlanLayout, PlanSection, PlanSectionElement } from "./types";

export const PLAN_UNITS_PER_MILLIMETRE = 10;
export const A0_LANDSCAPE_WIDTH = 11_890;
export const A0_LANDSCAPE_HEIGHT = 8_410;
export const PLAN_SAFE_MARGIN = 180;
export const PLAN_GRID_SIZE = 20;
export const CSS_PIXELS_PER_LAYOUT_UNIT = 0.1;

const HEADER_HEIGHT = 660;
const TITLE_BLOCK_HEIGHT = 520;
const SECTION_GAP = 60;
const SECTION_HEADER_HEIGHT = 160;
const SECTION_PADDING = 50;
const BLOCK_GAP = 50;
const BLOCK_WIDTH = 2_300;
const BLOCK_HEIGHT = 480;
const SECTION_COLUMNS = 4;
const NEW_SECTION_HEIGHT = 1_220;

export function layoutUnitsToMillimetres(layoutUnits: number): number {
  return layoutUnits / PLAN_UNITS_PER_MILLIMETRE;
}

export function layoutUnitsToCssPixels(layoutUnits: number, zoom = 1): number {
  return layoutUnits * CSS_PIXELS_PER_LAYOUT_UNIT * zoom;
}

export function cssPixelsToLayoutUnits(cssPixels: number, zoom = 1): number {
  return cssPixels / CSS_PIXELS_PER_LAYOUT_UNIT / zoom;
}

function sectionHeight(itemCount: number): number {
  const rows = Math.max(1, Math.ceil(itemCount / SECTION_COLUMNS));
  return SECTION_HEADER_HEIGHT + SECTION_PADDING + rows * BLOCK_HEIGHT + Math.max(0, rows - 1) * BLOCK_GAP + SECTION_PADDING;
}

export function createLayoutFromSections(sections: PlanSection[]): PlanLayout {
  const elements: PlanElement[] = [];
  let sectionY = PLAN_SAFE_MARGIN + HEADER_HEIGHT;
  sections.filter((section) => section.items.length > 0).forEach((section, sectionIndex) => {
    const height = sectionHeight(section.items.length);
    elements.push({
      id: `layout-section-${section.id}`,
      kind: "section",
      sectionId: section.id,
      x: PLAN_SAFE_MARGIN,
      y: sectionY,
      width: A0_LANDSCAPE_WIDTH - PLAN_SAFE_MARGIN * 2,
      height,
      zIndex: sectionIndex * 10,
      semanticOrder: sectionIndex * 100,
      locked: false,
    });
    section.items.forEach((item, itemIndex) => {
      const column = itemIndex % SECTION_COLUMNS;
      const row = Math.floor(itemIndex / SECTION_COLUMNS);
      elements.push({
        id: `layout-block-${item.id}`,
        kind: "block",
        sectionId: section.id,
        itemId: item.id,
        blockId: item.blockId,
        x: PLAN_SAFE_MARGIN + 110 + column * (BLOCK_WIDTH + BLOCK_GAP),
        y: sectionY + SECTION_HEADER_HEIGHT + SECTION_PADDING + row * (BLOCK_HEIGHT + BLOCK_GAP),
        width: BLOCK_WIDTH,
        height: BLOCK_HEIGHT,
        zIndex: sectionIndex * 10 + 1,
        semanticOrder: sectionIndex * 100 + itemIndex + 1,
      });
    });
    sectionY += height + SECTION_GAP;
  });
  elements.push({
    id: "layout-title-block",
    kind: "title_block",
    x: A0_LANDSCAPE_WIDTH - 3_200,
    y: A0_LANDSCAPE_HEIGHT - PLAN_SAFE_MARGIN - TITLE_BLOCK_HEIGHT,
    width: 3_020,
    height: TITLE_BLOCK_HEIGHT,
    zIndex: 1_000,
    semanticOrder: 10_000,
    locked: true,
  });
  return {
    layoutVersion: 2,
    format: "A0",
    orientation: "landscape",
    width: A0_LANDSCAPE_WIDTH,
    height: A0_LANDSCAPE_HEIGHT,
    safeMargin: PLAN_SAFE_MARGIN,
    gridSize: PLAN_GRID_SIZE,
    elements,
  };
}

export function ensurePlanLayout(plan: Omit<Plan, "layout"> & { layout?: PlanLayout }): Plan {
  return { ...plan, layout: plan.layout?.layoutVersion === 2 ? plan.layout : createLayoutFromSections(plan.sections) };
}

export function snapToGrid(value: number, gridSize = PLAN_GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

export function clampElementToPage(element: PlanElement, layout: PlanLayout): PlanElement {
  const minimum = Math.ceil(layout.safeMargin / layout.gridSize) * layout.gridSize;
  const maximumX = Math.floor((layout.width - layout.safeMargin - element.width) / layout.gridSize) * layout.gridSize;
  const maximumY = Math.floor((layout.height - layout.safeMargin - element.height) / layout.gridSize) * layout.gridSize;
  const x = Math.min(Math.max(snapToGrid(element.x, layout.gridSize), minimum), maximumX);
  const y = Math.min(Math.max(snapToGrid(element.y, layout.gridSize), minimum), maximumY);
  return { ...element, x, y };
}

function overlaps(a: PlanElement, b: PlanElement): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function findNextFreeBlockPosition(layout: PlanLayout, width = BLOCK_WIDTH, height = BLOCK_HEIGHT): Pick<PlanBlockElement, "x" | "y" | "width" | "height"> {
  const startX = layout.safeMargin + 120;
  const startY = layout.safeMargin + HEADER_HEIGHT + SECTION_HEADER_HEIGHT + SECTION_PADDING;
  const maxX = layout.width - layout.safeMargin - width;
  const maxY = layout.height - layout.safeMargin - TITLE_BLOCK_HEIGHT - height;
  for (let y = startY; y <= maxY; y += height + BLOCK_GAP) {
    for (let x = startX; x <= maxX; x += width + BLOCK_GAP) {
      const candidate = { id: "candidate", kind: "block", x, y, width, height, zIndex: 1 } as PlanElement;
      const collision = layout.elements.some((element) => element.kind !== "section" && overlaps(candidate, element));
      if (!collision) return { x, y, width, height };
    }
  }
  return { x: startX, y: startY, width, height };
}

export function createSectionElement(sectionId: string, layout: PlanLayout, preferredY: number): PlanSectionElement {
  const height = NEW_SECTION_HEIGHT;
  const y = Math.min(
    Math.max(snapToGrid(preferredY - SECTION_HEADER_HEIGHT - SECTION_PADDING, layout.gridSize), layout.safeMargin + HEADER_HEIGHT),
    layout.height - layout.safeMargin - height,
  );
  return {
    id: `layout-section-${sectionId}`,
    kind: "section",
    sectionId,
    x: layout.safeMargin,
    y,
    width: layout.width - layout.safeMargin * 2,
    height,
    zIndex: Math.max(0, ...layout.elements.filter((element) => element.kind === "section").map((element) => element.zIndex)) + 1,
    semanticOrder: Math.max(0, ...layout.elements.map((element) => element.semanticOrder ?? 0)) + 1,
    locked: false,
  };
}

export function synchronizeBlockElements(plan: Plan, blocks: BuildingBlock[]): Plan {
  const knownBlockIds = new Set(blocks.map((block) => block.id));
  const planItems = plan.sections.flatMap((section) => section.items.map((item) => ({ section, item }))).filter(({ item }) => knownBlockIds.has(item.blockId));
  const itemIds = new Set(planItems.map(({ item }) => item.id));
  const retained = plan.layout.elements.filter((element) => element.kind !== "block" || itemIds.has(element.itemId));
  const existingItemIds = new Set(retained.filter((element): element is PlanBlockElement => element.kind === "block").map((element) => element.itemId));
  const layout = { ...plan.layout, elements: retained };
  planItems.forEach(({ section, item }) => {
    if (existingItemIds.has(item.id)) return;
    const position = findNextFreeBlockPosition(layout);
    layout.elements.push({
      id: `layout-block-${item.id}`,
      kind: "block",
      sectionId: section.id,
      itemId: item.id,
      blockId: item.blockId,
      ...position,
      zIndex: 500 + layout.elements.length,
    });
  });
  return { ...plan, layout };
}
