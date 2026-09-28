import { categoryTrail } from "./categoryTree";
import { PLAN_PRESENTATION } from "./planPresentation";
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
const BASE_SECTION_HEADER_HEIGHT = PLAN_PRESENTATION.section.headerHeight / CSS_PIXELS_PER_LAYOUT_UNIT;
const BASE_SECTION_PADDING = 60;
const BASE_SECTION_GAP = 80;
const BASE_BLOCK_GAP = 50;
export const REFERENCE_BLOCK_WIDTH = 1_800;
const MINIMUM_FITTED_BLOCK_WIDTH = 240;
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
  contentScale: number;
}

interface LocalHierarchyLayout {
  width: number;
  height: number;
  placements: SectionPlacement[];
}

interface ScaledLayoutMetrics {
  contentScale: number;
  sectionHeaderHeight: number;
  sectionPadding: number;
  sectionGap: number;
  blockGap: number;
}

export interface BlockPresentationMetrics {
  contentScale: number;
  layoutScale: number;
  fits: boolean;
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

function scaledLayoutMetric(baseValue: number, contentScale: number): number {
  return Math.max(PLAN_GRID_SIZE, snapToGrid(baseValue * contentScale));
}

function scaledLayoutMetrics(blockWidth: number): ScaledLayoutMetrics {
  const contentScale = blockWidth / REFERENCE_BLOCK_WIDTH;
  return {
    contentScale,
    sectionHeaderHeight: scaledLayoutMetric(BASE_SECTION_HEADER_HEIGHT, contentScale),
    sectionPadding: scaledLayoutMetric(BASE_SECTION_PADDING, contentScale),
    sectionGap: scaledLayoutMetric(BASE_SECTION_GAP, contentScale),
    blockGap: scaledLayoutMetric(BASE_BLOCK_GAP, contentScale),
  };
}

const ESTIMATED_GLYPH_WIDTH_RATIO = 0.56;
const MINIMUM_RELATIVE_CONTENT_SCALE = 0.04;

function estimatedWrappedLineCount(text: string, availableWidth: number, fontSize: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  const maximumCharacters = Math.max(1, Math.floor(availableWidth / Math.max(0.1, fontSize * ESTIMATED_GLYPH_WIDTH_RATIO)));
  let lines = 1;
  let currentLineLength = 0;
  words.forEach((word) => {
    const wordLength = word.length;
    if (wordLength > maximumCharacters) {
      if (currentLineLength > 0) lines += 1;
      lines += Math.ceil(wordLength / maximumCharacters) - 1;
      currentLineLength = wordLength % maximumCharacters;
      return;
    }
    const requiredLength = currentLineLength ? currentLineLength + 1 + wordLength : wordLength;
    if (requiredLength > maximumCharacters) {
      lines += 1;
      currentLineLength = wordLength;
    } else {
      currentLineLength = requiredLength;
    }
  });
  return lines;
}

function blockContentFitsAtScale(
  element: Pick<PlanBlockElement, "width" | "height">,
  title: string,
  description: string,
  regulations: string,
  layoutScale: number,
  contentScale: number,
): boolean {
  const width = element.width * CSS_PIXELS_PER_LAYOUT_UNIT;
  const height = element.height * CSS_PIXELS_PER_LAYOUT_UNIT;
  const { block } = PLAN_PRESENTATION;
  const titleWidth = Math.max(1, width - block.titleHorizontalPadding * 2 * layoutScale);
  const titleLines = estimatedWrappedLineCount(title, titleWidth, block.titleFontSize * contentScale);
  const titleHeight = titleLines * block.titleFontSize * block.titleLineHeight * contentScale
    + block.titleVerticalPadding * 2 * layoutScale;
  const footerWidth = Math.max(1, width - block.referenceHorizontalMargin * 2 * layoutScale);
  const footerLines = estimatedWrappedLineCount(regulations, footerWidth, block.referenceFontSize * contentScale);
  const footerHeight = footerLines * block.referenceFontSize * block.referenceLineHeight * contentScale
    + (block.referenceTopPadding + block.referenceBottomPadding) * layoutScale;
  const descriptionWidth = Math.max(
    1,
    (width - (block.bodyPadding * 2 + block.bodyColumnGap) * layoutScale) / 2,
  );
  const descriptionLines = estimatedWrappedLineCount(description, descriptionWidth, block.descriptionFontSize * contentScale);
  const descriptionHeight = descriptionLines * block.descriptionFontSize * block.descriptionLineHeight * contentScale
    + block.bodyPadding * 2 * layoutScale;
  return titleHeight + footerHeight + descriptionHeight <= height;
}

export function calculateBlockPresentationMetrics(
  element: Pick<PlanBlockElement, "contentScale" | "width" | "height">,
  title: string,
  description: string,
  regulations: string,
): BlockPresentationMetrics {
  const referenceHeight = REFERENCE_BLOCK_WIDTH / BLOCK_ASPECT_RATIO;
  const geometryScale = Math.min(element.width / REFERENCE_BLOCK_WIDTH, element.height / referenceHeight);
  const layoutScale = Math.max(0.01, Math.min(element.contentScale ?? geometryScale, geometryScale));
  const minimumScale = layoutScale * MINIMUM_RELATIVE_CONTENT_SCALE;
  if (blockContentFitsAtScale(element, title, description, regulations, layoutScale, layoutScale)) {
    return { contentScale: layoutScale, layoutScale, fits: true };
  }
  if (!blockContentFitsAtScale(element, title, description, regulations, layoutScale, minimumScale)) {
    return { contentScale: minimumScale, layoutScale, fits: false };
  }
  let lowerBound = minimumScale;
  let upperBound = layoutScale;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const candidateScale = (lowerBound + upperBound) / 2;
    if (blockContentFitsAtScale(element, title, description, regulations, layoutScale, candidateScale)) {
      lowerBound = candidateScale;
    } else {
      upperBound = candidateScale;
    }
  }
  return { contentScale: lowerBound, layoutScale, fits: true };
}

