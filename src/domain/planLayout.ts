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

interface SectionHierarchyNode {
  section: PlanSection;
  items: PlanSection["items"];
  children: SectionHierarchyNode[];
  depth: number;
}

interface SectionPlacement {
  sectionId: string;
  depth: number;
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

interface LocalHierarchyLayout {
  width: number;
  height: number;
  placements: SectionPlacement[];
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

  const visibleCategoryIds = new Set<string>();
  itemsByCategory.forEach((items, categoryId) => {
    if (!items.length || !knownCategoryIds.has(categoryId)) return;
    categoryTrail(categoryId, categories).forEach((category) => visibleCategoryIds.add(category.id));
  });

  const reconciledSections = categories
    .filter((category) => visibleCategoryIds.has(category.id))
    .sort((left, right) => compareCategoryOrder(left.id, right.id, categories))
    .map((category) => {
      const categoryId = category.id;
      const existingSection = existingSectionByCategory.get(categoryId);
      return {
        ...(existingSection ?? { id: sectionIdForCategory(categoryId), categoryId }),
        categoryId,
        items: itemsByCategory.get(categoryId) ?? [],
      };
    });

  const unknownSections = sections.filter((section) => !knownCategoryIds.has(section.categoryId) && section.items.length > 0);
  return [...reconciledSections, ...unknownSections];
}

function sectionHierarchy(
  sections: PlanSection[],
  categories: BuildingBlockCategory[],
  blocks: BuildingBlock[],
): SectionHierarchyNode[] {
  const blockOrder = new Map(blocks.map((block, index) => [block.id, index]));
  const sectionByCategoryId = new Map(sections.map((section) => [section.categoryId, section]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const nodeByCategoryId = new Map<string, SectionHierarchyNode>(sections.map((section) => [section.categoryId, {
      section,
      items: section.items
        .map((item, index) => ({ item, index }))
        .sort((left, right) => (blockOrder.get(left.item.blockId) ?? Number.MAX_SAFE_INTEGER) - (blockOrder.get(right.item.blockId) ?? Number.MAX_SAFE_INTEGER) || left.index - right.index)
        .map(({ item }) => item),
      children: [],
      depth: Math.max(0, categoryTrail(section.categoryId, categories).length - 1),
    }] as const));

  const roots: SectionHierarchyNode[] = [];
  nodeByCategoryId.forEach((node, categoryId) => {
    const parentId = categoryById.get(categoryId)?.parentId;
    const parent = parentId ? nodeByCategoryId.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });
  const sortNodes = (nodes: SectionHierarchyNode[]) => {
    nodes.sort((left, right) => compareCategoryOrder(left.section.categoryId, right.section.categoryId, categories));
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(roots);
  return roots.filter((node) => sectionByCategoryId.has(node.section.categoryId));
}

function blockHeightForWidth(blockWidth: number): number {
  return snapToGrid(blockWidth / BLOCK_ASPECT_RATIO);
}

function offsetPlacements(placements: SectionPlacement[], offsetX: number, offsetY: number): SectionPlacement[] {
  return placements.map((placement) => ({
    ...placement,
    x: placement.x + offsetX,
    y: placement.y + offsetY,
    blocks: placement.blocks.map((block) => ({ ...block, x: block.x + offsetX, y: block.y + offsetY })),
  }));
}

function layoutHierarchyNode(
  node: SectionHierarchyNode,
  maximumWidth: number,
  blockWidth: number,
  blockHeight: number,
  mode: BlockLayoutMode,
): LocalHierarchyLayout | null {
  const minimumContainerWidth = blockWidth + SECTION_PADDING * 2;
  if (maximumWidth < minimumContainerWidth) return null;
  const contentWidth = maximumWidth - SECTION_PADDING * 2;
  const maximumChildColumns = Math.max(1, Math.floor((contentWidth + SECTION_GAP) / (minimumContainerWidth + SECTION_GAP)));
  const desiredChildColumns = mode === "horizontal"
    ? 1
    : mode === "vertical"
      ? maximumChildColumns
      : Math.min(3, maximumChildColumns);
  const childWidth = node.children.length
    ? (contentWidth - SECTION_GAP * (Math.min(desiredChildColumns, node.children.length) - 1)) / Math.min(desiredChildColumns, node.children.length)
    : contentWidth;
  const childLayouts: LocalHierarchyLayout[] = [];
  for (const child of node.children) {
    const childLayout = layoutHierarchyNode(child, childWidth, blockWidth, blockHeight, mode);
    if (!childLayout) return null;
    childLayouts.push(childLayout);
  }

  let cursorY = SECTION_HEADER_HEIGHT + SECTION_PADDING;
  let usedContentWidth = 0;
  const blockPlacements: SectionPlacement["blocks"] = [];
  if (node.items.length) {
    const blockColumns = Math.max(1, Math.floor((contentWidth + BLOCK_GAP) / (blockWidth + BLOCK_GAP)));
    const blockRows = Math.ceil(node.items.length / blockColumns);
    node.items.forEach((item, index) => {
      blockPlacements.push({
        itemId: item.id,
        x: SECTION_PADDING + (index % blockColumns) * (blockWidth + BLOCK_GAP),
        y: cursorY + Math.floor(index / blockColumns) * (blockHeight + BLOCK_GAP),
      });
    });
    usedContentWidth = Math.max(
      usedContentWidth,
      Math.min(blockColumns, node.items.length) * blockWidth + Math.max(0, Math.min(blockColumns, node.items.length) - 1) * BLOCK_GAP,
    );
    cursorY += blockRows * blockHeight + Math.max(0, blockRows - 1) * BLOCK_GAP;
    if (childLayouts.length) cursorY += SECTION_GAP;
  }

  const nestedPlacements: SectionPlacement[] = [];
  let childRowX = SECTION_PADDING;
  let childRowHeight = 0;
  childLayouts.forEach((childLayout) => {
    if (childRowX > SECTION_PADDING && childRowX + childLayout.width > SECTION_PADDING + contentWidth) {
      cursorY += childRowHeight + SECTION_GAP;
      childRowX = SECTION_PADDING;
      childRowHeight = 0;
    }
    nestedPlacements.push(...offsetPlacements(childLayout.placements, childRowX, cursorY));
    usedContentWidth = Math.max(usedContentWidth, childRowX - SECTION_PADDING + childLayout.width);
    childRowX += childLayout.width + SECTION_GAP;
    childRowHeight = Math.max(childRowHeight, childLayout.height);
  });
  if (childLayouts.length) cursorY += childRowHeight;

  const width = Math.max(minimumContainerWidth, usedContentWidth + SECTION_PADDING * 2);
  const height = cursorY + SECTION_PADDING;
  const placement: SectionPlacement = {
    sectionId: node.section.id,
    depth: node.depth,
    x: 0,
    y: 0,
    width,
    height,
    blocks: blockPlacements,
  };
  return { width, height, placements: [placement, ...nestedPlacements] };
}

function createCandidate(
  mode: BlockLayoutMode,
  roots: SectionHierarchyNode[],
  area: PlanBlockAreaElement,
  blockWidth: number,
): LayoutCandidate | null {
  const blockHeight = blockHeightForWidth(blockWidth);
  const minimumRootWidth = blockWidth + SECTION_PADDING * 2;
  const maximumRootColumns = Math.max(1, Math.floor((area.width + SECTION_GAP) / (minimumRootWidth + SECTION_GAP)));
  let bestCandidate: LayoutCandidate | null = null;

  for (let rootColumns = 1; rootColumns <= Math.min(roots.length, maximumRootColumns); rootColumns += 1) {
    const rootMaximumWidth = (area.width - SECTION_GAP * (rootColumns - 1)) / rootColumns;
    const rootLayouts: LocalHierarchyLayout[] = [];
    let valid = true;
    for (const root of roots) {
      const rootLayout = layoutHierarchyNode(root, rootMaximumWidth, blockWidth, blockHeight, mode);
      if (!rootLayout) { valid = false; break; }
      rootLayouts.push(rootLayout);
    }
    if (!valid) continue;

    let cursorX = area.x;
    let cursorY = area.y;
    let rowHeight = 0;
    let usedWidth = 0;
    const placements: SectionPlacement[] = [];
    rootLayouts.forEach((rootLayout, index) => {
      if (index > 0 && index % rootColumns === 0) {
        cursorX = area.x;
        cursorY += rowHeight + SECTION_GAP;
        rowHeight = 0;
      }
      placements.push(...offsetPlacements(rootLayout.placements, cursorX, cursorY));
      usedWidth = Math.max(usedWidth, cursorX - area.x + rootLayout.width);
      cursorX += rootLayout.width + SECTION_GAP;
      rowHeight = Math.max(rowHeight, rootLayout.height);
    });
    const usedHeight = cursorY - area.y + rowHeight;
    if (usedHeight > area.height) continue;
    const candidate = { blockWidth, blockHeight, placements, footprint: usedWidth * usedHeight };
    if (!bestCandidate || candidate.footprint < bestCandidate.footprint) bestCandidate = candidate;
  }
  return bestCandidate;
}

function flattenHierarchy(nodes: SectionHierarchyNode[]): SectionHierarchyNode[] {
  return nodes.flatMap((node) => [node, ...flattenHierarchy(node.children)]);
}

function buildManagedElements(layout: PlanLayout, roots: SectionHierarchyNode[], candidate: LayoutCandidate): PlanElement[] {
  const existingSectionElements = new Map(layout.elements.filter((element): element is PlanSectionElement => element.kind === "section").map((element) => [element.sectionId, element]));
  const existingBlockElements = new Map(layout.elements.filter((element): element is PlanBlockElement => element.kind === "block").map((element) => [element.itemId, element]));
  const groupBySectionId = new Map(flattenHierarchy(roots).map((group) => [group.section.id, group]));
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
      zIndex: 100 + placement.depth * 20 + sectionIndex,
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
  const roots = sectionHierarchy(sections, categories, blocks);
  const updatedArea = { ...area, layoutMode: mode };
  if (!roots.length) {
    return {
      layout: { ...layout, elements: layout.elements.filter((element) => element.kind !== "section" && element.kind !== "block").map((element) => element.id === area.id ? updatedArea : element) },
      fits: true,
    };
  }

  const maximumWidth = Math.min(MAXIMUM_BLOCK_WIDTH, area.width - SECTION_PADDING * 2);
  let candidate: LayoutCandidate | null = null;
  for (let blockWidth = snapToGrid(maximumWidth); blockWidth >= MINIMUM_BLOCK_WIDTH; blockWidth -= BLOCK_SIZE_STEP) {
    candidate = createCandidate(mode, roots, updatedArea, blockWidth);
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
    layout: { ...layout, elements: [...unmanagedElements, ...buildManagedElements(layout, roots, candidate)] },
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
