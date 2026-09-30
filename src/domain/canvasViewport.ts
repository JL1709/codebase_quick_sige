export const MIN_CANVAS_ZOOM = 0.1;
export const MAX_CANVAS_ZOOM = 8;
export const CANVAS_ZOOM_FACTOR = 1.15;
export const CANVAS_FIT_GUTTER = 48;
const WHEEL_PIXELS_PER_ZOOM_STEP = 100;
const WHEEL_ZOOM_SENSITIVITY = Math.log(CANVAS_ZOOM_FACTOR) / WHEEL_PIXELS_PER_ZOOM_STEP;
const WHEEL_LINE_HEIGHT = 16;
const MAX_WHEEL_ZOOM_DELTA = 600;
const WHEEL_DELTA_MODE_LINE = 1;
const WHEEL_DELTA_MODE_PAGE = 2;

export interface CanvasPoint { x: number; y: number }

export interface CanvasViewport {
  zoom: number;
  x: number;
  y: number;
  mode: "fit" | "manual";
}

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

export function fitCanvasViewport(viewportWidth: number, viewportHeight: number, pageWidth: number, pageHeight: number): CanvasViewport {
  const zoom = calculateFitZoom(viewportWidth, viewportHeight, pageWidth, pageHeight);
  return {
    zoom,
    x: (viewportWidth - pageWidth * zoom) / 2,
    y: (viewportHeight - pageHeight * zoom) / 2,
    mode: "fit",
  };
}

export function zoomCanvasAtPoint(viewport: CanvasViewport, requestedZoom: number, pointer: CanvasPoint): CanvasViewport {
  const zoom = clampCanvasZoom(requestedZoom);
  const scale = zoom / viewport.zoom;
  return {
    zoom,
    x: pointer.x - (pointer.x - viewport.x) * scale,
    y: pointer.y - (pointer.y - viewport.y) * scale,
    mode: "manual",
  };
}

export function normalizeWheelDelta(delta: number, deltaMode: number, viewportSize: number): number {
  if (deltaMode === WHEEL_DELTA_MODE_LINE) return delta * WHEEL_LINE_HEIGHT;
  if (deltaMode === WHEEL_DELTA_MODE_PAGE) return delta * viewportSize;
  return delta;
}

export function wheelCanvasZoom(currentZoom: number, pixelDelta: number): number {
  const boundedDelta = Math.max(-MAX_WHEEL_ZOOM_DELTA, Math.min(MAX_WHEEL_ZOOM_DELTA, pixelDelta));
  return clampCanvasZoom(currentZoom * Math.exp(-boundedDelta * WHEEL_ZOOM_SENSITIVITY));
}