function sectionTitleFitsAtScale(
  element: Pick<PlanSectionElement, "width">,
  title: string,
  layoutScale: number,
  contentScale: number,
): boolean {
  const { section } = PLAN_PRESENTATION;
  const availableWidth = Math.max(
    1,
    element.width * CSS_PIXELS_PER_LAYOUT_UNIT - section.horizontalPadding * 2 * layoutScale,
  );
  const availableHeight = Math.max(
    1,
    section.headerHeight * layoutScale - section.verticalPadding * 2 * layoutScale,
  );
  const titleLines = estimatedWrappedLineCount(title, availableWidth, section.titleFontSize * contentScale);
  return titleLines * section.titleFontSize * section.titleLineHeight * contentScale <= availableHeight;
}

export function calculateSectionPresentationMetrics(
  element: Pick<PlanSectionElement, "contentScale" | "width">,
  title: string,
): BlockPresentationMetrics {
  const layoutScale = Math.max(0.01, element.contentScale ?? 1);
  const minimumScale = layoutScale * MINIMUM_RELATIVE_CONTENT_SCALE;
  if (sectionTitleFitsAtScale(element, title, layoutScale, layoutScale)) {
    return { contentScale: layoutScale, layoutScale, fits: true };
  }
  if (!sectionTitleFitsAtScale(element, title, layoutScale, minimumScale)) {
    return { contentScale: minimumScale, layoutScale, fits: false };
  }
  let lowerBound = minimumScale;
  let upperBound = layoutScale;
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const candidateScale = (lowerBound + upperBound) / 2;
    if (sectionTitleFitsAtScale(element, title, layoutScale, candidateScale)) {
      lowerBound = candidateScale;
    } else {
      upperBound = candidateScale;
    }
  }
  return { contentScale: lowerBound, layoutScale, fits: true };
}

function offsetPlacements(placements: SectionPlacement[], offsetX: number, offsetY: number): SectionPlacement[] {
  return placements.map((placement) => ({
    ...placement,
    x: placement.x + offsetX,
    y: placement.y + offsetY,
    blocks: placement.blocks.map((block) => ({ ...block, x: block.x + offsetX, y: block.y + offsetY })),
  }));
}

