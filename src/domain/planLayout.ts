import { categoryTrail } from "./categoryTree";
import type {
  BlockLayoutMode,
  BuildingBlock,
  BuildingBlockCategory,
  Plan,
  PlanBlockAreaElement,
  PlanBlockElement,
  PlanElement,
  PlanItem,
  PlanLayout,
  PlanSection,
  PlanSectionElement,
} from "./types";

export const PLAN_UNITS_PER_MILLIMETRE = 10;
export const A0_LANDSCAPE_WIDTH = 11_890;
export const A0_LANDSCAPE_HEIGHT = 8_410;
export const PLAN_SAFE_MARGIN = 180;
export const PLAN_GRID_SIZE = 20;
export const CSS_PIXELS_PER_LAYOUT_UNIT = 0.1;

const TITLE_BLOCK_HEIGHT = 520;
const SECTION_HEADER_HEIGHT = 180;
const SECTION_PADDING = 60;
const SECTION_GAP = 80;
const BLOCK_GAP = 50;
const MAXIMUM_BLOCK_WIDTH = 1_800;
const MINIMUM_BLOCK_WIDTH = 760;
const BLOCK_ASPECT_RATIO = 1.6;
const BLOCK_SIZE_STEP = 40;
const NEW_SECTION_HEIGHT = 1_220;
const DEFAULT_BLOCK_AREA_WIDTH_RATIO = 0.7;

export const MINIMUM_PLAN_ELEMENT_WIDTH = 600;
export const MINIMUM_PLAN_ELEMENT_HEIGHT = 240;
export const MINIMUM_BLOCK_AREA_WIDTH = 2_400;
export const MINIMUM_BLOCK_AREA_HEIGHT = 1_600;

export const PLAN_BLOCK_AREA_ELEMENT_ID = "layout-block-area";
export const PLAN_HEADER_ELEMENT_ID = "layout-header";
export const PLAN_TITLE_BLOCK_ELEMENT_ID = "layout-title-block";

interface OrderedSection {
  section: PlanSection;
  items: PlanSection["items"];
}

interface SectionPlacement {
  sectionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  blocks: Array<{ itemId: string; x: number; y: number }>;
}

interface LayoutCandidate {
  blockWidth: number;
  blockHeight: number;
  placements: SectionPlacement[];
  footprint: number;
}

export interface FitBlocksResult {
  layout: PlanLayout;
  fits: boolean;
  blockWidth?: number;
  blockHeight?: number;
}

export interface ElementResizeMeasurement {
  width: number;
  height: number;
  translateX: number;
  translateY: number;
  directionX: number;
  directionY: number;
}

function defaultBlockAreaGeometry(): Pick<PlanBlockAreaElement, "x" | "y" | "width" | "height"> {
  const printableWidth = A0_LANDSCAPE_WIDTH - PLAN_SAFE_MARGIN * 2;
  return {
    x: PLAN_SAFE_MARGIN,
    y: PLAN_SAFE_MARGIN,
    width: snapToGrid(printableWidth * DEFAULT_BLOCK_AREA_WIDTH_RATIO),
    height: A0_LANDSCAPE_HEIGHT - PLAN_SAFE_MARGIN * 2,
  };
}

export function createBlockAreaElement(layoutMode: BlockLayoutMode = "best_fit"): PlanBlockAreaElement {
  return {
    id: PLAN_BLOCK_AREA_ELEMENT_ID,
    kind: "block_area",
    ...defaultBlockAreaGeometry(),
    layoutMode,
    zIndex: 0,
    semanticOrder: 0,
    locked: false,
  };
}

export function getBlockArea(layout: PlanLayout): PlanBlockAreaElement | undefined {
  return layout.elements.find((element): element is PlanBlockAreaElement => element.kind === "block_area");
}

export function layoutUnitsToMillimetres(layoutUnits: number): number {
  return layoutUnits / PLAN_UNITS_PER_MILLIMETRE;
}

