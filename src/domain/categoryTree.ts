import type { BuildingBlock, BuildingBlockCategory, Locale } from "./types";

const FALLBACK_CATEGORY_COLOR = "#496f5f";

function validCategoryColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : FALLBACK_CATEGORY_COLOR;
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

/** Category colors are catalog-owned and must remain identical in every consumer. */
export function categoryHierarchyColor(categoryId: string, categories: BuildingBlockCategory[]): string {
  const category = categories.find((candidate) => candidate.id === categoryId);
  return category ? validCategoryColor(category.color) : FALLBACK_CATEGORY_COLOR;
}

export function blockHierarchyColor(block: BuildingBlock, categories: BuildingBlockCategory[]): string {
  return categoryTrail(block.primaryCategoryId, categories).length
    ? categoryHierarchyColor(block.primaryCategoryId, categories)
    : block.color;
}

export function categoryPlacementIds(categoryId: string, categories: BuildingBlockCategory[]): string[] {
  return categoryTrail(categoryId, categories).map((category) => category.id);
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
