import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import type { Plan, PlanAssetElement, PlanBlockElement } from "./types";
import {
  A0_LANDSCAPE_HEIGHT, A0_LANDSCAPE_WIDTH, clampElementToPage, createSectionElement,
  cssPixelsToLayoutUnits, ensurePlanLayout, findNextFreeBlockPosition, findNextFreeNonBlockPosition,
  fitBlocksInArea, getBlockArea, getUsableCanvasBounds, layoutUnitsToCssPixels, layoutUnitsToMillimetres, PLAN_UNITS_PER_MILLIMETRE,
  reconcilePlanSectionsWithCatalog, resizeElementFromCssMeasurement, snapToGrid,
  calculateBlockPresentationMetrics, calculateSectionPresentationMetrics,
} from "./planLayout";

describe("physical A0 layout", () => {
  it("uses exact landscape A0 dimensions in tenths of a millimetre", () => {
    expect(A0_LANDSCAPE_WIDTH / PLAN_UNITS_PER_MILLIMETRE).toBe(1_189);
    expect(A0_LANDSCAPE_HEIGHT / PLAN_UNITS_PER_MILLIMETRE).toBe(841);
  });

  it("treats all four configured margins as hard placement boundaries", () => {
    const source = createSeedDatabase().plans[0].layout;
    const layout = { ...source, margins: { top: 300, right: 400, bottom: 500, left: 600 } };
    const usableArea = getUsableCanvasBounds(layout);
    const element = source.elements.find((candidate) => candidate.kind === "block")!;
    const clamped = clampElementToPage({ ...element, x: -10_000, y: -10_000, width: source.width, height: source.height }, layout);

    expect(usableArea).toEqual({ x: 600, y: 300, right: source.width - 400, bottom: source.height - 500, width: source.width - 1_000, height: source.height - 800 });
    expect(clamped.x).toBe(usableArea.x);
    expect(clamped.y).toBe(usableArea.y);
    expect(clamped.width).toBe(usableArea.width);
    expect(clamped.height).toBe(usableArea.height);
  });

  it("snaps and clamps freely positioned elements inside the usable area", () => {
    const layout = createSeedDatabase().plans[0].layout;
    const usableArea = getUsableCanvasBounds(layout);
    const element = layout.elements.find((candidate) => candidate.kind === "block");
    expect(element).toBeDefined();
    const clamped = clampElementToPage({ ...element!, x: -100, y: 99_000 }, layout);
    expect(clamped.x).toBe(usableArea.x);
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(usableArea.bottom);
    expect(clamped.x).toBe(snapToGrid(clamped.x));
  });

  it("creates a labelled section when a block introduces a new category", () => {
    const layout = createSeedDatabase().plans[0].layout;
    const free = findNextFreeBlockPosition(layout);
    const section = createSectionElement("new-section", layout, free.y);
    const usableArea = getUsableCanvasBounds(layout);
    expect(section.kind).toBe("section");
    expect(section.locked).toBe(false);
    expect(section.y).toBeGreaterThanOrEqual(usableArea.y);
    expect(section.y + section.height).toBeLessThanOrEqual(usableArea.bottom);
  });

  it("creates a selectable block area without forcing a plan header", () => {
    const layout = createSeedDatabase().plans[0].layout;
    expect(layout.layoutVersion).toBe(5);
    expect(layout.margins).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(layout.paperRaster).toBe("none");
    expect(layout.elements.find((element) => element.kind === "block_area")?.locked).toBe(false);
    expect(layout.elements.some((element) => element.kind === "header")).toBe(false);
    expect(layout.elements.some((element) => element.kind === "title_block")).toBe(false);
  });

  it("migrates a legacy layout without changing or recreating existing content", () => {
    const plan = structuredClone(createSeedDatabase().plans[0]);
    const before = plan.layout.elements.filter((element) => element.kind !== "block_area");
    const legacyHeader = { id: "legacy-header", kind: "header" as const, x: 180, y: 180, width: 11_530, height: 520, zIndex: 900 };
    const legacyPlan = { ...plan, layout: { ...plan.layout, layoutVersion: 3, safeMargin: 180, elements: [legacyHeader, ...before] } };
    const migrated = ensurePlanLayout(legacyPlan as unknown as Plan);
    expect(migrated.layout.layoutVersion).toBe(5);
    expect(migrated.layout.margins).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(migrated.layout).not.toHaveProperty("safeMargin");
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

  it("uses the selected mode for blocks and the opposite axis for category siblings", () => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    const sections = reconcilePlanSectionsWithCatalog(plan.sections, database.categories, database.blocks);
    const sectionByCategoryId = new Map(sections.map((section) => [section.categoryId, section.id]));
    const fittedByMode = new Map((["vertical", "horizontal"] as const).map((mode) => [
      mode,
      fitBlocksInArea(plan.layout, sections, database.categories, database.blocks, mode),
    ]));
    const findSectionElement = (mode: "vertical" | "horizontal", categoryId: string) => {
      return fittedByMode.get(mode)!.layout.elements.find(
        (element) => element.kind === "section" && element.sectionId === sectionByCategoryId.get(categoryId),
      );
    };
    const findBlockElement = (mode: "vertical" | "horizontal", blockId: string) => (
      fittedByMode.get(mode)!.layout.elements.find((element) => element.kind === "block" && element.blockId === blockId)
    );
    const verticalSiteSetup = findSectionElement("vertical", "site-setup");
    const verticalEarthworks = findSectionElement("vertical", "earthworks");
    const verticalSecurity = findSectionElement("vertical", "imported-site-security");
    const verticalAccess = findSectionElement("vertical", "site-access-emergency");
    const verticalFallProtection = findBlockElement("vertical", "block-fall-protection");
    const verticalScaffolding = findBlockElement("vertical", "block-scaffolding");
    const horizontalSiteSetup = findSectionElement("horizontal", "site-setup");
    const horizontalEarthworks = findSectionElement("horizontal", "earthworks");
    const horizontalSecurity = findSectionElement("horizontal", "imported-site-security");
    const horizontalAccess = findSectionElement("horizontal", "site-access-emergency");
    const horizontalFallProtection = findBlockElement("horizontal", "block-fall-protection");
    const horizontalScaffolding = findBlockElement("horizontal", "block-scaffolding");

    expect(verticalEarthworks!.x).not.toBe(verticalSiteSetup!.x);
    expect(verticalEarthworks!.y).toBe(verticalSiteSetup!.y);
    expect(verticalAccess!.x).not.toBe(verticalSecurity!.x);
    expect(verticalAccess!.y).toBe(verticalSecurity!.y);
    expect(verticalScaffolding!.x).toBe(verticalFallProtection!.x);
    expect(verticalScaffolding!.y).not.toBe(verticalFallProtection!.y);

    expect(horizontalEarthworks!.x).toBe(horizontalSiteSetup!.x);
    expect(horizontalEarthworks!.y).not.toBe(horizontalSiteSetup!.y);
    expect(horizontalAccess!.x).toBe(horizontalSecurity!.x);
    expect(horizontalAccess!.y).not.toBe(horizontalSecurity!.y);
    expect(horizontalScaffolding!.x).not.toBe(horizontalFallProtection!.x);
    expect(horizontalScaffolding!.y).toBe(horizontalFallProtection!.y);
  });

  it.each([
    ["vertical", "width"],
    ["horizontal", "height"],
  ] as const)("scales the %s composition to use the available %s", (mode, axis) => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    const sections = reconcilePlanSectionsWithCatalog(plan.sections, database.categories, database.blocks);
    const fitted = fitBlocksInArea(plan.layout, sections, database.categories, database.blocks, mode);
    const area = getBlockArea(fitted.layout);
    const rootCategoryIds = new Set(database.categories.filter((category) => !category.parentId).map((category) => category.id));
    const rootSectionIds = new Set(sections.filter((section) => rootCategoryIds.has(section.categoryId)).map((section) => section.id));
    const rootElements = fitted.layout.elements.filter(
      (element) => element.kind === "section" && rootSectionIds.has(element.sectionId),
    );
    const occupiedWidth = Math.max(...rootElements.map((element) => element.x + element.width))
      - Math.min(...rootElements.map((element) => element.x));
    const occupiedHeight = Math.max(...rootElements.map((element) => element.y + element.height))
      - Math.min(...rootElements.map((element) => element.y));
    const utilization = axis === "width"
      ? occupiedWidth / area!.width
      : occupiedHeight / area!.height;

    expect(fitted.fits).toBe(true);
    expect(utilization).toBeGreaterThan(0.9);
  });

  it("scales typography below the geometric scale until long content fits", () => {
    const database = createSeedDatabase();
    const element = database.plans[0].layout.elements.find((candidate) => candidate.kind === "block");
    expect(element?.kind).toBe("block");
    if (!element || element.kind !== "block") return;
    const metrics = calculateBlockPresentationMetrics(
      element,
      "A heading that wraps cleanly",
      "A deliberately longer description that needs several lines but must remain above the regulations footer without clipping or overlap.",
      "DGUV Vorschrift 38 · ASR A1.8",
    );

    expect(metrics.fits).toBe(true);
    expect(metrics.contentScale).toBeLessThanOrEqual(metrics.layoutScale);
    expect(metrics.contentScale).toBeGreaterThan(0);
  });

  it("scales long category headings within their fitted header", () => {
    const database = createSeedDatabase();
    const element = database.plans[0].layout.elements.find((candidate) => candidate.kind === "section");
    expect(element?.kind).toBe("section");
    if (!element || element.kind !== "section") return;
    const metrics = calculateSectionPresentationMetrics(
      element,
      "Access and emergency organization with an intentionally extended qualification",
    );

    expect(metrics.fits).toBe(true);
    expect(metrics.contentScale).toBeLessThanOrEqual(metrics.layoutScale);
    expect(metrics.contentScale).toBeGreaterThan(0);
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
    expect(sections.find((section) => section.categoryId === "site-setup")?.items).toEqual([]);

    const fitted = fitBlocksInArea(plan.layout, sections, database.categories, blocks, "best_fit");
    const movedElement = fitted.layout.elements.find(
      (element): element is PlanBlockElement => element.kind === "block" && element.itemId === movedItem!.id,
    );
    expect(movedElement?.sectionId).toBe(targetSection?.id);
  });

  it("fits every catalog ancestor as a containing section around its descendants", () => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    const sections = reconcilePlanSectionsWithCatalog(plan.sections, database.categories, database.blocks);
    const fitted = fitBlocksInArea(plan.layout, sections, database.categories, database.blocks, "best_fit");
    const sectionElementByCategoryId = new Map(sections.map((section) => [
      section.categoryId,
      fitted.layout.elements.find((element) => element.kind === "section" && element.sectionId === section.id),
    ]));
    const rootElement = sectionElementByCategoryId.get("site-setup");
    const accessElement = sectionElementByCategoryId.get("site-access-emergency");
    const accessSection = sections.find((section) => section.categoryId === "site-access-emergency");
    const accessBlockElement = fitted.layout.elements.find(
      (element) => element.kind === "block" && accessSection?.items.some((item) => item.id === element.itemId),
    );

    expect(fitted.fits).toBe(true);
    expect(rootElement).toBeDefined();
    expect(accessElement).toBeDefined();
    expect(accessBlockElement).toBeDefined();
    expect(accessElement!.x).toBeGreaterThan(rootElement!.x);
    expect(accessElement!.y).toBeGreaterThan(rootElement!.y);
    expect(accessElement!.x + accessElement!.width).toBeLessThan(rootElement!.x + rootElement!.width);
    expect(accessElement!.y + accessElement!.height).toBeLessThan(rootElement!.y + rootElement!.height);
    expect(accessBlockElement!.x).toBeGreaterThan(accessElement!.x);
    expect(accessBlockElement!.y).toBeGreaterThan(accessElement!.y);
    expect(accessBlockElement!.x + accessBlockElement!.width).toBeLessThan(accessElement!.x + accessElement!.width);
    expect(accessBlockElement!.y + accessBlockElement!.height).toBeLessThan(accessElement!.y + accessElement!.height);
  });

  it("keeps user-placed files unchanged while fitting blocks", () => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    const assetBefore: PlanAssetElement = {
      id: "user-placed-image",
      kind: "image",
      assetId: "user-upload",
      x: 8_500,
      y: 1_200,
      width: 2_000,
      height: 1_500,
      zIndex: 700,
    };
    plan.layout.elements.push(assetBefore);
    const result = fitBlocksInArea(plan.layout, plan.sections, database.categories, database.blocks, "best_fit");
    expect(result.layout.elements.find((element) => element.id === assetBefore.id)).toEqual(assetBefore);
  });

  it("places new non-block content in the free area to the right without resizing it", () => {
    const sourceLayout = createSeedDatabase().plans[0].layout;
    const layout = {
      ...sourceLayout,
      elements: sourceLayout.elements.filter((element) => element.kind !== "image" && element.kind !== "pdf_page"),
    };
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
    const usableArea = getUsableCanvasBounds(source);
    const elements = Array.from({ length: 100 }, (_, index) => clampElementToPage({
      ...source.elements.find((candidate) => candidate.kind === "block")!,
      id: `performance-${index}`,
      x: usableArea.x + (index % 10) * 930,
      y: usableArea.y + Math.floor(index / 10) * 680,
    }, source));
    expect(elements).toHaveLength(100);
    expect(elements.every((element) => element.x >= usableArea.x && element.y >= usableArea.y)).toBe(true);
    expect(elements.every((element) => element.x + element.width <= usableArea.right)).toBe(true);
    expect(elements.every((element) => element.y + element.height <= usableArea.bottom)).toBe(true);
  });
});
