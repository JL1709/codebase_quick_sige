import type { PlanPaperRaster } from "./types";

export interface PaperRasterSpec {
  format: Exclude<PlanPaperRaster, "none">;
  columns: number;
  rows: number;
  orientation: "portrait" | "landscape";
  nominalWidthMillimetres: number;
  nominalHeightMillimetres: number;
}

export const PAPER_RASTER_SPECS: PaperRasterSpec[] = [
  { format: "A1", columns: 2, rows: 1, orientation: "portrait", nominalWidthMillimetres: 594, nominalHeightMillimetres: 841 },
  { format: "A2", columns: 2, rows: 2, orientation: "landscape", nominalWidthMillimetres: 594, nominalHeightMillimetres: 420 },
  { format: "A3", columns: 4, rows: 2, orientation: "portrait", nominalWidthMillimetres: 297, nominalHeightMillimetres: 420 },
  { format: "A4", columns: 4, rows: 4, orientation: "landscape", nominalWidthMillimetres: 297, nominalHeightMillimetres: 210 },
  { format: "A5", columns: 8, rows: 4, orientation: "portrait", nominalWidthMillimetres: 148, nominalHeightMillimetres: 210 },
];

export function getPaperRasterSpec(format: PlanPaperRaster): PaperRasterSpec | undefined {
  return PAPER_RASTER_SPECS.find((spec) => spec.format === format);
}
