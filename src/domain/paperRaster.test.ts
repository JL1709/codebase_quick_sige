import { describe, expect, it } from "vitest";
import { getPaperRasterSpec, PAPER_RASTER_SPECS } from "./paperRaster";

describe("A0 paper raster", () => {
  it("tiles every supported paper format across an A0 landscape canvas", () => {
    expect(PAPER_RASTER_SPECS.map(({ format, columns, rows, orientation }) => ({ format, columns, rows, orientation }))).toEqual([
      { format: "A1", columns: 2, rows: 1, orientation: "portrait" },
      { format: "A2", columns: 2, rows: 2, orientation: "landscape" },
      { format: "A3", columns: 4, rows: 2, orientation: "portrait" },
      { format: "A4", columns: 4, rows: 4, orientation: "landscape" },
      { format: "A5", columns: 8, rows: 4, orientation: "portrait" },
    ]);
  });

  it("does not expose A0 as a redundant raster option", () => {
    expect(getPaperRasterSpec("none")).toBeUndefined();
    expect(PAPER_RASTER_SPECS.some((spec) => spec.format === ("A0" as never))).toBe(false);
  });
});
