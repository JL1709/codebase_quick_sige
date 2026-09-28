import { describe, expect, it } from "vitest";
import { createLayoutFromSections } from "./planLayout";
import { annotationBoundsFromDrag, createAnnotationElement, isMeaningfulAnnotationDrag } from "./planAnnotations";

describe("plan annotations", () => {
  it("does not treat an initial connector press as a drawing gesture", () => {
    expect(isMeaningfulAnnotationDrag({ x: 1_000, y: 1_000 }, { x: 1_000, y: 1_000 })).toBe(false);
    expect(isMeaningfulAnnotationDrag({ x: 1_000, y: 1_000 }, { x: 1_080, y: 1_000 })).toBe(true);
  });

  it("uses a practical default size for a click insertion", () => {
    const bounds = annotationBoundsFromDrag("text", { x: 400, y: 600 }, { x: 420, y: 620 }, 20);
    expect(bounds).toEqual({ x: 400, y: 600, width: 2_300, height: 520 });
  });

  it("normalizes drag direction and enforces tool minimum dimensions", () => {
    const bounds = annotationBoundsFromDrag("rectangle", { x: 3_000, y: 2_000 }, { x: 1_000, y: 500 }, 20);
    expect(bounds).toEqual({ x: 1_000, y: 500, width: 2_000, height: 1_500 });
  });

  it("preserves diagonal connector direction in both drawing directions", () => {
    const downRight = annotationBoundsFromDrag("line", { x: 1_000, y: 500 }, { x: 3_000, y: 2_000 }, 20);
    expect(downRight).toEqual({
      x: 1_000,
      y: 500,
      width: 2_000,
      height: 1_500,
      connectorStart: { x: 0, y: 0 },
      connectorEnd: { x: 1, y: 1 },
    });

    const downLeft = annotationBoundsFromDrag("arrow", { x: 3_000, y: 500 }, { x: 1_000, y: 2_000 }, 20);
    expect(downLeft.connectorStart).toEqual({ x: 1, y: 0 });
    expect(downLeft.connectorEnd).toEqual({ x: 0, y: 1 });
  });

  it("centers a vertical connector inside its selectable hit area", () => {
    const bounds = annotationBoundsFromDrag("arrow", { x: 2_000, y: 1_000 }, { x: 2_000, y: 3_000 }, 20);
    expect(bounds).toEqual({
      x: 1_940,
      y: 1_000,
      width: 120,
      height: 2_000,
      connectorStart: { x: 0.5, y: 0 },
      connectorEnd: { x: 0.5, y: 1 },
    });
  });

  it("creates styled annotations within the physical page", () => {
    const layout = createLayoutFromSections([]);
    const element = createAnnotationElement("callout", "callout-1", layout, { x: 11_000, y: 8_000, width: 2_000, height: 900 });
    expect(element.kind).toBe("shape");
    expect(element.x + element.width).toBeLessThanOrEqual(layout.width - layout.safeMargin);
    expect(element.y + element.height).toBeLessThanOrEqual(layout.height - layout.safeMargin);
    expect(element.fillColor).toBe("#fff4b8");
  });

  it("stores connector endpoints on the created plan element", () => {
    const layout = createLayoutFromSections([]);
    const bounds = annotationBoundsFromDrag("arrow", { x: 3_000, y: 2_000 }, { x: 1_000, y: 4_000 }, layout.gridSize);
    const element = createAnnotationElement("arrow", "arrow-1", layout, bounds);
    expect(element.kind).toBe("shape");
    if (element.kind !== "shape") throw new Error("Expected a shape annotation");
    expect(element.connectorStart).toEqual({ x: 1, y: 0 });
    expect(element.connectorEnd).toEqual({ x: 0, y: 1 });
  });

  it("limits oversized drag bounds to the printable page", () => {
    const layout = createLayoutFromSections([]);
    const element = createAnnotationElement("rectangle", "rectangle-1", layout, { x: 0, y: 0, width: layout.width, height: layout.height });
    expect(element.width).toBe(layout.width - layout.safeMargin * 2);
    expect(element.height).toBe(layout.height - layout.safeMargin * 2);
    expect(element.x).toBe(layout.safeMargin);
    expect(element.y).toBe(layout.safeMargin);
  });
});
