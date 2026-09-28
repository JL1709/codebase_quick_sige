import { clampElementToPage, findNextFreeNonBlockPosition, getUsableCanvasBounds, snapToGrid } from "./planLayout";
import type { PlanConnectorPoint, PlanLayout, PlanShapeElement, PlanTextElement } from "./types";

export type AnnotationInsertTool = "text" | "rectangle" | "line" | "arrow" | "callout";

export interface AnnotationPoint {
  x: number;
  y: number;
}

export interface AnnotationBounds extends AnnotationPoint {
  width: number;
  height: number;
  connectorStart?: PlanConnectorPoint;
  connectorEnd?: PlanConnectorPoint;
}

const MINIMUM_DRAW_DISTANCE = 80;
const MINIMUM_CONNECTOR_HIT_AREA = 120;
const DEFAULT_CONNECTOR_START: PlanConnectorPoint = { x: 0, y: 0.5 };
const DEFAULT_CONNECTOR_END: PlanConnectorPoint = { x: 1, y: 0.5 };
const DEFAULT_ANNOTATION_SIZES: Record<AnnotationInsertTool, { width: number; height: number }> = {
  text: { width: 2_300, height: 520 },
  rectangle: { width: 1_800, height: 1_000 },
  line: { width: 1_800, height: 240 },
  arrow: { width: 1_800, height: 240 },
  callout: { width: 2_000, height: 900 },
};

const DEFAULT_TEXT_STYLE = {
  textColor: "#12241f",
  fontSize: 9,
  fontWeight: "normal" as const,
  textAlign: "left" as const,
  opacity: 1,
};

export function isMeaningfulAnnotationDrag(start: AnnotationPoint, end: AnnotationPoint): boolean {
  return Math.abs(end.x - start.x) >= MINIMUM_DRAW_DISTANCE || Math.abs(end.y - start.y) >= MINIMUM_DRAW_DISTANCE;
}

export function annotationDefaultSize(tool: AnnotationInsertTool): { width: number; height: number } {
  return DEFAULT_ANNOTATION_SIZES[tool];
}

export function annotationBoundsFromDrag(
  tool: AnnotationInsertTool,
  start: AnnotationPoint,
  end: AnnotationPoint,
  gridSize: number,
): AnnotationBounds {
  const defaultSize = annotationDefaultSize(tool);
  const horizontalDistance = Math.abs(end.x - start.x);
  const verticalDistance = Math.abs(end.y - start.y);
  if (!isMeaningfulAnnotationDrag(start, end)) {
    return {
      x: snapToGrid(start.x, gridSize),
      y: snapToGrid(start.y, gridSize),
      ...defaultSize,
    };
  }
  if (tool === "line" || tool === "arrow") {
    const snappedStart = { x: snapToGrid(start.x, gridSize), y: snapToGrid(start.y, gridSize) };
    const snappedEnd = { x: snapToGrid(end.x, gridSize), y: snapToGrid(end.y, gridSize) };
    const connectorWidth = Math.max(MINIMUM_CONNECTOR_HIT_AREA, Math.abs(snappedEnd.x - snappedStart.x));
    const connectorHeight = Math.max(MINIMUM_CONNECTOR_HIT_AREA, Math.abs(snappedEnd.y - snappedStart.y));
    const connectorX = snapToGrid((snappedStart.x + snappedEnd.x - connectorWidth) / 2, gridSize);
    const connectorY = snapToGrid((snappedStart.y + snappedEnd.y - connectorHeight) / 2, gridSize);
    return {
      x: connectorX,
      y: connectorY,
      width: connectorWidth,
      height: connectorHeight,
      connectorStart: {
        x: (snappedStart.x - connectorX) / connectorWidth,
        y: (snappedStart.y - connectorY) / connectorHeight,
      },
      connectorEnd: {
        x: (snappedEnd.x - connectorX) / connectorWidth,
        y: (snappedEnd.y - connectorY) / connectorHeight,
      },
    };
  }
  return {
    x: snapToGrid(Math.min(start.x, end.x), gridSize),
    y: snapToGrid(Math.min(start.y, end.y), gridSize),
    width: Math.max(defaultSize.width, snapToGrid(horizontalDistance, gridSize)),
    height: Math.max(defaultSize.height, snapToGrid(verticalDistance, gridSize)),
  };
}

export function createAnnotationElement(
  tool: AnnotationInsertTool,
  id: string,
  layout: PlanLayout,
  requestedBounds?: AnnotationBounds,
): PlanTextElement | PlanShapeElement {
  const defaultSize = annotationDefaultSize(tool);
  const freePosition = findNextFreeNonBlockPosition(layout, defaultSize.width, defaultSize.height);
  const requestedGeometry = requestedBounds ?? { x: freePosition.x, y: freePosition.y, ...defaultSize };
  const { connectorStart, connectorEnd } = requestedGeometry;
  const usableArea = getUsableCanvasBounds(layout);
  const geometry = {
    x: requestedGeometry.x,
    y: requestedGeometry.y,
    width: Math.min(requestedGeometry.width, usableArea.width),
    height: Math.min(requestedGeometry.height, usableArea.height),
  };
  const base = {
    id,
    ...geometry,
    zIndex: Math.max(700, ...layout.elements.map((element) => element.zIndex)) + 1,
    semanticOrder: Math.max(0, ...layout.elements.map((element) => element.semanticOrder ?? 0)) + 1,
    locked: false,
  };

  if (tool === "text") {
    return clampElementToPage({
      ...base,
      kind: "text",
      text: { de: "Text eingeben", en: "Enter text" },
      ...DEFAULT_TEXT_STYLE,
    }, layout) as PlanTextElement;
  }

  const isConnector = tool === "line" || tool === "arrow";
  return clampElementToPage({
    ...base,
    kind: "shape",
    shape: tool,
    fillColor: isConnector ? undefined : "#fff4b8",
    strokeColor: isConnector ? "#296c5d" : "#9a6d12",
    strokeWidth: isConnector ? 2 : 1,
    connectorStart: isConnector ? connectorStart ?? DEFAULT_CONNECTOR_START : undefined,
    connectorEnd: isConnector ? connectorEnd ?? DEFAULT_CONNECTOR_END : undefined,
    text: tool === "callout" ? { de: "Hinweis", en: "Note" } : undefined,
    ...DEFAULT_TEXT_STYLE,
  }, layout) as PlanShapeElement;
}
