import { Packer } from "docx";
import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { buildPlanDocxDocument, buildPlanPdf, buildSupportingDocumentPdf } from "./exports";

describe("document exports", () => {
  it("builds a physical A0 landscape PDF with substantial content", () => {
    const database = createSeedDatabase();
    const project = database.projects[0];
    const plan = database.plans[0];
    const pdf = buildPlanPdf(project, plan, database.blocks, database.categories);
    const bytes = new Uint8Array(pdf.output("arraybuffer"));

    expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(1189);
    expect(Math.round(pdf.internal.pageSize.getHeight())).toBe(841);
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  });

  it("embeds a selected raster project asset without changing the one-sheet contract", () => {
    const database = createSeedDatabase();
    const project = {
      ...database.projects[0],
      assets: [{
        id: "asset-layout",
        filename: "site-layout.png",
        mimeType: "image/png" as const,
        byteSize: 68,
        dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlKXoQAAAAASUVORK5CYII=",
        createdAt: "2026-09-26T00:00:00.000Z",
      }],
    };
    const plan = { ...database.plans[0], includedAssetIds: ["asset-layout"] };
    const pdf = buildPlanPdf(project, plan, database.blocks, database.categories);

    expect(pdf.getNumberOfPages()).toBe(1);
    expect(pdf.output("arraybuffer").byteLength).toBeGreaterThan(10_000);
  });

  it("builds a valid Word package from plan content", async () => {
    const database = createSeedDatabase();
    const document = buildPlanDocxDocument(database.projects[0], database.plans[0], database.blocks, database.categories);
    const buffer = await Packer.toBuffer(document);

    expect(buffer.byteLength).toBeGreaterThan(10_000);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("builds every supporting PDF template", () => {
    const database = createSeedDatabase();
    const project = database.projects[0];
    const types = ["site_rules", "alarm_plan", "fire_safety", "first_aid", "participants", "advance_notice"] as const;
    for (const type of types) {
      const bytes = buildSupportingDocumentPdf(project, type).output("arraybuffer");
      expect(bytes.byteLength).toBeGreaterThan(3_000);
    }
  });
});
