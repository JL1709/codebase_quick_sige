import type { ProjectAsset } from "./types";

export const DEFAULT_ASSET_LONG_EDGE = 2_500;
const DEFAULT_ASSET_ASPECT_RATIO = 16 / 10;
const ISO_PAPER_ASPECT_RATIO = 1 / Math.SQRT2;

export interface AssetPlacementDimensions {
  width: number;
  height: number;
}

export interface ContainedDimensions extends AssetPlacementDimensions {
  x: number;
  y: number;
}

export function containDimensions(
  frameWidth: number,
  frameHeight: number,
  sourceAspectRatio: number,
): ContainedDimensions {
  const safeAspectRatio = Number.isFinite(sourceAspectRatio) && sourceAspectRatio > 0
    ? sourceAspectRatio
    : ISO_PAPER_ASPECT_RATIO;
  const width = Math.min(frameWidth, frameHeight * safeAspectRatio);
  const height = width / safeAspectRatio;
  return {
    x: (frameWidth - width) / 2,
    y: (frameHeight - height) / 2,
    width,
    height,
  };
}

export function pdfPageMetadata(asset: ProjectAsset, pageNumber: number) {
  return asset.pdfPages?.find((page) => page.pageNumber === pageNumber);
}

export function projectAssetPlacementDimensions(
  asset: ProjectAsset,
  pageNumber = 1,
  longEdge = DEFAULT_ASSET_LONG_EDGE,
): AssetPlacementDimensions {
  const pdfPage = asset.mimeType === "application/pdf" ? pdfPageMetadata(asset, pageNumber) : undefined;
  const sourceWidth = pdfPage?.width ?? asset.width;
  const sourceHeight = pdfPage?.height ?? asset.height;
  const aspectRatio = sourceWidth && sourceHeight
    ? sourceWidth / sourceHeight
    : asset.mimeType === "application/pdf" ? ISO_PAPER_ASPECT_RATIO : DEFAULT_ASSET_ASPECT_RATIO;

  if (aspectRatio >= 1) return { width: longEdge, height: Math.round(longEdge / aspectRatio) };
  return { width: Math.round(longEdge * aspectRatio), height: longEdge };
}

export function normalizedPdfPageNumbers(asset: ProjectAsset, pageNumbers: number[]): number[] {
  const pageCount = Math.max(1, asset.pageCount ?? asset.pdfPages?.length ?? 1);
  return [...new Set(pageNumbers)]
    .filter((pageNumber) => Number.isInteger(pageNumber) && pageNumber >= 1 && pageNumber <= pageCount)
    .sort((first, second) => first - second);
}
