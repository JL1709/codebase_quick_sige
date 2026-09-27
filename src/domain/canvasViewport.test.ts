import { describe, expect, it } from "vitest";
import { calculateAnchoredScroll, calculateFitZoom, MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM, stepCanvasZoom } from "./canvasViewport";

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

  it("keeps the plan point below the pointer stable while zooming", () => {
    const next = calculateAnchoredScroll(400, 200, 320, 180, 1, 2);
    expect((next.left + 320) / 2).toBe(400 + 320);
    expect((next.top + 180) / 2).toBe(200 + 180);
  });
});