function layoutAdaptiveHierarchyNode(
  node: SectionHierarchyNode,
  maximumWidth: number,
  blockWidth: number,
  blockHeight: number,
  metrics: ScaledLayoutMetrics,
): LocalHierarchyLayout | null {
  const minimumContainerWidth = blockWidth + metrics.sectionPadding * 2;
  if (maximumWidth < minimumContainerWidth) return null;
  const contentWidth = maximumWidth - metrics.sectionPadding * 2;
  const maximumChildColumns = Math.max(1, Math.floor((contentWidth + metrics.sectionGap) / (minimumContainerWidth + metrics.sectionGap)));
  const desiredChildColumns = Math.min(3, maximumChildColumns);
  const childWidth = node.children.length
    ? (contentWidth - metrics.sectionGap * (Math.min(desiredChildColumns, node.children.length) - 1)) / Math.min(desiredChildColumns, node.children.length)
    : contentWidth;
  const childLayouts: LocalHierarchyLayout[] = [];
  for (const child of node.children) {
    const childLayout = layoutAdaptiveHierarchyNode(child, childWidth, blockWidth, blockHeight, metrics);
    if (!childLayout) return null;
    childLayouts.push(childLayout);
  }

  let cursorY = metrics.sectionHeaderHeight + metrics.sectionPadding;
  let usedContentWidth = 0;
  const blockPlacements: SectionPlacement["blocks"] = [];
  if (node.items.length) {
    const blockColumns = Math.max(1, Math.floor((contentWidth + metrics.blockGap) / (blockWidth + metrics.blockGap)));
    const blockRows = Math.ceil(node.items.length / blockColumns);
    node.items.forEach((item, index) => {
      blockPlacements.push({
        itemId: item.id,
        x: metrics.sectionPadding + (index % blockColumns) * (blockWidth + metrics.blockGap),
        y: cursorY + Math.floor(index / blockColumns) * (blockHeight + metrics.blockGap),
      });
    });
    usedContentWidth = Math.max(
      usedContentWidth,
      Math.min(blockColumns, node.items.length) * blockWidth + Math.max(0, Math.min(blockColumns, node.items.length) - 1) * metrics.blockGap,
    );
    cursorY += blockRows * blockHeight + Math.max(0, blockRows - 1) * metrics.blockGap;
    if (childLayouts.length) cursorY += metrics.sectionGap;
  }

  const nestedPlacements: SectionPlacement[] = [];
  let childRowX = metrics.sectionPadding;
  let childRowHeight = 0;
  childLayouts.forEach((childLayout) => {
    if (childRowX > metrics.sectionPadding && childRowX + childLayout.width > metrics.sectionPadding + contentWidth) {
      cursorY += childRowHeight + metrics.sectionGap;
      childRowX = metrics.sectionPadding;
      childRowHeight = 0;
    }
    nestedPlacements.push(...offsetPlacements(childLayout.placements, childRowX, cursorY));
    usedContentWidth = Math.max(usedContentWidth, childRowX - metrics.sectionPadding + childLayout.width);
    childRowX += childLayout.width + metrics.sectionGap;
    childRowHeight = Math.max(childRowHeight, childLayout.height);
  });
  if (childLayouts.length) cursorY += childRowHeight;

  const width = Math.max(minimumContainerWidth, usedContentWidth + metrics.sectionPadding * 2);
  const height = cursorY + metrics.sectionPadding;
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

function layoutDirectionalHierarchyNode(
  node: SectionHierarchyNode,
  blockWidth: number,
  blockHeight: number,
  mode: Exclude<BlockLayoutMode, "best_fit">,
  metrics: ScaledLayoutMetrics,
): LocalHierarchyLayout {
  const childLayouts = node.children.map((child) => (
    layoutDirectionalHierarchyNode(child, blockWidth, blockHeight, mode, metrics)
  ));
  let cursorY = metrics.sectionHeaderHeight + metrics.sectionPadding;
  let usedContentWidth = 0;
  const blockPlacements: SectionPlacement["blocks"] = [];

  if (node.items.length) {
    const blockColumns = mode === "vertical" ? 1 : node.items.length;
    const blockRows = mode === "vertical" ? node.items.length : 1;
    node.items.forEach((item, index) => {
      blockPlacements.push({
        itemId: item.id,
        x: metrics.sectionPadding + (index % blockColumns) * (blockWidth + metrics.blockGap),
        y: cursorY + Math.floor(index / blockColumns) * (blockHeight + metrics.blockGap),
      });
    });
    usedContentWidth = blockColumns * blockWidth + Math.max(0, blockColumns - 1) * metrics.blockGap;
    cursorY += blockRows * blockHeight + Math.max(0, blockRows - 1) * metrics.blockGap;
    if (childLayouts.length) cursorY += metrics.sectionGap;
  }

  const nestedPlacements: SectionPlacement[] = [];
  if (childLayouts.length && mode === "vertical") {
    let childX = metrics.sectionPadding;
    let childRowHeight = 0;
    childLayouts.forEach((childLayout, index) => {
      nestedPlacements.push(...offsetPlacements(childLayout.placements, childX, cursorY));
      childX += childLayout.width;
      if (index < childLayouts.length - 1) childX += metrics.sectionGap;
      childRowHeight = Math.max(childRowHeight, childLayout.height);
    });
    usedContentWidth = Math.max(usedContentWidth, childX - metrics.sectionPadding);
    cursorY += childRowHeight;
  } else if (childLayouts.length) {
    let childY = cursorY;
    let maximumChildWidth = 0;
    childLayouts.forEach((childLayout, index) => {
      nestedPlacements.push(...offsetPlacements(childLayout.placements, metrics.sectionPadding, childY));
      childY += childLayout.height;
      if (index < childLayouts.length - 1) childY += metrics.sectionGap;
      maximumChildWidth = Math.max(maximumChildWidth, childLayout.width);
    });
    usedContentWidth = Math.max(usedContentWidth, maximumChildWidth);
    cursorY = childY;
  }

  const width = Math.max(blockWidth, usedContentWidth) + metrics.sectionPadding * 2;
  const height = cursorY + metrics.sectionPadding;
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

function createDirectionalCandidate(
  mode: Exclude<BlockLayoutMode, "best_fit">,
  roots: SectionHierarchyNode[],
  area: PlanBlockAreaElement,
  blockWidth: number,
): LayoutCandidate | null {
  const blockHeight = blockHeightForWidth(blockWidth);
  const metrics = scaledLayoutMetrics(blockWidth);
  const rootLayouts = roots.map((root) => layoutDirectionalHierarchyNode(root, blockWidth, blockHeight, mode, metrics));
  let cursorX = area.x;
  let cursorY = area.y;
  let usedWidth = 0;
  let usedHeight = 0;
  const placements: SectionPlacement[] = [];

  rootLayouts.forEach((rootLayout, index) => {
    placements.push(...offsetPlacements(rootLayout.placements, cursorX, cursorY));
    if (mode === "vertical") {
      cursorX += rootLayout.width;
      if (index < rootLayouts.length - 1) cursorX += metrics.sectionGap;
      usedWidth = cursorX - area.x;
      usedHeight = Math.max(usedHeight, rootLayout.height);
    } else {
      cursorY += rootLayout.height;
      if (index < rootLayouts.length - 1) cursorY += metrics.sectionGap;
      usedWidth = Math.max(usedWidth, rootLayout.width);
      usedHeight = cursorY - area.y;
    }
  });

  if (usedWidth > area.width || usedHeight > area.height) return null;
  return { blockWidth, blockHeight, placements, footprint: usedWidth * usedHeight, contentScale: metrics.contentScale };
}

function createAdaptiveCandidate(
  roots: SectionHierarchyNode[],
  area: PlanBlockAreaElement,
  blockWidth: number,
): LayoutCandidate | null {
  const blockHeight = blockHeightForWidth(blockWidth);
  const metrics = scaledLayoutMetrics(blockWidth);
  const minimumRootWidth = blockWidth + metrics.sectionPadding * 2;
  const maximumRootColumns = Math.max(1, Math.floor((area.width + metrics.sectionGap) / (minimumRootWidth + metrics.sectionGap)));
  let bestCandidate: LayoutCandidate | null = null;
  const maximumUsableRootColumns = Math.min(roots.length, maximumRootColumns);
  const rootColumnOptions = Array.from({ length: maximumUsableRootColumns }, (_, index) => index + 1);

  for (const rootColumns of rootColumnOptions) {
    const rootMaximumWidth = (area.width - metrics.sectionGap * (rootColumns - 1)) / rootColumns;
    const rootLayouts: LocalHierarchyLayout[] = [];
    let valid = true;
    for (const root of roots) {
      const rootLayout = layoutAdaptiveHierarchyNode(root, rootMaximumWidth, blockWidth, blockHeight, metrics);
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
        cursorY += rowHeight + metrics.sectionGap;
        rowHeight = 0;
      }
      placements.push(...offsetPlacements(rootLayout.placements, cursorX, cursorY));
      usedWidth = Math.max(usedWidth, cursorX - area.x + rootLayout.width);
      cursorX += rootLayout.width + metrics.sectionGap;
      rowHeight = Math.max(rowHeight, rootLayout.height);
    });
    const usedHeight = cursorY - area.y + rowHeight;
    if (usedHeight > area.height) continue;
    const candidate = { blockWidth, blockHeight, placements, footprint: usedWidth * usedHeight, contentScale: metrics.contentScale };
    if (!bestCandidate || candidate.footprint < bestCandidate.footprint) bestCandidate = candidate;
  }
  return bestCandidate;
}

