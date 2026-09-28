import type { BuildingBlock, BuildingBlockCategory, Locale } from "./types";

const CATEGORY_DEPTH_LIGHTENING_STEP = 0.24;
const MAXIMUM_CATEGORY_LIGHTENING = 0.78;
export const DEFAULT_ROOT_CATEGORY_COLOR = "#496f5f";

function validCategoryColor(color: string | undefined): string {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_ROOT_CATEGORY_COLOR;
}

function mixWithWhite(color: string | undefined, amount: number): string {
  const normalized = validCategoryColor(color).replace("#", "");
  const channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16));
  const mixed = channels.map((channel) => Math.round(channel + (255 - channel) * amount));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** Enforces the persistence contract: only root categories own a color. */
export function normalizeCategoryColorOwnership(category: BuildingBlockCategory): BuildingBlockCategory {
  if (!category.parentId) return { ...category, color: validCategoryColor(category.color) };
  const descendantCategory = { ...category };
  Reflect.deleteProperty(descendantCategory, "color");
  return descendantCategory;
}

export function categoryDescendantIds(categoryId: string, categories: BuildingBlockCategory[]): Set<string> {
  const ids = new Set([categoryId]);
  let changed = true;
  while (changed) {
    changed = false;
    categories.forEach((category) => {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id);
        changed = true;
      }
    });
  }
  return ids;
}

export function categoryPath(categoryId: string, categories: BuildingBlockCategory[], locale: Locale): string {
  return categoryTrail(categoryId, categories).map((category) => category.translations[locale]?.name ?? category.id).join(" / ");
}

export function categoryTrail(categoryId: string, categories: BuildingBlockCategory[]): BuildingBlockCategory[] {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const trail: BuildingBlockCategory[] = [];
  const visited = new Set<string>();
  let current = categoryMap.get(categoryId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    trail.unshift(current);
    current = current.parentId ? categoryMap.get(current.parentId) : undefined;
  }
  return trail;
}

/** Root categories own the hue; depth supplies a predictable lightness hierarchy. */
export function categoryHierarchyColor(categoryId: string, categories: BuildingBlockCategory[]): string {
  const trail = categoryTrail(categoryId, categories);
  if (!trail.length) return DEFAULT_ROOT_CATEGORY_COLOR;
  const depth = trail.length - 1;
  const lightening = Math.min(depth * CATEGORY_DEPTH_LIGHTENING_STEP, MAXIMUM_CATEGORY_LIGHTENING);
  return mixWithWhite(trail[0].color, lightening);
}

export function blockHierarchyColor(block: BuildingBlock, categories: BuildingBlockCategory[]): string {
  return categoryTrail(block.primaryCategoryId, categories).length
    ? categoryHierarchyColor(block.primaryCategoryId, categories)
    : DEFAULT_ROOT_CATEGORY_COLOR;
}

export function categoryPlacementIds(categoryId: string, categories: BuildingBlockCategory[]): string[] {
  return categoryTrail(categoryId, categories).map((category) => category.id);
}

export function categoryIdsInHierarchyOrder(categories: BuildingBlockCategory[]): string[] {
  const sourceOrder = new Map(categories.map((category, index) => [category.id, index]));
  const visited = new Set<string>();
  const orderedCategoryIds: string[] = [];
  const orderedSiblings = (parentId: string | undefined) => categories
    .filter((category) => category.parentId === parentId)
    .sort((left, right) => left.sortOrder - right.sortOrder
      || (sourceOrder.get(left.id) ?? 0) - (sourceOrder.get(right.id) ?? 0)
      || left.id.localeCompare(right.id));
  const visit = (category: BuildingBlockCategory) => {
    if (visited.has(category.id)) return;
    visited.add(category.id);
    orderedCategoryIds.push(category.id);
    orderedSiblings(category.id).forEach(visit);
  };

  orderedSiblings(undefined).forEach(visit);
  [...categories]
    .sort((left, right) => left.sortOrder - right.sortOrder
      || (sourceOrder.get(left.id) ?? 0) - (sourceOrder.get(right.id) ?? 0)
      || left.id.localeCompare(right.id))
    .forEach(visit);
  return orderedCategoryIds;
}

export function blocksInCategoryHierarchyOrder(
  blocks: BuildingBlock[],
  categories: BuildingBlockCategory[],
): BuildingBlock[] {
  const categoryOrder = new Map(categoryIdsInHierarchyOrder(categories).map((categoryId, index) => [categoryId, index]));
  return blocks
    .map((block, sourceIndex) => ({ block, sourceIndex }))
    .sort((left, right) => (categoryOrder.get(left.block.primaryCategoryId) ?? Number.MAX_SAFE_INTEGER)
      - (categoryOrder.get(right.block.primaryCategoryId) ?? Number.MAX_SAFE_INTEGER)
      || left.sourceIndex - right.sourceIndex)
    .map(({ block }) => block);
}

export function reorderCategoryIds(
  orderedCategoryIds: string[],
  movedCategoryId: string,
  targetCategoryId: string,
  edge: "before" | "after",
): string[] {
  if (movedCategoryId === targetCategoryId) return orderedCategoryIds;
  if (!orderedCategoryIds.includes(movedCategoryId) || !orderedCategoryIds.includes(targetCategoryId)) return orderedCategoryIds;

  const reorderedCategoryIds = orderedCategoryIds.filter((categoryId) => categoryId !== movedCategoryId);
  const targetIndex = reorderedCategoryIds.indexOf(targetCategoryId);
  const insertionIndex = targetIndex + (edge === "after" ? 1 : 0);
  reorderedCategoryIds.splice(insertionIndex, 0, movedCategoryId);
  return reorderedCategoryIds;
}

export function canReparentCategory(categoryId: string, parentId: string | undefined, categories: BuildingBlockCategory[]): boolean {
  if (!parentId) return true;
  return !categoryDescendantIds(categoryId, categories).has(parentId);
}

export function blockMatchesCategory(block: BuildingBlock, categoryId: string, categories: BuildingBlockCategory[]): boolean {
  const visibleCategoryIds = categoryDescendantIds(categoryId, categories);
  return block.categoryIds.some((id) => visibleCategoryIds.has(id));
}