export function layoutUnitsToCssPixels(layoutUnits: number, zoom = 1): number {
  return layoutUnits * CSS_PIXELS_PER_LAYOUT_UNIT * zoom;
}

export function cssPixelsToLayoutUnits(cssPixels: number, zoom = 1): number {
  return cssPixels / CSS_PIXELS_PER_LAYOUT_UNIT / zoom;
}

export function minimumElementSize(element: PlanElement): { width: number; height: number } {
  if (element.kind === "block_area") return { width: MINIMUM_BLOCK_AREA_WIDTH, height: MINIMUM_BLOCK_AREA_HEIGHT };
  if (element.kind === "shape" && (element.shape === "line" || element.shape === "arrow")) {
    return { width: 120, height: 120 };
  }
  return { width: MINIMUM_PLAN_ELEMENT_WIDTH, height: MINIMUM_PLAN_ELEMENT_HEIGHT };
}

export function resizeElementFromCssMeasurement(
  element: PlanElement,
  layout: PlanLayout,
  measurement: ElementResizeMeasurement,
): PlanElement {
  const minimum = minimumElementSize(element);
  // Moveable reports untransformed CSS dimensions. Preserve the inactive axis explicitly;
  // DOM bounds can contain transformed or stale values when an edge handle is released.
  const width = measurement.directionX === 0
    ? element.width
    : Math.max(minimum.width, snapToGrid(cssPixelsToLayoutUnits(measurement.width), layout.gridSize));
  const height = measurement.directionY === 0
    ? element.height
    : Math.max(minimum.height, snapToGrid(cssPixelsToLayoutUnits(measurement.height), layout.gridSize));
  const x = measurement.directionX < 0
    ? element.x + cssPixelsToLayoutUnits(measurement.translateX)
    : element.x;
  const y = measurement.directionY < 0
    ? element.y + cssPixelsToLayoutUnits(measurement.translateY)
    : element.y;
  const positioned = clampElementToPage({ ...element, x, y, width, height }, layout);
  return {
    ...positioned,
    width: Math.min(positioned.width, layout.width - layout.safeMargin - positioned.x),
    height: Math.min(positioned.height, layout.height - layout.safeMargin - positioned.y),
  };
}

function compareCategoryOrder(leftId: string, rightId: string, categories: BuildingBlockCategory[]): number {
  const leftTrail = categoryTrail(leftId, categories);
  const rightTrail = categoryTrail(rightId, categories);
  const maximumDepth = Math.max(leftTrail.length, rightTrail.length);
  for (let index = 0; index < maximumDepth; index += 1) {
    if (!leftTrail[index]) return -1;
    if (!rightTrail[index]) return 1;
    const orderDifference = leftTrail[index].sortOrder - rightTrail[index].sortOrder;
    if (orderDifference) return orderDifference;
  }
  return leftId.localeCompare(rightId);
}

export function reconcilePlanSectionsWithCatalog(
  sections: PlanSection[],
  categories: BuildingBlockCategory[],
  blocks: BuildingBlock[],
): PlanSection[] {
  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const knownCategoryIds = new Set(categories.map((category) => category.id));
  const existingSectionByCategory = new Map<string, PlanSection>();
  sections.forEach((section) => {
    if (!existingSectionByCategory.has(section.categoryId)) existingSectionByCategory.set(section.categoryId, section);
  });

  const itemsByCategory = new Map<string, PlanItem[]>();
  sections.forEach((section) => {
    section.items.forEach((item) => {
      const catalogCategoryId = blockById.get(item.blockId)?.primaryCategoryId;
      const categoryId = catalogCategoryId && knownCategoryIds.has(catalogCategoryId)
        ? catalogCategoryId
        : section.categoryId;
      const items = itemsByCategory.get(categoryId) ?? [];
      items.push(item);
      itemsByCategory.set(categoryId, items);
    });
  });

  const existingSectionIds = new Set(sections.map((section) => section.id));
  const usedSectionIds = new Set<string>();
  const sectionIdForCategory = (categoryId: string): string => {
    const existingId = existingSectionByCategory.get(categoryId)?.id;
    if (existingId && !usedSectionIds.has(existingId)) {
      usedSectionIds.add(existingId);
      return existingId;
    }
    const baseId = `section-${categoryId}`;
    let candidateId = baseId;
    let suffix = 2;
    while (existingSectionIds.has(candidateId) || usedSectionIds.has(candidateId)) {
      candidateId = `${baseId}-${suffix}`;
      suffix += 1;
    }
    usedSectionIds.add(candidateId);
    return candidateId;
  };

  return [...itemsByCategory.entries()]
    .sort(([leftCategoryId], [rightCategoryId]) => compareCategoryOrder(leftCategoryId, rightCategoryId, categories))
    .map(([categoryId, items]) => {
      const existingSection = existingSectionByCategory.get(categoryId);
      return {
        ...(existingSection ?? { id: sectionIdForCategory(categoryId), categoryId }),
        categoryId,
        items,
      };
    });
}