function createCandidate(
  mode: BlockLayoutMode,
  roots: SectionHierarchyNode[],
  area: PlanBlockAreaElement,
  blockWidth: number,
): LayoutCandidate | null {
  return mode === "best_fit"
    ? createAdaptiveCandidate(roots, area, blockWidth)
    : createDirectionalCandidate(mode, roots, area, blockWidth);
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
      contentScale: candidate.contentScale,
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
        contentScale: candidate.contentScale,
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

  const maximumWidth = Math.min(REFERENCE_BLOCK_WIDTH, area.width - BASE_SECTION_PADDING * 2);
  let candidate: LayoutCandidate | null = null;
  for (let blockWidth = snapToGrid(maximumWidth); blockWidth >= MINIMUM_FITTED_BLOCK_WIDTH; blockWidth -= BLOCK_SIZE_STEP) {
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
        x: blockArea.x + BASE_SECTION_PADDING,
        y: blockArea.y + BASE_SECTION_HEADER_HEIGHT + BASE_SECTION_PADDING,
        width: MINIMUM_FITTED_BLOCK_WIDTH,
        height: blockHeightForWidth(MINIMUM_FITTED_BLOCK_WIDTH),
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
  for (let y = layout.safeMargin; y <= maximumY; y += height + BASE_BLOCK_GAP) {
    for (let x = startX; x <= endX; x += width + BASE_BLOCK_GAP) {
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
  const preferredStart = area ? snapToGrid(area.x + area.width + BASE_SECTION_GAP, layout.gridSize) : layout.safeMargin;
  if (preferredStart <= rightEdge) {
    const preferred = firstFreePosition(layout, width, height, preferredStart, rightEdge);
    if (preferred) return preferred;
  }
  return firstFreePosition(layout, width, height, layout.safeMargin, rightEdge) ?? { x: layout.safeMargin, y: layout.safeMargin, width, height };
}

export function findNextFreeBlockPosition(layout: PlanLayout, width = MINIMUM_FITTED_BLOCK_WIDTH, height = blockHeightForWidth(width)): Pick<PlanBlockElement, "x" | "y" | "width" | "height"> {
  const area = getBlockArea(layout);
  const startX = (area?.x ?? layout.safeMargin) + BASE_SECTION_PADDING;
  const startY = (area?.y ?? layout.safeMargin) + BASE_SECTION_HEADER_HEIGHT + BASE_SECTION_PADDING;
  const maximumX = (area ? area.x + area.width : layout.width - layout.safeMargin) - BASE_SECTION_PADDING - width;
  const maximumY = (area ? area.y + area.height : layout.height - layout.safeMargin) - BASE_SECTION_PADDING - height;
  for (let y = startY; y <= maximumY; y += height + BASE_BLOCK_GAP) {
    for (let x = startX; x <= maximumX; x += width + BASE_BLOCK_GAP) {
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
  const y = Math.min(Math.max(snapToGrid(preferredY - BASE_SECTION_HEADER_HEIGHT - BASE_SECTION_PADDING, layout.gridSize), minimumY), maximumY);
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
