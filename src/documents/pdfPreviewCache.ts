import type { PdfPageRenderer } from "./pdfPreview";

const MAX_PREVIEW_CACHE_BYTES = 32 * 1024 * 1024;
const MAX_PREVIEW_CACHE_ENTRIES = 80;
const STRING_BYTES_PER_CHARACTER = 2;

interface PendingDocument {
  renderer: Promise<PdfPageRenderer>;
  queue: Promise<void>;
  requestCount: number;
}

/** Cached rasters survive component remounts; workers live only while their pages are being rendered. */
export class PdfPreviewCache {
  private readonly previews = new Map<string, string>();
  private readonly pendingPages = new Map<string, Promise<string>>();
  private readonly pendingDocuments = new Map<string, PendingDocument>();
  private previewBytes = 0;

  constructor(private readonly maxBytes = MAX_PREVIEW_CACHE_BYTES, private readonly maxEntries = MAX_PREVIEW_CACHE_ENTRIES) {}

  private key(source: string, pageNumber: number, width: number): string {
    return JSON.stringify([source, pageNumber, width]);
  }

  get(source: string, pageNumber: number, width: number): string | undefined {
    const key = this.key(source, pageNumber, width);
    const preview = this.previews.get(key);
    if (preview) {
      this.previews.delete(key);
      this.previews.set(key, preview);
    }
    return preview;
  }

  private remember(key: string, preview: string) {
    const bytes = preview.length * STRING_BYTES_PER_CHARACTER;
    if (bytes > this.maxBytes) return;
    this.previews.set(key, preview);
    this.previewBytes += bytes;
    while (this.previewBytes > this.maxBytes || this.previews.size > this.maxEntries) {
      const oldestKey = this.previews.keys().next().value as string;
      const oldestPreview = this.previews.get(oldestKey) as string;
      this.previewBytes -= oldestPreview.length * STRING_BYTES_PER_CHARACTER;
      this.previews.delete(oldestKey);
    }
  }

  render(source: string, pageNumber: number, width: number, loadRenderer: () => Promise<PdfPageRenderer>): Promise<string> {
    const cached = this.get(source, pageNumber, width);
    if (cached) return Promise.resolve(cached);
    const key = this.key(source, pageNumber, width);
    const pending = this.pendingPages.get(key);
    if (pending) return pending;
    let document = this.pendingDocuments.get(source);
    if (!document) {
      document = { renderer: Promise.resolve().then(loadRenderer), queue: Promise.resolve(), requestCount: 0 };
      this.pendingDocuments.set(source, document);
    }
    const session = document;
    session.requestCount += 1;
    const rendered = session.queue.then(async () => (await session.renderer).renderPage(pageNumber, width));
    session.queue = rendered.then(() => undefined, () => undefined);
    const request = rendered.then((page) => {
      this.remember(key, page.dataUrl);
      return page.dataUrl;
    }).finally(() => {
      this.pendingPages.delete(key);
      session.requestCount -= 1;
      if (session.requestCount === 0) {
        this.pendingDocuments.delete(source);
        void session.renderer.then((renderer) => renderer.destroy()).catch(() => undefined);
      }
    });
    this.pendingPages.set(key, request);
    return request;
  }
}

export const pdfPreviewCache = new PdfPreviewCache();