function orderedSections(
  sections: PlanSection[],
  categories: BuildingBlockCategory[],
  blocks: BuildingBlock[],
): OrderedSection[] {
  const blockOrder = new Map(blocks.map((block, index) => [block.id, index]));
  return sections
    .filter((section) => section.items.length > 0)
    .map((section) => ({
      section,
      items: section.items
        .map((item, index) => ({ item, index }))
        .sort((left, right) => (blockOrder.get(left.item.blockId) ?? Number.MAX_SAFE_INTEGER) - (blockOrder.get(right.item.blockId) ?? Number.MAX_SAFE_INTEGER) || left.index - right.index)
        .map(({ item }) => item),
    }))
    .sort((left, right) => compareCategoryOrder(left.section.categoryId, right.section.categoryId, categories));
}

function blockHeightForWidth(blockWidth: number): number {
  return snapToGrid(blockWidth / BLOCK_ASPECT_RATIO);
}

function verticalCandidate(groups: OrderedSection[], area: PlanBlockAreaElement, blockWidth: number, blockHeight: number): LayoutCandidate | null {
  const availableBlockHeight = area.height - SECTION_HEADER_HEIGHT - SECTION_PADDING * 2;
  const rowsPerColumn = Math.floor((availableBlockHeight + BLOCK_GAP) / (blockHeight + BLOCK_GAP));
  if (rowsPerColumn < 1) return null;
  const groupWidths = groups.map(({ items }) => {
    const columns = Math.ceil(items.length / rowsPerColumn);
    return SECTION_PADDING * 2 + columns * blockWidth + Math.max(0, columns - 1) * BLOCK_GAP;
  });
  const totalWidth = groupWidths.reduce((sum, width) => sum + width, 0) + Math.max(0, groups.length - 1) * SECTION_GAP;
  if (totalWidth > area.width) return null;

  let groupX = area.x;
  const placements = groups.map(({ section, items }, groupIndex) => {
    const rowsUsed = Math.min(rowsPerColumn, items.length);
    const groupHeight = SECTION_HEADER_HEIGHT + SECTION_PADDING * 2 + rowsUsed * blockHeight + Math.max(0, rowsUsed - 1) * BLOCK_GAP;
    const placement: SectionPlacement = {
      sectionId: section.id,
      x: groupX,
      y: area.y,
      width: groupWidths[groupIndex],
      height: groupHeight,
      blocks: items.map((item, itemIndex) => ({
        itemId: item.id,
        x: groupX + SECTION_PADDING + Math.floor(itemIndex / rowsPerColumn) * (blockWidth + BLOCK_GAP),
        y: area.y + SECTION_HEADER_HEIGHT + SECTION_PADDING + (itemIndex % rowsPerColumn) * (blockHeight + BLOCK_GAP),
      })),
    };
    groupX += groupWidths[groupIndex] + SECTION_GAP;
    return placement;
  });
  return { blockWidth, blockHeight, placements, footprint: totalWidth * area.height };
}

