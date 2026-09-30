import { describe, expect, it } from "vitest";
import { calculateFitZoom, fitCanvasViewport, MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM, normalizeWheelDelta, stepCanvasZoom, wheelCanvasZoom, zoomCanvasAtPoint, type CanvasViewport } from "./canvasViewport";

describe("canvas viewport", () => {
  it("fits every page edge inside the available viewport and gutter", () => {
    const zoom = calculateFitZoom(1_440, 820, 1_189, 841, 48);
    expect(1_189 * zoom).toBeLessThanOrEqual(1_440 - 96);
    expect(841 * zoom).toBeLessThanOrEqual(820 - 96);
  });

  it("supports detailed zoom across the complete 10–800% range", () => {
    let zoom = MIN_CANVAS_ZOOM;
    for (let index = 0; index < 100; index += 1) zoom = stepCanvasZoom(zoom, "in");
    expect(zoom).toBe(MAX_CANVAS_ZOOM);
    for (let index = 0; index < 100; index += 1) zoom = stepCanvasZoom(zoom, "out");
    expect(zoom).toBe(MIN_CANVAS_ZOOM);
  });

  it("centers a fitted page on both axes", () => {
    const viewport = fitCanvasViewport(1_440, 820, 1_189, 841);
    expect(viewport.x * 2 + 1_189 * viewport.zoom).toBeCloseTo(1_440);
    expect(viewport.y * 2 + 841 * viewport.zoom).toBeCloseTo(820);
    expect(viewport.mode).toBe("fit");
  });

  it.each([0.01, 0.2, 0.8, 2, 8, 12])("keeps the document point under an off-center pointer fixed when requesting zoom %s", (requestedZoom) => {
    const current = { zoom: 0.7, x: 48, y: 112, mode: "fit" as const };
    const pointer = { x: 220, y: 380 };
    const point = { x: (pointer.x - current.x) / current.zoom, y: (pointer.y - current.y) / current.zoom };
    const next = zoomCanvasAtPoint(current, requestedZoom, pointer);
    expect(next.x + point.x * next.zoom).toBeCloseTo(pointer.x);
    expect(next.y + point.y * next.zoom).toBeCloseTo(pointer.y);
    expect(next.zoom).toBeGreaterThanOrEqual(MIN_CANVAS_ZOOM);
    expect(next.zoom).toBeLessThanOrEqual(MAX_CANVAS_ZOOM);
  });

  it("keeps the pointer fixed through repeated gestures on a panned canvas", () => {
    let viewport: CanvasViewport = { zoom: 2, x: -720, y: -400, mode: "manual" };
    const pointer = { x: 810, y: 570 };
    const point = { x: (pointer.x - viewport.x) / viewport.zoom, y: (pointer.y - viewport.y) / viewport.zoom };
    for (const delta of [-50, -1, -150, 300, 80, -300]) viewport = zoomCanvasAtPoint(viewport, wheelCanvasZoom(viewport.zoom, delta), pointer);
    expect(viewport.x + point.x * viewport.zoom).toBeCloseTo(pointer.x);
    expect(viewport.y + point.y * viewport.zoom).toBeCloseTo(pointer.y);
  });

  it("makes small wheel and pinch movements proportional and reversible", () => {
    let zoom = 1;
    for (let index = 0; index < 8; index += 1) zoom = wheelCanvasZoom(zoom, -1);
    expect(zoom).toBeGreaterThan(1);
    expect(zoom).toBeLessThan(1.02);
    expect(zoom).toBeCloseTo(wheelCanvasZoom(1, -8));
    expect(wheelCanvasZoom(zoom, 8)).toBeCloseTo(1);
    expect(wheelCanvasZoom(1, 0)).toBe(1);
  });

  it("normalizes pixel, line and page wheel units", () => {
    expect(normalizeWheelDelta(16, 0, 800)).toBe(16);
    expect(normalizeWheelDelta(1, 1, 800)).toBe(16);
    expect(normalizeWheelDelta(1, 2, 800)).toBe(800);
  });
});
