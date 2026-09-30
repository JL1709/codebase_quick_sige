import { describe, expect, it, vi } from "vitest";
import { PdfPreviewCache } from "./pdfPreviewCache";
import type { PdfPageRenderer } from "./pdfPreview";

function createRenderer(): PdfPageRenderer {
  return {
    renderPage: vi.fn(async (pageNumber: number, width: number) => ({ pageNumber, width, height: width * 2, dataUrl: `page-${pageNumber}-width-${width}` })),
    destroy: vi.fn(async () => undefined),
  };
}

describe("PDF preview cache", () => {
  it("shares pending page requests and loads a source once for multiple pages and resolutions", async () => {
    const cache = new PdfPreviewCache();
    const renderer = createRenderer();
    const load = vi.fn(async () => renderer);
    const first = cache.render("source", 2, 180, load);
    const duplicate = cache.render("source", 2, 180, load);
    const canvas = cache.render("source", 2, 1200, load);
    const nextPage = cache.render("source", 3, 180, load);
    expect(duplicate).toBe(first);
    expect(await Promise.all([first, canvas, nextPage])).toEqual(["page-2-width-180", "page-2-width-1200", "page-3-width-180"]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(renderer.renderPage).toHaveBeenCalledTimes(3);
    expect(renderer.destroy).toHaveBeenCalledTimes(1);
    expect(await cache.render("source", 2, 180, load)).toBe("page-2-width-180");
    expect(load).toHaveBeenCalledTimes(1);
    expect(cache.get("replacement-source", 2, 180)).toBeUndefined();
  });

  it("renders sequentially within a document so cleanup cannot interrupt another page", async () => {
    const cache = new PdfPreviewCache();
    const renderer = createRenderer();
    let releaseFirst: (() => void) | undefined;
    vi.mocked(renderer.renderPage).mockImplementationOnce(async (pageNumber, width) => {
      await new Promise<void>((resolve) => { releaseFirst = resolve; });
      return { pageNumber, width, height: width, dataUrl: "first" };
    });
    const first = cache.render("source", 2, 180, async () => renderer);
    const next = cache.render("source", 3, 180, async () => renderer);
    await vi.waitFor(() => expect(releaseFirst).toBeDefined());
    expect(renderer.renderPage).toHaveBeenCalledTimes(1);
    expect(renderer.destroy).not.toHaveBeenCalled();
    releaseFirst?.();
    await Promise.all([first, next]);
    expect(renderer.renderPage).toHaveBeenCalledTimes(2);
    expect(renderer.destroy).toHaveBeenCalledTimes(1);
  });

  it("evicts the least recently used preview when the byte budget is reached", async () => {
    const cache = new PdfPreviewCache(70);
    const renderer = createRenderer();
    const load = async () => renderer;
    await cache.render("source", 1, 180, load);
    await cache.render("source", 2, 180, load);
    cache.get("source", 1, 180);
    await cache.render("source", 3, 180, load);
    expect(cache.get("source", 1, 180)).toBeDefined();
    expect(cache.get("source", 2, 180)).toBeUndefined();
    expect(cache.get("source", 3, 180)).toBeDefined();
  });

  it("does not cache oversized previews or failed requests and releases the renderer", async () => {
    const cache = new PdfPreviewCache(4);
    const renderer = createRenderer();
    const load = vi.fn(async () => renderer);
    vi.mocked(renderer.renderPage).mockRejectedValueOnce(new Error("Bad PDF"));
    await expect(cache.render("source", 2, 180, load)).rejects.toThrow("Bad PDF");
    expect(cache.get("source", 2, 180)).toBeUndefined();
    expect(await cache.render("source", 2, 180, load)).toBe("page-2-width-180");
    expect(cache.get("source", 2, 180)).toBeUndefined();
    expect(load).toHaveBeenCalledTimes(2);
    expect(renderer.destroy).toHaveBeenCalledTimes(2);
  });
});