function horizontalCandidate(groups: OrderedSection[], area: PlanBlockAreaElement, blockWidth: number, blockHeight: number): LayoutCandidate | null {
  const availableBlockWidth = area.width - SECTION_PADDING * 2;
  const columnsPerRow = Math.floor((availableBlockWidth + BLOCK_GAP) / (blockWidth + BLOCK_GAP));
  if (columnsPerRow < 1) return null;
  const groupHeights = groups.map(({ items }) => {
    const rows = Math.ceil(items.length / columnsPerRow);
    return SECTION_HEADER_HEIGHT + SECTION_PADDING * 2 + rows * blockHeight + Math.max(0, rows - 1) * BLOCK_GAP;
  });
  const totalHeight = groupHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, groups.length - 1) * SECTION_GAP;
  if (totalHeight > area.height) return null;

  let groupY = area.y;
  const placements = groups.map(({ section, items }, groupIndex) => {
    const columnsUsed = Math.min(columnsPerRow, items.length);
    const groupWidth = SECTION_PADDING * 2 + columnsUsed * blockWidth + Math.max(0, columnsUsed - 1) * BLOCK_GAP;
    const placement: SectionPlacement = {
      sectionId: section.id,
      x: area.x,
      y: groupY,
      width: groupWidth,
      height: groupHeights[groupIndex],
      blocks: items.map((item, itemIndex) => ({
        itemId: item.id,
        x: area.x + SECTION_PADDING + (itemIndex % columnsPerRow) * (blockWidth + BLOCK_GAP),
        y: groupY + SECTION_HEADER_HEIGHT + SECTION_PADDING + Math.floor(itemIndex / columnsPerRow) * (blockHeight + BLOCK_GAP),
      })),
    };
    groupY += groupHeights[groupIndex] + SECTION_GAP;
    return placement;
  });
  return { blockWidth, blockHeight, placements, footprint: area.width * totalHeight };
}

function bestFitCandidate(groups: OrderedSection[], area: PlanBlockAreaElement, blockWidth: number, blockHeight: number): LayoutCandidate | null {
  const maximumItemCount = Math.max(1, ...groups.map(({ items }) => items.length));
  let bestCandidate: LayoutCandidate | null = null;

  for (let configuredColumns = 1; configuredColumns <= maximumItemCount; configuredColumns += 1) {
    let cursorX = area.x;
    let cursorY = area.y;
    let rowHeight = 0;
    let usedWidth = 0;
    const placements: SectionPlacement[] = [];
    let fits = true;

    for (const { section, items } of groups) {
      const columns = Math.min(configuredColumns, items.length);
      const rows = Math.ceil(items.length / columns);
      const groupWidth = SECTION_PADDING * 2 + columns * blockWidth + Math.max(0, columns - 1) * BLOCK_GAP;
      const groupHeight = SECTION_HEADER_HEIGHT + SECTION_PADDING * 2 + rows * blockHeight + Math.max(0, rows - 1) * BLOCK_GAP;
      if (groupWidth > area.width || groupHeight > area.height) { fits = false; break; }
      if (cursorX > area.x && cursorX + groupWidth > area.x + area.width) {
        cursorX = area.x;
        cursorY += rowHeight + SECTION_GAP;
        rowHeight = 0;
      }
      if (cursorY + groupHeight > area.y + area.height) { fits = false; break; }
      placements.push({
        sectionId: section.id,
        x: cursorX,
        y: cursorY,
        width: groupWidth,
        height: groupHeight,
        blocks: items.map((item, itemIndex) => ({
          itemId: item.id,
          x: cursorX + SECTION_PADDING + (itemIndex % columns) * (blockWidth + BLOCK_GAP),
          y: cursorY + SECTION_HEADER_HEIGHT + SECTION_PADDING + Math.floor(itemIndex / columns) * (blockHeight + BLOCK_GAP),
        })),
      });
      usedWidth = Math.max(usedWidth, cursorX - area.x + groupWidth);
      cursorX += groupWidth + SECTION_GAP;
      rowHeight = Math.max(rowHeight, groupHeight);
    }
    if (!fits) continue;
    const usedHeight = cursorY - area.y + rowHeight;
    const candidate = { blockWidth, blockHeight, placements, footprint: usedWidth * usedHeight };
    if (!bestCandidate || candidate.footprint < bestCandidate.footprint) bestCandidate = candidate;
  }
  return bestCandidate;
}

