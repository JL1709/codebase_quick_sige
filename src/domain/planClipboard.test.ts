import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { createCanvasClipboard, pasteCanvasClipboard } from "./planClipboard";
import type { PlanAssetElement, PlanElement, PlanTextElement } from "./types";

function createSequentialIdFactory() {
  let sequence = 0;
  return (prefix: string) => `${prefix}-copy-${sequence += 1}`;
}

describe("canvas clipboard", () => {
  it("copies a safety block together with an independent plan item", () => {
    const plan = structuredClone(createSeedDatabase().plans[0]);
    const sourceElement = plan.layout.elements.find((element) => element.kind === "block");
    expect(sourceElement?.kind).toBe("block");
    if (!sourceElement || sourceElement.kind !== "block") return;
    const sourceSection = plan.sections.find((section) => section.id === sourceElement.sectionId)!;
    const sourceItem = sourceSection.items.find((item) => item.id === sourceElement.itemId)!;

    const clipboard = createCanvasClipboard(plan, [sourceElement.id]);
    const result = clipboard && pasteCanvasClipboard(plan, clipboard, createSequentialIdFactory());
    expect(result).not.toBeNull();

    const pastedElement = result!.plan.layout.elements.find((element) => element.id === result!.pastedElementIds[0]);
    expect(pastedElement?.kind).toBe("block");
    if (!pastedElement || pastedElement.kind !== "block") return;
    const pastedItem = result!.plan.sections
      .find((section) => section.id === pastedElement.sectionId)!
      .items.find((item) => item.id === pastedElement.itemId);
    expect(pastedElement.id).not.toBe(sourceElement.id);
    expect(pastedElement.itemId).not.toBe(sourceElement.itemId);
    expect(pastedItem).toEqual({ ...sourceItem, id: pastedElement.itemId });
    expect(sourceSection.items).toHaveLength(plan.sections.find((section) => section.id === sourceElement.sectionId)!.items.length);
    expect(result!.plan.sections.find((section) => section.id === sourceElement.sectionId)!.items).toHaveLength(sourceSection.items.length + 1);
  });

  it("preserves relative geometry and cascades repeated pastes", () => {
    const plan = structuredClone(createSeedDatabase().plans[0]);
    const textElement: PlanTextElement = {
      id: "clipboard-text",
      kind: "text",
      x: 1_000,
      y: 1_200,
      width: 800,
      height: 300,
      zIndex: 800,
      text: { en: "Coordinate access" },
    };
    const imageElement: PlanAssetElement = {
      id: "clipboard-image",
      kind: "image",
      x: 2_300,
      y: 1_800,
      width: 1_000,
      height: 700,
      zIndex: 801,
      assetId: "asset-example",
    };
    plan.layout.elements.push(textElement, imageElement);

    const clipboard = createCanvasClipboard(plan, [textElement.id, imageElement.id]);
    const createId = createSequentialIdFactory();
    const firstPaste = clipboard && pasteCanvasClipboard(plan, clipboard, createId);
    expect(firstPaste).not.toBeNull();
    const secondPaste = pasteCanvasClipboard(firstPaste!.plan, firstPaste!.clipboard, createId);
    expect(secondPaste).not.toBeNull();

    const [firstText, firstImage] = firstPaste!.pastedElementIds.map((id) => firstPaste!.plan.layout.elements.find((element) => element.id === id)!);
    const [secondText, secondImage] = secondPaste!.pastedElementIds.map((id) => secondPaste!.plan.layout.elements.find((element) => element.id === id)!);
    const initialOffset = plan.layout.gridSize * 4;
    expect(firstText.x - textElement.x).toBe(initialOffset);
    expect(firstText.y - textElement.y).toBe(initialOffset);
    expect(secondText.x - textElement.x).toBe(initialOffset * 2);
    expect(secondText.y - textElement.y).toBe(initialOffset * 2);
    expect(firstImage.x - firstText.x).toBe(imageElement.x - textElement.x);
    expect(firstImage.y - firstText.y).toBe(imageElement.y - textElement.y);
    expect(secondImage.x - secondText.x).toBe(imageElement.x - textElement.x);
    expect(secondImage.y - secondText.y).toBe(imageElement.y - textElement.y);
  });

  it("copies every supported non-block canvas element kind", () => {
    const plan = structuredClone(createSeedDatabase().plans[0]);
    const sectionId = plan.sections[0].id;
    const elements: PlanElement[] = [
      { id: "copy-section", kind: "section", sectionId, x: 800, y: 800, width: 1_200, height: 600, zIndex: 600 },
      { id: "copy-image", kind: "image", assetId: "asset-image", fitMode: "cover", x: 1_000, y: 1_000, width: 800, height: 500, zIndex: 700 },
      { id: "copy-pdf", kind: "pdf_page", assetId: "asset-pdf", pageNumber: 2, x: 1_200, y: 1_200, width: 800, height: 500, zIndex: 701 },
      { id: "copy-document", kind: "document", documentType: "first_aid", displayVariant: "emergency_card", x: 1_400, y: 1_400, width: 800, height: 500, zIndex: 702 },
      { id: "copy-text", kind: "text", text: { en: "Keep route clear" }, fontWeight: "bold", x: 1_600, y: 1_600, width: 800, height: 500, zIndex: 703 },
      { id: "copy-shape", kind: "shape", shape: "callout", text: { en: "Crane area" }, x: 1_800, y: 1_800, width: 800, height: 500, zIndex: 704 },
    ];
    plan.layout.elements.push(...elements);

    const clipboard = createCanvasClipboard(plan, elements.map((element) => element.id));
    const result = clipboard && pasteCanvasClipboard(plan, clipboard, createSequentialIdFactory());
    expect(result?.pastedElementIds).toHaveLength(elements.length);

    const pastedElements = result!.pastedElementIds.map((id) => result!.plan.layout.elements.find((element) => element.id === id)!);
    elements.forEach((source, index) => {
      expect(pastedElements[index].kind).toBe(source.kind);
      expect(pastedElements[index].id).not.toBe(source.id);
      expect(pastedElements[index]).toMatchObject({
        ...source,
        id: pastedElements[index].id,
        x: source.x + plan.layout.gridSize * 4,
        y: source.y + plan.layout.gridSize * 4,
        zIndex: source.zIndex + 1,
      });
    });
  });

  it("uses one clamped offset for the group at the page boundary", () => {
    const plan = structuredClone(createSeedDatabase().plans[0]);
    const first: PlanTextElement = { id: "edge-one", kind: "text", x: plan.layout.width - 1_300, y: 500, width: 600, height: 300, zIndex: 800, text: {} };
    const second: PlanTextElement = { id: "edge-two", kind: "text", x: plan.layout.width - 650, y: 900, width: 600, height: 300, zIndex: 801, text: {} };
    plan.layout.elements.push(first, second);

    const clipboard = createCanvasClipboard(plan, [first.id, second.id]);
    const result = clipboard && pasteCanvasClipboard(plan, clipboard, createSequentialIdFactory());
    const [pastedFirst, pastedSecond] = result!.pastedElementIds.map((id) => result!.plan.layout.elements.find((element) => element.id === id)!);

    expect(pastedSecond.x + pastedSecond.width).toBeLessThanOrEqual(plan.layout.width - plan.layout.margins.right);
    expect(pastedSecond.x - pastedFirst.x).toBe(second.x - first.x);
    expect(pastedSecond.y - pastedFirst.y).toBe(second.y - first.y);
  });

  it("does not copy structural canvas elements", () => {
    const plan = structuredClone(createSeedDatabase().plans[0]);
    const protectedIds = plan.layout.elements
      .filter((element) => element.kind === "block_area" || element.kind === "header" || element.kind === "title_block")
      .map((element) => element.id);

    expect(createCanvasClipboard(plan, protectedIds)).toBeNull();
  });
});
