import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import {
  blockHierarchyColor,
  blockMatchesCategory,
  blocksInCategoryHierarchyOrder,
  canReparentCategory,
  categoryDescendantIds,
  categoryHierarchyColor,
  categoryPath,
  categoryPlacementIds,
  categoryTrail,
  reorderCategoryIds,
} from "./categoryTree";

describe("recursive category tree", () => {
  const database = createSeedDatabase();

  it("supports at least four levels and localized breadcrumb paths", () => {
    const deepest = database.categories.find((category) => category.id === "mobile-distribution-units");
    expect(deepest).toBeDefined();
    expect(categoryPath(deepest!.id, database.categories, "en").split(" / ").length).toBeGreaterThanOrEqual(4);
    expect(categoryTrail(deepest!.id, database.categories).map((category) => category.id)).toEqual([
      "site-setup", "site-utilities", "site-power-water", "temporary-electrical-distribution", "mobile-distribution-units",
    ]);
  });

  it("includes descendant assignments when filtering a parent", () => {
    const descendantIds = categoryDescendantIds("site-setup", database.categories);
    expect(descendantIds.has("mobile-distribution-units")).toBe(true);
    const block = database.blocks.find((candidate) => candidate.categoryIds.length > 1)!;
    expect(blockMatchesCategory(block, block.categoryIds[0], database.categories)).toBe(true);
  });

  it("derives one progressively lighter color family and a complete placement path", () => {
    const rootColor = categoryHierarchyColor("site-setup", database.categories);
    const firstLevelColor = categoryHierarchyColor("site-access-emergency", database.categories);
    const siblingColor = categoryHierarchyColor("site-utilities", database.categories);
    const deepestColor = categoryHierarchyColor("mobile-distribution-units", database.categories);
    const emergencyBlock = database.blocks.find((block) => block.id === "block-first-aid")!;

    expect(rootColor).toBe("#c8644d");
    expect(firstLevelColor).toBe(siblingColor);
    expect(firstLevelColor).not.toBe(rootColor);
    expect(deepestColor).not.toBe(firstLevelColor);
    expect(blockHierarchyColor(emergencyBlock, database.categories)).toBe(firstLevelColor);
    expect(categoryPlacementIds("mobile-distribution-units", database.categories)).toEqual([
      "site-setup", "site-utilities", "site-power-water", "temporary-electrical-distribution", "mobile-distribution-units",
    ]);
  });

  it("prevents self-parenting and descendant cycles while allowing safe reparenting", () => {
    expect(canReparentCategory("site-setup", "mobile-distribution-units", database.categories)).toBe(false);
    expect(canReparentCategory("site-setup", "site-setup", database.categories)).toBe(false);
    expect(canReparentCategory("mobile-distribution-units", "work-at-height", database.categories)).toBe(true);
  });

  it("retains archived nodes in persisted hierarchy without showing them as active", () => {
    const archived = { ...database.categories[0], id: "archived-category", lifecycle: "archived" as const };
    const categories = [...database.categories, archived];
    expect(categoryDescendantIds(archived.id, categories)).toEqual(new Set([archived.id]));
    expect(categories.filter((category) => category.lifecycle === "active")).not.toContainEqual(archived);
  });

  it("uses the indicated edge when categories move upward or downward", () => {
    const initialOrder = ["access", "utilities", "security"];

    expect(reorderCategoryIds(initialOrder, "security", "utilities", "after")).toEqual([
      "access", "utilities", "security",
    ]);
    expect(reorderCategoryIds(initialOrder, "security", "access", "after")).toEqual([
      "access", "security", "utilities",
    ]);
    expect(reorderCategoryIds(initialOrder, "access", "security", "after")).toEqual([
      "utilities", "security", "access",
    ]);
    expect(reorderCategoryIds(initialOrder, "security", "access", "before")).toEqual([
      "security", "access", "utilities",
    ]);
  });

  it("orders blocks by the current recursive catalog hierarchy", () => {
    const categories = database.categories.map((category) => {
      if (category.id === "site-setup") return { ...category, sortOrder: 0 };
      if (category.id === "preparation") return { ...category, sortOrder: 10 };
      if (category.id === "imported-site-security") return { ...category, sortOrder: 0 };
      if (category.id === "site-access-emergency") return { ...category, sortOrder: 1 };
      if (category.id === "site-utilities") return { ...category, sortOrder: 2 };
      return category;
    });

    const orderedBlockIds = blocksInCategoryHierarchyOrder(database.blocks, categories).map((block) => block.id);

    expect(orderedBlockIds[0]).toBe("block-site-fencing");
    expect(orderedBlockIds.indexOf("import-portable-fence")).toBeLessThan(orderedBlockIds.indexOf("block-site-access"));
    expect(orderedBlockIds.indexOf("block-site-access")).toBeLessThan(orderedBlockIds.indexOf("block-temporary-power"));
    expect(orderedBlockIds.indexOf("block-temporary-power")).toBeLessThan(orderedBlockIds.indexOf("block-existing-utilities"));
  });
});