function createCandidate(
  mode: BlockLayoutMode,
  groups: OrderedSection[],
  area: PlanBlockAreaElement,
  blockWidth: number,
): LayoutCandidate | null {
  const blockHeight = blockHeightForWidth(blockWidth);
  if (mode === "vertical") return verticalCandidate(groups, area, blockWidth, blockHeight);
  if (mode === "horizontal") return horizontalCandidate(groups, area, blockWidth, blockHeight);
  return bestFitCandidate(groups, area, blockWidth, blockHeight);
}

function buildManagedElements(layout: PlanLayout, groups: OrderedSection[], candidate: LayoutCandidate): PlanElement[] {
  const existingSectionElements = new Map(layout.elements.filter((element): element is PlanSectionElement => element.kind === "section").map((element) => [element.sectionId, element]));
  const existingBlockElements = new Map(layout.elements.filter((element): element is PlanBlockElement => element.kind === "block").map((element) => [element.itemId, element]));
  const groupBySectionId = new Map(groups.map((group) => [group.section.id, group]));
  const managedElements: PlanElement[] = [];

  candidate.placements.forEach((placement, sectionIndex) => {
    const group = groupBySectionId.get(placement.sectionId);
    if (!group) return;
    const existingSection = existingSectionElements.get(placement.sectionId);
    managedElements.push({
      ...(existingSection ?? { id: `layout-section-${placement.sectionId}`, kind: "section" as const, sectionId: placement.sectionId, locked: false }),
      x: placement.x,
      y: placement.y,
      width: placement.width,
      height: placement.height,
      zIndex: 100 + sectionIndex,
      semanticOrder: sectionIndex * 1_000,
    });
    placement.blocks.forEach((blockPlacement, blockIndex) => {
      const item = group.items.find((candidateItem) => candidateItem.id === blockPlacement.itemId);
      if (!item) return;
      const existingBlock = existingBlockElements.get(item.id);
      managedElements.push({
        ...(existingBlock ?? { id: `layout-block-${item.id}`, kind: "block" as const, sectionId: placement.sectionId, itemId: item.id, blockId: item.blockId }),
        sectionId: placement.sectionId,
        blockId: item.blockId,
        x: blockPlacement.x,
        y: blockPlacement.y,
        width: candidate.blockWidth,
        height: candidate.blockHeight,
        zIndex: 500 + sectionIndex * 100 + blockIndex,
        semanticOrder: sectionIndex * 1_000 + blockIndex + 1,
      });
    });
  });
  return managedElements;
}

