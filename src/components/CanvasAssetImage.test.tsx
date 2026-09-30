import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pdfPreviewCache } from "../documents/pdfPreviewCache";
import type { ProjectAsset } from "../domain/types";
import { CanvasAssetImage } from "./CanvasAssetImage";

vi.mock("../documents/pdfPreviewCache", () => ({ pdfPreviewCache: { get: vi.fn(), render: vi.fn() } }));
vi.mock("../data/blobRepository", () => ({ blobObjectUrl: vi.fn(), getBlob: vi.fn() }));

const asset: ProjectAsset = { id: "pdf", filename: "Plan.pdf", mimeType: "application/pdf", byteSize: 100, dataUrl: "/source.pdf", previewDataUrl: "/cover.png", pageCount: 4, createdAt: "2026-09-30" };
const translate = (key: string) => key;

function deferredPreview() {
  let resolve!: (preview: string) => void;
  const promise = new Promise<string>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

describe("canvas asset preview", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  afterEach(cleanup);

  it("never displays the cover for a later page while it loads", async () => {
    const preview = deferredPreview();
    vi.mocked(pdfPreviewCache.render).mockReturnValue(preview.promise);
    render(<CanvasAssetImage asset={asset} pdfPage pageNumber={2} t={translate} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("PDF · editor.page 2")).toBeVisible();
    await act(async () => { preview.resolve("/page-two.png"); });
    expect(screen.getByRole("img")).toHaveAttribute("src", "/page-two.png");
  });

  it("hides the previous page immediately and ignores its late result when the page changes", async () => {
    const first = deferredPreview();
    const second = deferredPreview();
    vi.mocked(pdfPreviewCache.render).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const view = render(<CanvasAssetImage asset={asset} pdfPage pageNumber={2} t={translate} />);
    view.rerender(<CanvasAssetImage asset={asset} pdfPage pageNumber={3} t={translate} />);
    await act(async () => { first.resolve("/page-two.png"); });
    expect(screen.queryByRole("img")).toBeNull();
    await act(async () => { second.resolve("/page-three.png"); });
    expect(screen.getByRole("img")).toHaveAttribute("src", "/page-three.png");
    vi.mocked(pdfPreviewCache.render).mockReturnValue(new Promise(() => undefined));
    view.rerender(<CanvasAssetImage asset={{ ...asset, blobId: "replacement-source" }} pdfPage pageNumber={3} t={translate} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows a matching cached page synchronously when remounted", () => {
    vi.mocked(pdfPreviewCache.get).mockReturnValue("/cached-page-four.png");
    vi.mocked(pdfPreviewCache.render).mockReturnValue(new Promise(() => undefined));
    render(<CanvasAssetImage asset={asset} pdfPage pageNumber={4} t={translate} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/cached-page-four.png");
  });

  it("renders page one from the source when its stored cover is missing", async () => {
    vi.mocked(pdfPreviewCache.render).mockResolvedValue("/rendered-page-one.png");
    render(<CanvasAssetImage asset={{ ...asset, previewDataUrl: undefined, previewBlobId: "missing-cover" }} pdfPage pageNumber={1} t={translate} />);
    await waitFor(() => expect(screen.getByRole("img")).toHaveAttribute("src", "/rendered-page-one.png"));
    expect(pdfPreviewCache.render).toHaveBeenCalledWith(expect.any(String), 1, 1200, expect.any(Function));
  });

  it("shows a page-specific error placeholder when rendering fails", async () => {
    vi.mocked(pdfPreviewCache.render).mockRejectedValue(new Error("Source missing"));
    render(<CanvasAssetImage asset={asset} pdfPage pageNumber={2} t={translate} />);
    await waitFor(() => expect(screen.getByText("editor.previewUnavailable")).toBeVisible());
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("PDF · editor.page 2")).toBeVisible();
    expect(screen.getByText("Plan.pdf").parentElement).toHaveAttribute("aria-busy", "false");
  });
});
