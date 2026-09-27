import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { blockMatchesCategory, canReparentCategory, categoryDescendantIds, categoryPath } from "./categoryTree";

describe("recursive category tree", () => {
  const database = createSeedDatabase();

  it("supports at least four levels and localized breadcrumb paths", () => {
    const deepest = database.categories.find((category) => category.id === "mobile-distribution-units");
    expect(deepest).toBeDefined();
    expect(categoryPath(deepest!.id, database.categories, "en").split(" / ").length).toBeGreaterThanOrEqual(4);
  });

  it("includes descendant assignments when filtering a parent", () => {
    const descendantIds = categoryDescendantIds("site-setup", database.categories);
    expect(descendantIds.has("mobile-distribution-units")).toBe(true);
    const block = database.blocks.find((candidate) => candidate.categoryIds.length > 1)!;
    expect(blockMatchesCategory(block, block.categoryIds[0], database.categories)).toBe(true);
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
});