export function fitBlocksInArea(
  layout: PlanLayout,
  sections: PlanSection[],
  categories: BuildingBlockCategory[],
  blocks: BuildingBlock[],
  requestedMode?: BlockLayoutMode,
): FitBlocksResult {
  const area = getBlockArea(layout);
  if (!area) return { layout, fits: false };
  const mode = requestedMode ?? area.layoutMode;
  const groups = orderedSections(sections, categories, blocks);
  const updatedArea = { ...area, layoutMode: mode };
  if (!groups.length) {
    return {
      layout: { ...layout, elements: layout.elements.filter((element) => element.kind !== "section" && element.kind !== "block").map((element) => element.id === area.id ? updatedArea : element) },
      fits: true,
    };
  }

  const maximumWidth = Math.min(MAXIMUM_BLOCK_WIDTH, area.width - SECTION_PADDING * 2);
  let candidate: LayoutCandidate | null = null;
  for (let blockWidth = snapToGrid(maximumWidth); blockWidth >= MINIMUM_BLOCK_WIDTH; blockWidth -= BLOCK_SIZE_STEP) {
    candidate = createCandidate(mode, groups, updatedArea, blockWidth);
    if (candidate) break;
  }
  if (!candidate) {
    return {
      layout: { ...layout, elements: layout.elements.map((element) => element.id === area.id ? updatedArea : element) },
      fits: false,
    };
  }

  const unmanagedElements = layout.elements
    .filter((element) => element.kind !== "section" && element.kind !== "block")
    .map((element) => element.id === area.id ? updatedArea : element);
  return {
    layout: { ...layout, elements: [...unmanagedElements, ...buildManagedElements(layout, groups, candidate)] },
    fits: true,
    blockWidth: candidate.blockWidth,
    blockHeight: candidate.blockHeight,
  };
}

export function createLayoutFromSections(
  sections: PlanSection[],
  categories: BuildingBlockCategory[] = [],
  blocks: BuildingBlock[] = [],
): PlanLayout {
  const blockArea = createBlockAreaElement();
  const elements: PlanElement[] = [blockArea];
  sections.filter((section) => section.items.length > 0).forEach((section, sectionIndex) => {
    elements.push({
      id: `layout-section-${section.id}`,
      kind: "section",
      sectionId: section.id,
      x: blockArea.x,
      y: blockArea.y,
      width: blockArea.width,
      height: NEW_SECTION_HEIGHT,
      zIndex: 100 + sectionIndex,
      semanticOrder: sectionIndex * 1_000,
      locked: false,
    });
    section.items.forEach((item, itemIndex) => {
      elements.push({
        id: `layout-block-${item.id}`,
        kind: "block",
        sectionId: section.id,
        itemId: item.id,
        blockId: item.blockId,
        x: blockArea.x + SECTION_PADDING,
        y: blockArea.y + SECTION_HEADER_HEIGHT + SECTION_PADDING,
        width: MINIMUM_BLOCK_WIDTH,
        height: blockHeightForWidth(MINIMUM_BLOCK_WIDTH),
        zIndex: 500 + sectionIndex * 100 + itemIndex,
        semanticOrder: sectionIndex * 1_000 + itemIndex + 1,
      });
    });
  });
  elements.push({
    id: PLAN_TITLE_BLOCK_ELEMENT_ID,
    kind: "title_block",
    x: A0_LANDSCAPE_WIDTH - 3_200,
    y: A0_LANDSCAPE_HEIGHT - PLAN_SAFE_MARGIN - TITLE_BLOCK_HEIGHT,
    width: 3_020,
    height: TITLE_BLOCK_HEIGHT,
    zIndex: 1_000,
    semanticOrder: 10_000,
    locked: false,
  });
  const layout: PlanLayout = {
    layoutVersion: 4,
    format: "A0",
    orientation: "landscape",
    width: A0_LANDSCAPE_WIDTH,
    height: A0_LANDSCAPE_HEIGHT,
    safeMargin: PLAN_SAFE_MARGIN,
    gridSize: PLAN_GRID_SIZE,
    elements,
  };
  return fitBlocksInArea(layout, sections, categories, blocks).layout;
}

