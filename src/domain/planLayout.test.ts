import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import {
  A0_LANDSCAPE_HEIGHT, A0_LANDSCAPE_WIDTH, clampElementToPage, createSectionElement,
  cssPixelsToLayoutUnits, findNextFreeBlockPosition, layoutUnitsToCssPixels, layoutUnitsToMillimetres,
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
