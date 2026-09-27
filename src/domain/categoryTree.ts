import type { BuildingBlock, BuildingBlockCategory, Locale } from "./types";

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
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const names: string[] = [];
  const visited = new Set<string>();
  let current = categoryMap.get(categoryId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    names.unshift(current.translations[locale]?.name ?? current.id);
    current = current.parentId ? categoryMap.get(current.parentId) : undefined;
  }
  return names.join(" / ");
}

export function canReparentCategory(categoryId: string, parentId: string | undefined, categories: BuildingBlockCategory[]): boolean {
  if (!parentId) return true;
  return !categoryDescendantIds(categoryId, categories).has(parentId);
}

export function blockMatchesCategory(block: BuildingBlock, categoryId: string, categories: BuildingBlockCategory[]): boolean {
  const visibleCategoryIds = categoryDescendantIds(categoryId, categories);
  return block.categoryIds.some((id) => visibleCategoryIds.has(id));
}
