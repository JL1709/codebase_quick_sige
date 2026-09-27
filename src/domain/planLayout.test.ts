import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import type { Plan } from "./types";
import {
  A0_LANDSCAPE_HEIGHT, A0_LANDSCAPE_WIDTH, clampElementToPage, createSectionElement,
  cssPixelsToLayoutUnits, ensurePlanLayout, findNextFreeBlockPosition, layoutUnitsToCssPixels, layoutUnitsToMillimetres,
  PLAN_UNITS_PER_MILLIMETRE, snapToGrid,
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

  it("creates selectable structural header and title-block elements", () => {
    const layout = createSeedDatabase().plans[0].layout;
    expect(layout.layoutVersion).toBe(3);
    expect(layout.elements.find((element) => element.kind === "header")?.locked).toBe(false);
    expect(layout.elements.find((element) => element.kind === "title_block")?.locked).toBe(false);
  });

  it("migrates a version-two layout without changing existing element geometry", () => {
    const plan = structuredClone(createSeedDatabase().plans[0]);
    const before = plan.layout.elements.filter((element) => element.kind !== "header");
    const legacyPlan = { ...plan, layout: { ...plan.layout, layoutVersion: 2, elements: before } };
    const migrated = ensurePlanLayout(legacyPlan as unknown as Plan);
    expect(migrated.layout.layoutVersion).toBe(3);
    expect(migrated.layout.elements[0].kind).toBe("header");
    expect(migrated.layout.elements.filter((element) => element.kind !== "header").map(({ x, y, width, height }) => ({ x, y, width, height })))
      .toEqual(before.map(({ x, y, width, height }) => ({ x, y, width, height })));
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
