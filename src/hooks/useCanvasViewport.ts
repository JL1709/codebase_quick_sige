import { useCallback, useLayoutEffect, useState, type RefObject } from "react";
import { fitCanvasViewport, normalizeWheelDelta, wheelCanvasZoom, zoomCanvasAtPoint, type CanvasPoint, type CanvasViewport } from "../domain/canvasViewport";

export function useCanvasViewport(viewportRef: RefObject<HTMLElement | null>, pageWidth: number, pageHeight: number, enabled: boolean) {
  const [viewport, setViewport] = useState<CanvasViewport>({ zoom: 1, x: 0, y: 0, mode: "fit" });

  const fitPlan = useCallback(() => {
    const shell = viewportRef.current;
    if (shell) setViewport(fitCanvasViewport(shell.clientWidth, shell.clientHeight, pageWidth, pageHeight));
  }, [pageHeight, pageWidth, viewportRef]);

  const setZoomAroundPoint = useCallback((nextZoom: number | ((currentZoom: number) => number), pointerX?: number, pointerY?: number) => {
    const shell = viewportRef.current;
    if (!shell) return;
    const pointer = { x: pointerX ?? shell.clientWidth / 2, y: pointerY ?? shell.clientHeight / 2 };
    setViewport((current) => zoomCanvasAtPoint(current, typeof nextZoom === "function" ? nextZoom(current.zoom) : nextZoom, pointer));
  }, [viewportRef]);

  const focusCanvasPoint = useCallback((point: CanvasPoint, minimumZoom: number) => {
    const shell = viewportRef.current;
    if (!shell) return;
    setViewport((current) => {
      const zoom = Math.max(current.zoom, minimumZoom);
      return { zoom, x: shell.clientWidth / 2 - point.x * zoom, y: shell.clientHeight / 2 - point.y * zoom, mode: "manual" };
    });
  }, [viewportRef]);

  useLayoutEffect(() => {
    const shell = viewportRef.current;
    if (!enabled || !shell) return;
    const resize = () => setViewport((current) => current.mode === "fit"
      ? fitCanvasViewport(shell.clientWidth, shell.clientHeight, pageWidth, pageHeight)
      : current);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(shell);
    return () => observer.disconnect();
  }, [enabled, pageHeight, pageWidth, viewportRef]);

  useLayoutEffect(() => {
    const shell = viewportRef.current;
    if (!enabled || !shell) return;
    const handleWheel = (event: WheelEvent) => {
      if ((event.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']")) return;
      const deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode, shell.clientWidth);
      const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode, shell.clientHeight);
      if (deltaX === 0 && deltaY === 0) return;
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        if (deltaY === 0) return;
        const bounds = shell.getBoundingClientRect();
        const pointer = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
        // Functional updates preserve every gesture even when several events arrive before a React commit.
        setViewport((current) => zoomCanvasAtPoint(current, wheelCanvasZoom(current.zoom, deltaY), pointer));
      } else {
        const horizontalDelta = event.shiftKey && deltaX === 0 ? deltaY : deltaX;
        const verticalDelta = event.shiftKey && deltaX === 0 ? 0 : deltaY;
        setViewport((current) => ({ ...current, x: current.x - horizontalDelta, y: current.y - verticalDelta, mode: "manual" }));
      }
    };
    shell.addEventListener("wheel", handleWheel, { passive: false });
    return () => shell.removeEventListener("wheel", handleWheel);
  }, [enabled, viewportRef]);

  return { viewport, fitPlan, setZoomAroundPoint, focusCanvasPoint };
}
