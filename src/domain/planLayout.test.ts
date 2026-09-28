import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import type { Plan, PlanBlockElement } from "./types";
import {
  A0_LANDSCAPE_HEIGHT, A0_LANDSCAPE_WIDTH, clampElementToPage, createSectionElement,
  cssPixelsToLayoutUnits, ensurePlanLayout, findNextFreeBlockPosition, findNextFreeNonBlockPosition,
  fitBlocksInArea, getBlockArea, layoutUnitsToCssPixels, layoutUnitsToMillimetres, PLAN_UNITS_PER_MILLIMETRE,
  reconcilePlanSectionsWithCatalog, resizeElementFromCssMeasurement, snapToGrid,
} from "./planLayout";

describe("physical A0 layout", () => {
  it("uses exact landscape A0 dimensions in tenths of a millimetre", () => {
    expect(A0_LANDSCAPE_WIDTH / PLAN_UNITS_PER_MILLIMETRE).toBe(1_189);
    expect(A0_LANDSCAPE_HEIGHT / PLAN_UNITS_PER_MILLIMETRE).toBe(841);
  });

  it("snaps and clamps freely positioned elements inside the printable page", () => {
    const layout = createSeedDatabase().plans[0].layout;
    const element = layout.elements.find((candidate) => candidate.kind === "block");
    expect(element).toBeDefined();
    const clamped = clampElementToPage({ ...element!, x: -100, y: 99_000 }, layout);
    expect(clamped.x).toBe(layout.safeMargin);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(layout.height - layout.safeMargin);
    expect(clamped.x).toBe(snapToGrid(clamped.x));
  });

  it("creates a labelled section when a block introduces a new category", () => {
    const layout = createSeedDatabase().plans[0].layout;
    const free = findNextFreeBlockPosition(layout);
    const section = createSectionElement("new-section", layout, free.y);
    expect(section.kind).toBe("section");
    expect(section.locked).toBe(false);
    expect(section.y).toBeGreaterThanOrEqual(layout.safeMargin);
    expect(section.y + section.height).toBeLessThanOrEqual(layout.height - layout.safeMargin);
  });

  it("creates a selectable block area without forcing a plan header", () => {
    const layout = createSeedDatabase().plans[0].layout;
    expect(layout.layoutVersion).toBe(4);
    expect(layout.elements.find((element) => element.kind === "block_area")?.locked).toBe(false);
    expect(layout.elements.some((element) => element.kind === "header")).toBe(false);
    expect(layout.elements.find((element) => element.kind === "title_block")?.locked).toBe(false);
  });

  it("migrates a legacy layout without changing or recreating existing content", () => {
    const plan = structuredClone(createSeedDatabase().plans[0]);
    const before = plan.layout.elements.filter((element) => element.kind !== "block_area");
    const legacyHeader = { id: "legacy-header", kind: "header" as const, x: 180, y: 180, width: 11_530, height: 520, zIndex: 900 };
    const legacyPlan = { ...plan, layout: { ...plan.layout, layoutVersion: 3, elements: [legacyHeader, ...before] } };
    const migrated = ensurePlanLayout(legacyPlan as unknown as Plan);
    expect(migrated.layout.layoutVersion).toBe(4);
    expect(migrated.layout.elements[0].kind).toBe("block_area");
    expect(migrated.layout.elements.some((element) => element.id === legacyHeader.id)).toBe(true);
    expect(migrated.layout.elements.filter((element) => element.kind !== "block_area" && element.kind !== "header").map(({ x, y, width, height }) => ({ x, y, width, height })))
      .toEqual(before.map(({ x, y, width, height }) => ({ x, y, width, height })));
  });

  it.each(["vertical", "horizontal", "best_fit"] as const)("fits blocks uniformly inside the block area in %s mode", (mode) => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    const result = fitBlocksInArea(plan.layout, plan.sections, database.categories, database.blocks, mode);
    const area = getBlockArea(result.layout);
    const blocks = result.layout.elements.filter((element) => element.kind === "block");

    expect(result.fits).toBe(true);
    expect(area?.layoutMode).toBe(mode);
    expect(new Set(blocks.map((element) => `${element.width}x${element.height}`)).size).toBe(1);
    expect(blocks.every((element) => area && element.x >= area.x && element.y >= area.y && element.x + element.width <= area.x + area.width && element.y + element.height <= area.y + area.height)).toBe(true);
  });

  it("reconciles existing plan membership with current catalog category assignments before fitting", () => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    const sourceSection = plan.sections.find((section) => section.categoryId === "site-access-emergency");
    const movedItem = sourceSection?.items[0];
    expect(movedItem).toBeDefined();
    movedItem!.customTitle = { de: "Planspezifischer Titel" };
    const blocks = database.blocks.map((block) => block.id === movedItem!.blockId
      ? { ...block, primaryCategoryId: "earthworks" }
      : block);

    const sections = reconcilePlanSectionsWithCatalog(plan.sections, database.categories, blocks);
    const targetSection = sections.find((section) => section.categoryId === "earthworks");
    const reconciledItem = targetSection?.items.find((item) => item.id === movedItem!.id);
    expect(reconciledItem?.customTitle?.de).toBe("Planspezifischer Titel");
    expect(sections.find((section) => section.categoryId === "site-access-emergency")?.items.some((item) => item.id === movedItem!.id)).toBe(false);
    expect(sections.every((section) => section.items.length > 0)).toBe(true);

    const fitted = fitBlocksInArea(plan.layout, sections, database.categories, blocks, "best_fit");
    const movedElement = fitted.layout.elements.find(
      (element): element is PlanBlockElement => element.kind === "block" && element.itemId === movedItem!.id,
    );
    expect(movedElement?.sectionId).toBe(targetSection?.id);
  });

  it("keeps user-placed files unchanged while fitting blocks", () => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    const assetBefore = structuredClone(plan.layout.elements.find((element) => element.kind === "image"));
    const result = fitBlocksInArea(plan.layout, plan.sections, database.categories, database.blocks, "best_fit");
    expect(result.layout.elements.find((element) => element.id === assetBefore?.id)).toEqual(assetBefore);
  });

  it("places new non-block content in the free area to the right without resizing it", () => {
    const layout = createSeedDatabase().plans[1].layout;
    const area = getBlockArea(layout);
    const free = findNextFreeNonBlockPosition(layout, 2_500, 1_600);
    expect(free.width).toBe(2_500);
    expect(free.height).toBe(1_600);
    expect(area && free.x >= area.x + area.width).toBe(true);
  });

  it("preserves the inactive dimension when an edge resize reports distorted DOM measurements", () => {
    const layout = createSeedDatabase().plans[0].layout;
    const element = layout.elements.find((candidate) => candidate.kind === "block");
    expect(element).toBeDefined();
    const horizontallyResized = resizeElementFromCssMeasurement(element!, layout, {
      width: element!.width * 0.1 + 40,
      height: 9_999,
      translateX: 0,
      translateY: 9_999,
      directionX: 1,
      directionY: 0,
    });
    expect(horizontallyResized.width).toBe(element!.width + 400);
    expect(horizontallyResized.height).toBe(element!.height);
    expect(horizontallyResized.y).toBe(element!.y);

    const verticallyResized = resizeElementFromCssMeasurement(element!, layout, {
      width: 9_999,
      height: element!.height * 0.1 + 30,
      translateX: 9_999,
      translateY: 0,
      directionX: 0,
      directionY: 1,
    });
    expect(verticallyResized.width).toBe(element!.width);
    expect(verticallyResized.height).toBe(element!.height + 300);
    expect(verticallyResized.x).toBe(element!.x);

    const insetElement = { ...element!, x: element!.x + 1_000, y: element!.y + 1_000 };
    const resizedFromNorthWest = resizeElementFromCssMeasurement(insetElement, layout, {
      width: insetElement.width * 0.1 + 40,
      height: insetElement.height * 0.1 + 30,
      translateX: -40,
      translateY: -30,
      directionX: -1,
      directionY: -1,
    });
    expect(resizedFromNorthWest.x).toBe(insetElement.x - 400);
    expect(resizedFromNorthWest.y).toBe(insetElement.y - 300);
    expect(resizedFromNorthWest.width).toBe(insetElement.width + 400);
    expect(resizedFromNorthWest.height).toBe(insetElement.height + 300);
  });

  it.each([0.55, 0.78, 1, 1.1])("round-trips exact physical coordinates at %s zoom", (zoom) => {
    const tenMillimetres = 10 * PLAN_UNITS_PER_MILLIMETRE;
    const pixels = layoutUnitsToCssPixels(tenMillimetres, zoom);
    expect(cssPixelsToLayoutUnits(pixels, zoom)).toBeCloseTo(tenMillimetres, 8);
    expect(layoutUnitsToMillimetres(tenMillimetres)).toBe(10);
  });

  it("keeps a representative 100-element layout bounded and deterministic", () => {
    const source = createSeedDatabase().plans[0].layout;
    const elements = Array.from({ length: 100 }, (_, index) => clampElementToPage({
      ...source.elements.find((candidate) => candidate.kind === "block")!,
      id: `performance-${index}`,
      x: source.safeMargin + (index % 10) * 930,
      y: source.safeMargin + Math.floor(index / 10) * 680,
    }, source));
    expect(elements).toHaveLength(100);
    expect(elements.every((element) => element.x >= source.safeMargin && element.y >= source.safeMargin)).toBe(true);
    expect(elements.every((element) => element.x + element.width <= source.width - source.safeMargin)).toBe(true);
    expect(elements.every((element) => element.y + element.height <= source.height - source.safeMargin)).toBe(true);
  });
});
