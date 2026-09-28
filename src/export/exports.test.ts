import { Packer } from "docx";
import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { annotationBoundsFromDrag, createAnnotationElement } from "../domain/planAnnotations";
import { buildPlanDocxDocument, buildPlanPdf, buildSupportingDocumentPdf } from "./exports";

describe("document exports", () => {
  it("builds a physical A0 landscape PDF with substantial content", () => {
    const database = createSeedDatabase();
    const project = database.projects[0];
    const plan = database.plans[0];
    const pdf = buildPlanPdf(project, plan, database.blocks, database.categories, database.user.preferredLocale);
    const bytes = new Uint8Array(pdf.output("arraybuffer"));

    expect(Math.round(pdf.internal.pageSize.getWidth())).toBe(1189);
    expect(Math.round(pdf.internal.pageSize.getHeight())).toBe(841);
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  });

  it("keeps a selected raster project asset within the one-sheet export contract", () => {
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
    const plan = structuredClone(database.plans[0]);
    plan.includedAssetIds = ["asset-layout"];
    const imageElement = plan.layout.elements.find((element) => element.kind === "image");
    expect(imageElement?.kind).toBe("image");
    if (!imageElement || imageElement.kind !== "image") return;
    imageElement.assetId = "asset-layout";
    const pdf = buildPlanPdf(project, plan, database.blocks, database.categories, database.user.preferredLocale);
    const bytes = new Uint8Array(pdf.output("arraybuffer"));

    expect(pdf.getNumberOfPages()).toBe(1);
    expect(bytes.byteLength).toBeGreaterThan(9_000);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  });

  it("renders drawing annotations into the physical PDF", () => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    const diagonalArrowBounds = annotationBoundsFromDrag("arrow", { x: 9_500, y: 2_200 }, { x: 8_000, y: 3_100 }, plan.layout.gridSize);
    plan.layout.elements.push(
      createAnnotationElement("rectangle", "export-rectangle", plan.layout, { x: 8_000, y: 1_000, width: 1_500, height: 900 }),
      createAnnotationElement("arrow", "export-arrow", plan.layout, diagonalArrowBounds),
      createAnnotationElement("callout", "export-callout", plan.layout, { x: 8_000, y: 2_800, width: 1_800, height: 800 }),
    );
    const pdf = buildPlanPdf(database.projects[0], plan, database.blocks, database.categories, database.user.preferredLocale);
    const bytes = new Uint8Array(pdf.output("arraybuffer"));

    expect(pdf.getNumberOfPages()).toBe(1);
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  });

  it("builds a valid Word package from plan content", async () => {
    const database = createSeedDatabase();
    const document = buildPlanDocxDocument(database.projects[0], database.plans[0], database.blocks, database.categories, database.user.preferredLocale);
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
      const bytes = buildSupportingDocumentPdf(project, type, database.user.preferredLocale).output("arraybuffer");
      expect(bytes.byteLength).toBeGreaterThan(3_000);
    }
  });
});
