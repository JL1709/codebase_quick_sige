export const MIN_CANVAS_ZOOM = 0.1;
export const MAX_CANVAS_ZOOM = 8;
export const CANVAS_ZOOM_FACTOR = 1.15;
export const CANVAS_FIT_GUTTER = 48;

export function clampCanvasZoom(zoom: number): number {
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, zoom));
}

export function calculateFitZoom(viewportWidth: number, viewportHeight: number, pageWidth: number, pageHeight: number, gutter = CANVAS_FIT_GUTTER): number {
  const availableWidth = Math.max(1, viewportWidth - gutter * 2);
  const availableHeight = Math.max(1, viewportHeight - gutter * 2);
  return clampCanvasZoom(Math.min(availableWidth / pageWidth, availableHeight / pageHeight));
}

export function stepCanvasZoom(currentZoom: number, direction: "in" | "out"): number {
  const multiplier = direction === "in" ? CANVAS_ZOOM_FACTOR : 1 / CANVAS_ZOOM_FACTOR;
  return clampCanvasZoom(currentZoom * multiplier);
}

export function calculateAnchoredScroll(
  scrollLeft: number,
  scrollTop: number,
  pointerX: number,
  pointerY: number,
  previousZoom: number,
  nextZoom: number,
): { left: number; top: number } {
  const scale = nextZoom / previousZoom;
  return {
    left: (scrollLeft + pointerX) * scale - pointerX,
    top: (scrollTop + pointerY) * scale - pointerY,
  };
}
