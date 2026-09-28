import { describe, expect, it } from "vitest";
import type { ProjectAsset } from "./types";
import { containDimensions, normalizedPdfPageNumbers, projectAssetPlacementDimensions } from "./projectAssetPlacement";

const pdfAsset: ProjectAsset = {
  id: "pdf",
  filename: "plan.pdf",
  mimeType: "application/pdf",
  byteSize: 10,
  pageCount: 3,
  pdfPages: [
    { pageNumber: 1, width: 595, height: 842 },
    { pageNumber: 2, width: 842, height: 595 },
    { pageNumber: 3, width: 500, height: 500 },
  ],
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("project asset placement", () => {
  it("preserves portrait, landscape, and square PDF page proportions", () => {
    expect(projectAssetPlacementDimensions(pdfAsset, 1)).toEqual({ width: 1_767, height: 2_500 });
    expect(projectAssetPlacementDimensions(pdfAsset, 2)).toEqual({ width: 2_500, height: 1_767 });
    expect(projectAssetPlacementDimensions(pdfAsset, 3)).toEqual({ width: 2_500, height: 2_500 });
  });

  it("deduplicates, sorts, and bounds selected PDF pages", () => {
    expect(normalizedPdfPageNumbers(pdfAsset, [3, 1, 3, 0, 4, 2])).toEqual([1, 2, 3]);
  });

  it("contains a source page inside a differently shaped frame without distortion", () => {
    expect(containDimensions(200, 100, 1)).toEqual({ x: 50, y: 0, width: 100, height: 100 });
    expect(containDimensions(100, 200, 2)).toEqual({ x: 0, y: 75, width: 100, height: 50 });
  });
});
