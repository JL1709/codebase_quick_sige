import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFPageProxy } from "pdfjs-dist";
import type { PdfPageMetadata } from "../domain/types";

const DEFAULT_PREVIEW_WIDTH = 1_200;

export interface PdfInspection {
  previewDataUrl: string;
  pageCount: number;
  pages: PdfPageMetadata[];
}

export interface RenderedPdfPage extends PdfPageMetadata {
  dataUrl: string;
}

export interface PdfPageRenderRequest {
  pageNumber: number;
  targetWidth?: number;
}

async function loadPdf(file: Blob) {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  return { loadingTask, document: await loadingTask.promise };
}

async function renderLoadedPage(page: PDFPageProxy, targetWidth: number): Promise<RenderedPdfPage> {
  const baseViewport = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: targetWidth / baseViewport.width });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvas, viewport }).promise;
  return {
    pageNumber: page.pageNumber,
    width: baseViewport.width,
    height: baseViewport.height,
    dataUrl: canvas.toDataURL("image/png"),
  };
}

export async function inspectPdf(file: Blob): Promise<PdfInspection> {
  const { loadingTask, document } = await loadPdf(file);
  try {
    const pages: PdfPageMetadata[] = [];
    let previewDataUrl = "";
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      pages.push({ pageNumber, width: viewport.width, height: viewport.height });
      if (pageNumber === 1) previewDataUrl = (await renderLoadedPage(page, DEFAULT_PREVIEW_WIDTH)).dataUrl;
      page.cleanup();
    }
    return { previewDataUrl, pageCount: document.numPages, pages };
  } finally {
    await loadingTask.destroy();
  }
}

/** Renders one source PDF page without changing its aspect ratio. */
export async function renderPdfPageWithMetadata(
  file: Blob,
  pageNumber: number,
  targetWidth = DEFAULT_PREVIEW_WIDTH,
): Promise<RenderedPdfPage> {
  return (await renderPdfPagesWithMetadata(file, [{ pageNumber, targetWidth }]))[0];
}

/** Loads a source PDF once and renders requested pages sequentially to keep peak memory predictable. */
export async function renderPdfPagesWithMetadata(
  file: Blob,
  requests: PdfPageRenderRequest[],
): Promise<RenderedPdfPage[]> {
  const { loadingTask, document } = await loadPdf(file);
  try {
    const renderedPages: RenderedPdfPage[] = [];
    for (const request of requests) {
      const safePageNumber = Math.min(Math.max(1, request.pageNumber), document.numPages);
      const page = await document.getPage(safePageNumber);
      renderedPages.push(await renderLoadedPage(page, request.targetWidth ?? DEFAULT_PREVIEW_WIDTH));
      page.cleanup();
    }
    return renderedPages;
  } finally {
    await loadingTask.destroy();
  }
}

export async function renderPdfPage(file: Blob, pageNumber: number, targetWidth = DEFAULT_PREVIEW_WIDTH): Promise<string> {
  return (await renderPdfPageWithMetadata(file, pageNumber, targetWidth)).dataUrl;
}

export async function renderFirstPdfPage(file: Blob): Promise<string> {
  return (await inspectPdf(file)).previewDataUrl;
}
