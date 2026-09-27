import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const PREVIEW_WIDTH = 1_200;

export async function inspectPdf(file: Blob): Promise<{ previewDataUrl: string; pageCount: number }> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await loadingTask.promise;
  try {
    const page = await document.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PREVIEW_WIDTH / baseViewport.width });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return { previewDataUrl: canvas.toDataURL("image/png"), pageCount: document.numPages };
  } finally {
    await loadingTask.destroy();
  }
}

/** Renders one selected page at print-oriented resolution for the editor and A0 export. */
export async function renderPdfPage(file: Blob, pageNumber: number): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
  GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await loadingTask.promise;
  try {
    const safePageNumber = Math.min(Math.max(1, pageNumber), document.numPages);
    const page = await document.getPage(safePageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: PREVIEW_WIDTH / baseViewport.width });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return canvas.toDataURL("image/png");
  } finally { await loadingTask.destroy(); }
}

export async function renderFirstPdfPage(file: Blob): Promise<string> {
  return (await inspectPdf(file)).previewDataUrl;
}