export function ensurePlanLayout(plan: Omit<Plan, "layout"> & { layout?: PlanLayout }): Plan {
  if (!plan.layout) return { ...plan, layout: createLayoutFromSections(plan.sections) };
  if (plan.layout.layoutVersion === 4) return plan as Plan;
  const legacyLayout = plan.layout as unknown as Omit<PlanLayout, "layoutVersion"> & { layoutVersion: number };
  const migratedElements = legacyLayout.elements.map((element) => element.kind === "title_block" || element.kind === "header" ? { ...element, locked: false } : element) as PlanElement[];
  return {
    ...plan,
    layout: { ...legacyLayout, layoutVersion: 4, elements: [createBlockAreaElement(), ...migratedElements] },
  };
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

function firstFreePosition(layout: PlanLayout, width: number, height: number, startX: number, endX: number): Pick<PlanBlockElement, "x" | "y" | "width" | "height"> | null {
  const maximumY = layout.height - layout.safeMargin - height;
  for (let y = layout.safeMargin; y <= maximumY; y += height + BLOCK_GAP) {
    for (let x = startX; x <= endX; x += width + BLOCK_GAP) {
      const candidate = { id: "candidate", kind: "block", x, y, width, height, zIndex: 1 } as PlanElement;
      const collision = layout.elements.some((element) => element.kind !== "block_area" && element.kind !== "section" && overlaps(candidate, element));
      if (!collision) return { x, y, width, height };
    }
  }
  return null;
}

export function findNextFreeNonBlockPosition(layout: PlanLayout, width: number, height: number): Pick<PlanBlockElement, "x" | "y" | "width" | "height"> {
  const area = getBlockArea(layout);
  const rightEdge = layout.width - layout.safeMargin - width;
  const preferredStart = area ? snapToGrid(area.x + area.width + SECTION_GAP, layout.gridSize) : layout.safeMargin;
  if (preferredStart <= rightEdge) {
    const preferred = firstFreePosition(layout, width, height, preferredStart, rightEdge);
    if (preferred) return preferred;
  }
  return firstFreePosition(layout, width, height, layout.safeMargin, rightEdge) ?? { x: layout.safeMargin, y: layout.safeMargin, width, height };
}

export function findNextFreeBlockPosition(layout: PlanLayout, width = MINIMUM_BLOCK_WIDTH, height = blockHeightForWidth(width)): Pick<PlanBlockElement, "x" | "y" | "width" | "height"> {
  const area = getBlockArea(layout);
  const startX = (area?.x ?? layout.safeMargin) + SECTION_PADDING;
  const startY = (area?.y ?? layout.safeMargin) + SECTION_HEADER_HEIGHT + SECTION_PADDING;
  const maximumX = (area ? area.x + area.width : layout.width - layout.safeMargin) - SECTION_PADDING - width;
  const maximumY = (area ? area.y + area.height : layout.height - layout.safeMargin) - SECTION_PADDING - height;
  for (let y = startY; y <= maximumY; y += height + BLOCK_GAP) {
    for (let x = startX; x <= maximumX; x += width + BLOCK_GAP) {
      const candidate = { id: "candidate", kind: "block", x, y, width, height, zIndex: 1 } as PlanElement;
      const collision = layout.elements.some((element) => element.kind === "block" && overlaps(candidate, element));
      if (!collision) return { x, y, width, height };
    }
  }
  return { x: startX, y: startY, width, height };
}

export function createSectionElement(sectionId: string, layout: PlanLayout, preferredY: number): PlanSectionElement {
  const area = getBlockArea(layout);
  const height = Math.min(NEW_SECTION_HEIGHT, area?.height ?? NEW_SECTION_HEIGHT);
  const minimumY = area?.y ?? layout.safeMargin;
  const maximumY = (area ? area.y + area.height : layout.height - layout.safeMargin) - height;
  const y = Math.min(Math.max(snapToGrid(preferredY - SECTION_HEADER_HEIGHT - SECTION_PADDING, layout.gridSize), minimumY), maximumY);
  return {
    id: `layout-section-${sectionId}`,
    kind: "section",
    sectionId,
    x: area?.x ?? layout.safeMargin,
    y,
    width: area?.width ?? layout.width - layout.safeMargin * 2,
    height,
    zIndex: Math.max(100, ...layout.elements.filter((element) => element.kind === "section").map((element) => element.zIndex)) + 1,
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
    layout.elements.push({ id: `layout-block-${item.id}`, kind: "block", sectionId: section.id, itemId: item.id, blockId: item.blockId, ...position, zIndex: 500 + layout.elements.length });
  });
  return { ...plan, layout };
}
