import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { jsPDF } from "jspdf";
import { blobDataUrl, getBlob } from "../data/blobRepository";
import { readableTextColor } from "../domain/colorContrast";
import { hydrateBlockImages } from "../domain/blockImages";
import { blockHierarchyColor, categoryHierarchyColor } from "../domain/categoryTree";
import { calculateBlockPresentationMetrics, calculateSectionPresentationMetrics } from "../domain/planLayout";
import { PLAN_MILLIMETRES_PER_CANVAS_PIXEL, PLAN_PRESENTATION } from "../domain/planPresentation";
import { containDimensions } from "../domain/projectAssetPlacement";
import type {
  BuildingBlock,
  BuildingBlockCategory,
  Locale,
  Plan,
  PlanAssetElement,
  PlanRevision,
  Project,
} from "../domain/types";

const ARROW_HEAD_LENGTH_MM = 8;
const ARROW_HEAD_HALF_ANGLE_RADIANS = Math.PI / 6;
const PDF_POINT_TO_MILLIMETRES = 25.4 / 72;
const PDF_POINTS_PER_MILLIMETRE = 1 / PDF_POINT_TO_MILLIMETRES;
const PDF_EXPORT_RASTER_DPI = 300;
const MINIMUM_PDF_EXPORT_WIDTH_PX = 1_200;
const MAXIMUM_PDF_EXPORT_WIDTH_PX = 6_000;

export function planCanvasFontSizeToPdfPoints(canvasFontSize: number): number {
  return canvasFontSize * PLAN_MILLIMETRES_PER_CANVAS_PIXEL * PDF_POINTS_PER_MILLIMETRE;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function safeFilename(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function annotationColor(hex: string | undefined, opacity = 1, fallback = "#12241f"): [number, number, number] {
  const [red, green, blue] = hexToRgb(hex ?? fallback);
  const normalizedOpacity = Math.max(0, Math.min(1, opacity));
  return [
    Math.round(red * normalizedOpacity + 255 * (1 - normalizedOpacity)),
    Math.round(green * normalizedOpacity + 255 * (1 - normalizedOpacity)),
    Math.round(blue * normalizedOpacity + 255 * (1 - normalizedOpacity)),
  ];
}

function getBlockMap(blocks: BuildingBlock[]): Map<string, BuildingBlock> {
  return new Map(blocks.map((block) => [block.id, block]));
}

function getCategoryMap(categories: BuildingBlockCategory[]): Map<string, BuildingBlockCategory> {
  return new Map(categories.map((category) => [category.id, category]));
}

async function cropImageForElement(blob: Blob, element: PlanAssetElement): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const targetAspect = element.width / element.height;
  const sourceAspect = bitmap.width / bitmap.height;
  let sourceWidth = bitmap.width; let sourceHeight = bitmap.height;
  if (sourceAspect > targetAspect) sourceWidth = bitmap.height * targetAspect;
  else sourceHeight = bitmap.width / targetAspect;
  const xRatio = (element.crop?.x ?? 50) / 100; const yRatio = (element.crop?.y ?? 50) / 100;
  const sourceX = Math.max(0, Math.min(bitmap.width - sourceWidth, (bitmap.width - sourceWidth) * xRatio));
  const sourceY = Math.max(0, Math.min(bitmap.height - sourceHeight, (bitmap.height - sourceHeight) * yRatio));
  const canvas = document.createElement("canvas"); canvas.width = 1_600; canvas.height = Math.max(1, Math.round(canvas.width / targetAspect));
  canvas.getContext("2d")?.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  bitmap.close(); return canvas.toDataURL("image/png");
}

export function buildPlanPdf(
  project: Project,
  plan: Plan,
  blocks: BuildingBlock[],
  categories: BuildingBlockCategory[],
  locale: Locale,
  revision?: PlanRevision,
  assetPreviewByElement: Map<string, string> = new Map(),
  pdfPageAspectRatioByElement: Map<string, number> = new Map(),
): jsPDF {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a0", compress: true });
  const blockMap = getBlockMap(blocks);
  const categoryMap = getCategoryMap(categories);
  const unit = (value: number) => value / 10;

  const sections = new Map(plan.sections.map((section) => [section.id, section]));
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]));
  for (const element of [...plan.layout.elements].filter((candidate) => !candidate.hidden).sort((a, b) => a.zIndex - b.zIndex)) {
    const x = unit(element.x); const y = unit(element.y); const width = unit(element.width); const height = unit(element.height);
    if (element.kind === "header") {
      const { header } = PLAN_PRESENTATION;
      const projectDetails = `${project.projectNumber} · ${project.address}, ${project.city}`;
      const status = revision
        ? `Revision ${revision.index} · ${new Date(revision.publishedAt).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB")}`
        : locale === "de" ? "Arbeitsstand" : "Working draft";
      pdf.setFillColor(18, 36, 31); pdf.roundedRect(x, y, width, height, 5, 5, "F");
      pdf.setTextColor(213, 255, 63); pdf.setFont("helvetica", "bold");
      pdf.setFontSize(planCanvasFontSizeToPdfPoints(header.brandFontSize));
      pdf.text(element.brandText?.[locale] ?? "QUICKSiGe", x + header.horizontalPadding, y + 18);
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(planCanvasFontSizeToPdfPoints(header.titleFontSize));
      const planTitle = element.titleText?.[locale]
        ?? (locale === "de" ? "Sicherheits- und Gesundheitsschutzplan" : "Safety and Health Plan");
      pdf.text(pdf.splitTextToSize(planTitle, width * .58).slice(0, 1), x + header.horizontalPadding, y + 40);
      pdf.setFontSize(planCanvasFontSizeToPdfPoints(header.projectFontSize));
      pdf.text(element.projectNameText?.[locale] ?? project.name, x + width - header.horizontalPadding, y + 16, { align: "right" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(planCanvasFontSizeToPdfPoints(header.metadataFontSize));
      pdf.text(pdf.splitTextToSize(element.projectDetailsText?.[locale] ?? projectDetails, width * .36).slice(0, 1), x + width - header.horizontalPadding, y + 30, { align: "right" });
      pdf.text(element.statusText?.[locale] ?? status, x + width - header.horizontalPadding, y + 44, { align: "right" });
    } else if (element.kind === "section") {
      const section = sections.get(element.sectionId);
      const category = section && categoryMap.get(section.categoryId);
      if (!section || !category) continue;
      const categoryColor = categoryHierarchyColor(category.id, categories);
      const title = section.titleOverrides?.[locale] ?? category.translations[locale].name;
      const presentation = calculateSectionPresentationMetrics(element, title);
      const headerHeight = PLAN_PRESENTATION.section.headerHeight * presentation.layoutScale;
      const horizontalPadding = PLAN_PRESENTATION.section.horizontalPadding * presentation.layoutScale;
      const headerRadius = Math.min(4, headerHeight / 2);
      const titleFontSize = planCanvasFontSizeToPdfPoints(
        PLAN_PRESENTATION.section.titleFontSize * presentation.contentScale,
      );
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(titleFontSize);
      const titleLines = pdf.splitTextToSize(title, Math.max(1, width - horizontalPadding * 2));
      const titleLineHeight = titleFontSize * PDF_POINT_TO_MILLIMETRES * PLAN_PRESENTATION.section.titleLineHeight;
      const titleTop = y + Math.max(0, (headerHeight - titleLines.length * titleLineHeight) / 2);
      pdf.setDrawColor(204, 215, 210);
      pdf.setLineWidth(PLAN_MILLIMETRES_PER_CANVAS_PIXEL);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(x, y, width, height, 4, 4, "FD");
      pdf.setFillColor(...hexToRgb(categoryColor));
      pdf.roundedRect(x, y, width, headerHeight, headerRadius, headerRadius, "F");
      pdf.rect(x, y + headerHeight - headerRadius, width, headerRadius, "F");
      pdf.setTextColor(...hexToRgb(readableTextColor(categoryColor)));
      pdf.text(titleLines, x + horizontalPadding, titleTop + titleLineHeight * 0.8, {
        lineHeightFactor: PLAN_PRESENTATION.section.titleLineHeight,
      });
    } else if (element.kind === "block") {
      const section = sections.get(element.sectionId);
      const item = section?.items.find((candidate) => candidate.id === element.itemId);
      const block = item && blockMap.get(item.blockId);
      if (!item || !block) continue;
      const content = block.translations[locale] ?? block.translations.de;
      const title = item.customTitle?.[locale] ?? content.title;
      const description = item.customShortDescription?.[locale] ?? content.shortDescription;
      const references = block.regulations.join(" · ");
      const presentation = calculateBlockPresentationMetrics(element, title, description, references);
      const blockColor = blockHierarchyColor(block, categories);
      const accent = hexToRgb(blockColor);
      const blockImage = item.imageDataUrl ?? block.imageDataUrl;
      const layoutScale = presentation.layoutScale;
      const titleFontSize = planCanvasFontSizeToPdfPoints(
        PLAN_PRESENTATION.block.titleFontSize * presentation.contentScale,
      );
      const descriptionFontSize = planCanvasFontSizeToPdfPoints(
        PLAN_PRESENTATION.block.descriptionFontSize * presentation.contentScale,
      );
      const referenceFontSize = planCanvasFontSizeToPdfPoints(
        PLAN_PRESENTATION.block.referenceFontSize * presentation.contentScale,
      );
      const titlePaddingX = PLAN_PRESENTATION.block.titleHorizontalPadding * layoutScale;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(titleFontSize);
      const titleLines = pdf.splitTextToSize(title, Math.max(1, width - titlePaddingX * 2));
      const titleLineHeight = titleFontSize * PDF_POINT_TO_MILLIMETRES * PLAN_PRESENTATION.block.titleLineHeight;
      const titleHeight = titleLines.length * titleLineHeight
        + PLAN_PRESENTATION.block.titleVerticalPadding * 2 * layoutScale;
      const footerMarginX = PLAN_PRESENTATION.block.referenceHorizontalMargin * layoutScale;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(referenceFontSize);
      const referenceLines = pdf.splitTextToSize(references, Math.max(1, width - footerMarginX * 2));
      const referenceLineHeight = referenceFontSize * PDF_POINT_TO_MILLIMETRES
        * PLAN_PRESENTATION.block.referenceLineHeight;
      const footerHeight = referenceLines.length * referenceLineHeight
        + (PLAN_PRESENTATION.block.referenceTopPadding + PLAN_PRESENTATION.block.referenceBottomPadding) * layoutScale;
      const bodyPadding = PLAN_PRESENTATION.block.bodyPadding * layoutScale;
      const bodyX = x + bodyPadding;
      const bodyY = y + titleHeight + bodyPadding;
      const bodyWidth = Math.max(1, width - bodyPadding * 2);
      const bodyHeight = Math.max(1, height - titleHeight - footerHeight - bodyPadding * 2);
      const columnGap = PLAN_PRESENTATION.block.bodyColumnGap * layoutScale;
      const columnWidth = Math.max(1, (bodyWidth - columnGap) / 2);
      const headerRadius = Math.min(3, titleHeight / 2);
      pdf.setDrawColor(212, 221, 217);
      pdf.setLineWidth(PLAN_MILLIMETRES_PER_CANVAS_PIXEL);
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(x, y, width, height, 3, 3, "FD");
      pdf.setFillColor(...accent);
      pdf.roundedRect(x, y, width, titleHeight, headerRadius, headerRadius, "F");
      pdf.rect(x, y + titleHeight - headerRadius, width, headerRadius, "F");
      pdf.setTextColor(...hexToRgb(readableTextColor(blockColor)));
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(titleFontSize);
      pdf.text(
        titleLines,
        x + titlePaddingX,
        y + PLAN_PRESENTATION.block.titleVerticalPadding * layoutScale + titleLineHeight * 0.8,
        { lineHeightFactor: PLAN_PRESENTATION.block.titleLineHeight },
      );
      let descriptionX = bodyX;
      let descriptionWidth = bodyWidth;
      if (blockImage) {
        try {
          pdf.addImage(blockImage, blockImage.startsWith("data:image/png") ? "PNG" : "JPEG", bodyX, bodyY, columnWidth, bodyHeight, undefined, "FAST");
          descriptionX = bodyX + columnWidth + columnGap; descriptionWidth = columnWidth;
        } catch { /* Preserve text when an old image override cannot be decoded. */ }
      }
      pdf.setTextColor(44, 60, 54);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(descriptionFontSize);
      const descriptionLines = pdf.splitTextToSize(description, Math.max(1, descriptionWidth));
      const descriptionLineHeight = descriptionFontSize * PDF_POINT_TO_MILLIMETRES
        * PLAN_PRESENTATION.block.descriptionLineHeight;
      pdf.text(descriptionLines, descriptionX, bodyY + descriptionLineHeight * 0.8, {
        lineHeightFactor: PLAN_PRESENTATION.block.descriptionLineHeight,
      });
      const footerTop = y + height - footerHeight;
      pdf.setDrawColor(227, 232, 229);
      pdf.line(x + footerMarginX, footerTop, x + width - footerMarginX, footerTop);
      pdf.setTextColor(104, 117, 111);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(referenceFontSize);
      pdf.text(
        referenceLines,
        x + footerMarginX,
        footerTop + PLAN_PRESENTATION.block.referenceTopPadding * layoutScale + referenceLineHeight * 0.8,
        { lineHeightFactor: PLAN_PRESENTATION.block.referenceLineHeight },
      );
    } else if (element.kind === "image") {
      const asset = assets.get(element.assetId); if (!asset?.dataUrl) continue;
      const preview = assetPreviewByElement.get(element.id) ?? asset.dataUrl;
      let imageX = x; let imageY = y; let imageWidth = width; let imageHeight = height;
      if ((element.fitMode ?? "contain") === "contain" && asset.width && asset.height) {
        const scale = Math.min(width / asset.width, height / asset.height); imageWidth = asset.width * scale; imageHeight = asset.height * scale;
        imageX += (width - imageWidth) / 2; imageY += (height - imageHeight) / 2;
      }
      try { pdf.addImage(preview, preview.startsWith("data:image/png") ? "PNG" : "JPEG", imageX, imageY, imageWidth, imageHeight, undefined, "FAST"); } catch { /* Filename remains visible through project documents if decoding fails. */ }
    } else if (element.kind === "pdf_page") {
      const asset = assets.get(element.assetId); if (!asset) continue;
      const preview = assetPreviewByElement.get(element.id) ?? asset.previewDataUrl;
      if (preview) {
        const pageMetadata = asset.pdfPages?.find((page) => page.pageNumber === (element.pageNumber ?? 1));
        const sourceAspectRatio = pdfPageAspectRatioByElement.get(element.id)
          ?? (pageMetadata ? pageMetadata.width / pageMetadata.height : 1 / Math.SQRT2);
        const contained = containDimensions(width, height, sourceAspectRatio);
        try { pdf.addImage(preview, "PNG", x + contained.x, y + contained.y, contained.width, contained.height, undefined, "FAST"); continue; } catch { /* Fall back to a labelled placeholder for legacy assets without a decodable preview. */ }
      }
      pdf.setDrawColor(174, 189, 183); pdf.setFillColor(244, 247, 245); pdf.roundedRect(x, y, width, height, 3, 3, "FD"); pdf.setTextColor(73, 93, 85); pdf.setFontSize(planCanvasFontSizeToPdfPoints(9)); pdf.text(pdf.splitTextToSize(asset.filename, width - 14), x + width / 2, y + height / 2, { align: "center" });
    } else if (element.kind === "document") {
      pdf.setDrawColor(157, 187, 176); pdf.setFillColor(236, 244, 241); pdf.roundedRect(x, y, width, height, 3, 3, "FD"); pdf.setTextColor(18, 36, 31); pdf.setFont("helvetica", "bold"); pdf.setFontSize(planCanvasFontSizeToPdfPoints(PLAN_PRESENTATION.document.titleFontSize)); pdf.text(supportingCopy[locale][element.documentType].title, x + 10, y + 13);
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(planCanvasFontSizeToPdfPoints(PLAN_PRESENTATION.document.bodyFontSize));
      if (element.displayVariant === "emergency_card") pdf.text(pdf.splitTextToSize(project.emergencyContacts.slice(0, 3).map((contact) => `${contact.label}: ${contact.phone}`).join(" · ") || "—", width - 20), x + 10, y + 25);
      if (element.displayVariant === "participant_list") pdf.text(pdf.splitTextToSize(project.participants.slice(0, 4).map((participant) => `${participant.name} · ${participant.company}`).join(" · ") || "—", width - 20), x + 10, y + 25);
      if (element.displayVariant === "qr_link") { pdf.setDrawColor(18, 36, 31); pdf.rect(x + width - 32, y + 8, 22, 22, "S"); pdf.text("QR", x + width - 21, y + 21, { align: "center" }); }
    } else if (element.kind === "text") {
      const opacity = element.opacity ?? 1;
      if (element.fillColor) { pdf.setFillColor(...annotationColor(element.fillColor, opacity)); pdf.rect(x, y, width, height, "F"); }
      if (element.strokeColor) { pdf.setDrawColor(...annotationColor(element.strokeColor, opacity)); pdf.setLineWidth(element.strokeWidth ?? 1); pdf.rect(x, y, width, height, "S"); }
      pdf.setTextColor(...annotationColor(element.textColor, opacity));
      pdf.setFont("helvetica", element.fontWeight === "bold" ? "bold" : "normal");
      pdf.setFontSize(planCanvasFontSizeToPdfPoints(element.fontSize ?? 9));
      const alignment = element.textAlign ?? "left";
      const textX = alignment === "left" ? x + 6 : alignment === "center" ? x + width / 2 : x + width - 6;
      pdf.text(pdf.splitTextToSize(element.text[locale] ?? "", Math.max(1, width - 12)), textX, y + 10, { align: alignment });
    } else if (element.kind === "shape") {
      const opacity = element.opacity ?? 1;
      const strokeColor = annotationColor(element.strokeColor, opacity, "#296c5d");
      pdf.setDrawColor(...strokeColor);
      pdf.setLineWidth(element.strokeWidth ?? 1);
      if (element.shape === "line" || element.shape === "arrow") {
        const connectorStart = element.connectorStart ?? { x: 0, y: 0.5 };
        const connectorEnd = element.connectorEnd ?? { x: 1, y: 0.5 };
        const startX = x + width * connectorStart.x;
        const startY = y + height * connectorStart.y;
        const endX = x + width * connectorEnd.x;
        const endY = y + height * connectorEnd.y;
        pdf.line(startX, startY, endX, endY);
        if (element.shape === "arrow") {
          const arrowAngle = Math.atan2(endY - startY, endX - startX);
          const firstHeadX = endX - ARROW_HEAD_LENGTH_MM * Math.cos(arrowAngle - ARROW_HEAD_HALF_ANGLE_RADIANS);
          const firstHeadY = endY - ARROW_HEAD_LENGTH_MM * Math.sin(arrowAngle - ARROW_HEAD_HALF_ANGLE_RADIANS);
          const secondHeadX = endX - ARROW_HEAD_LENGTH_MM * Math.cos(arrowAngle + ARROW_HEAD_HALF_ANGLE_RADIANS);
          const secondHeadY = endY - ARROW_HEAD_LENGTH_MM * Math.sin(arrowAngle + ARROW_HEAD_HALF_ANGLE_RADIANS);
          pdf.line(endX, endY, firstHeadX, firstHeadY);
          pdf.line(endX, endY, secondHeadX, secondHeadY);
        }
      } else {
        const drawingStyle = element.fillColor && element.strokeColor ? "FD" : element.fillColor ? "F" : "S";
        if (element.fillColor) pdf.setFillColor(...annotationColor(element.fillColor, opacity));
        pdf.roundedRect(x, y, width, height, 3, 3, drawingStyle);
        if (element.shape === "callout") {
          if (element.fillColor) pdf.setFillColor(...annotationColor(element.fillColor, opacity));
          pdf.triangle(x + 18, y + height, x + 30, y + height, x + 24, y + height + 8, drawingStyle);
          pdf.setTextColor(...annotationColor(element.textColor, opacity));
          pdf.setFont("helvetica", element.fontWeight === "bold" ? "bold" : "normal");
          pdf.setFontSize(planCanvasFontSizeToPdfPoints(element.fontSize ?? 9));
          const alignment = element.textAlign ?? "left";
          const textX = alignment === "left" ? x + 6 : alignment === "center" ? x + width / 2 : x + width - 6;
          pdf.text(pdf.splitTextToSize(element.text?.[locale] ?? "", Math.max(1, width - 12)), textX, y + 10, { align: alignment });
        }
      }
    } else if (element.kind === "title_block") {
      const { titleBlock } = PLAN_PRESENTATION;
      pdf.setDrawColor(18, 36, 31); pdf.roundedRect(x, y, width, height, 3, 3, "S"); pdf.setTextColor(18, 36, 31); pdf.setFont("helvetica", "bold"); pdf.setFontSize(planCanvasFontSizeToPdfPoints(titleBlock.titleFontSize)); pdf.text(element.projectNameText?.[locale] ?? project.name, x + 8, y + 14); pdf.setFont("helvetica", "normal"); pdf.setFontSize(planCanvasFontSizeToPdfPoints(titleBlock.bodyFontSize)); pdf.text(element.coordinatorText?.[locale] ?? project.participants.find((participant) => participant.role === "coordinator")?.name ?? "—", x + 8, y + 28); pdf.text(element.referenceText?.[locale] ?? `${project.projectNumber} · A0`, x + 8, y + 41);
    }
  }

  return pdf;
}

export async function exportPlanPdf(
  project: Project,
  plan: Plan,
  blocks: BuildingBlock[],
  categories: BuildingBlockCategory[],
  locale: Locale,
  revision?: PlanRevision,
): Promise<void> {
  const blocksWithImages = await hydrateBlockImages(blocks);
  const assets = await Promise.all(project.assets.map(async (asset) => ({
    ...asset,
    dataUrl: await blobDataUrl(asset.blobId, asset.dataUrl),
    previewDataUrl: await blobDataUrl(asset.previewBlobId, asset.previewDataUrl),
  })));
  const assetPreviewByElement = new Map<string, string>();
  const pdfPageAspectRatioByElement = new Map<string, number>();
  const imageElements = plan.layout.elements.filter((element): element is PlanAssetElement => element.kind === "image" && element.fitMode === "cover");
  await Promise.all(imageElements.map(async (element) => {
    const asset = project.assets.find((candidate) => candidate.id === element.assetId); if (!asset) return;
    const blob = asset.blobId ? await getBlob(asset.blobId) : asset.dataUrl ? await (await fetch(asset.dataUrl)).blob() : undefined;
    if (!blob) return;
    try {
      assetPreviewByElement.set(element.id, await cropImageForElement(blob, element));
    } catch {
      // A corrupt legacy image must not make the complete plan impossible to export.
    }
  }));
  const pdfPageElements = plan.layout.elements.filter(
    (element): element is PlanAssetElement => element.kind === "pdf_page",
  );
  const renderPdfPagesWithMetadata = pdfPageElements.length > 0
    ? (await import("../documents/pdfPreview")).renderPdfPagesWithMetadata
    : undefined;
  const pdfElementsByAsset = new Map<string, PlanAssetElement[]>();
  pdfPageElements.forEach((element) => pdfElementsByAsset.set(
    element.assetId,
    [...(pdfElementsByAsset.get(element.assetId) ?? []), element],
  ));
  await Promise.all([...pdfElementsByAsset.entries()].map(async ([assetId, elements]) => {
    const asset = project.assets.find((candidate) => candidate.id === assetId);
    if (!asset?.blobId && !asset?.dataUrl) return;
    const blob = asset.blobId ? await getBlob(asset.blobId) : await (await fetch(asset.dataUrl as string)).blob(); if (!blob) return;
    if (!renderPdfPagesWithMetadata) return;
    try {
      const renderedPages = await renderPdfPagesWithMetadata(blob, elements.map((element) => {
        const elementWidthMillimetres = element.width / 10;
        return {
          pageNumber: element.pageNumber ?? 1,
          targetWidth: Math.min(
            MAXIMUM_PDF_EXPORT_WIDTH_PX,
            Math.max(MINIMUM_PDF_EXPORT_WIDTH_PX, Math.ceil(elementWidthMillimetres / 25.4 * PDF_EXPORT_RASTER_DPI)),
          ),
        };
      }));
      elements.forEach((element, index) => {
        const renderedPage = renderedPages[index];
        if (!renderedPage) return;
        assetPreviewByElement.set(element.id, renderedPage.dataUrl);
        pdfPageAspectRatioByElement.set(element.id, renderedPage.width / renderedPage.height);
      });
    } catch {
      // Keep the labelled PDF placeholder when a source page cannot be decoded.
    }
  }));
  buildPlanPdf({ ...project, assets }, plan, blocksWithImages, categories, locale, revision, assetPreviewByElement, pdfPageAspectRatioByElement)
    .save(`${safeFilename(project.projectNumber)}-sige-plan-${revision?.index ?? "draft"}.pdf`);
}

function blockDetailsCell(description: string, regulationLabel: string, regulations: string): TableCell {
  return new TableCell({
    margins: { top: 120, bottom: 120, left: 140, right: 140 },
    children: [
      new Paragraph({ children: [new TextRun({ text: description, size: 20 })], spacing: { after: 120 } }),
      new Paragraph({
        children: [
          new TextRun({ text: `${regulationLabel}: `, bold: true, size: 18, color: "12241F" }),
          new TextRun({ text: regulations, size: 18, color: "53615C" }),
        ],
      }),
    ],
  });
}

export function buildPlanDocxDocument(
  project: Project,
  plan: Plan,
  blocks: BuildingBlock[],
  categories: BuildingBlockCategory[],
  locale: Locale,
  revision?: PlanRevision,
): Document {
  const blockMap = getBlockMap(blocks);
  const categoryMap = getCategoryMap(categories);
  const children: (Paragraph | Table)[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: locale === "de" ? "Sicherheits- und Gesundheitsschutzplan" : "Safety and Health Plan", bold: true, color: "12241F" })],
    }),
    new Paragraph({
      children: [new TextRun({ text: `${project.projectNumber} · ${project.name}`, bold: true, color: "12241F" })],
      spacing: { after: 80 },
    }),
    new Paragraph({ children: [new TextRun({ text: `${project.address}, ${project.city}` })], spacing: { after: 80 } }),
    new Paragraph({
      children: [new TextRun({
        text: `${locale === "de" ? "Dokumentsprache" : "Document language"}: ${locale.toUpperCase()} · ${revision ? `Revision ${revision.index} · ${new Date(revision.publishedAt).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB")}` : locale === "de" ? "Arbeitsstand" : "Working draft"}`,
        color: "53615C",
      })],
      spacing: { after: 360 },
    }),
    ...((project.assets ?? []).some((asset) => (plan.includedAssetIds ?? []).includes(asset.id)) ? [
      new Paragraph({
        children: [new TextRun({
          text: `${locale === "de" ? "Projektdokumente" : "Project documents"}: ${(project.assets ?? []).filter((asset) => (plan.includedAssetIds ?? []).includes(asset.id)).map((asset) => asset.filename).join(" · ")}`,
          color: "53615C",
        })],
        spacing: { after: 240 },
      }),
    ] : []),
  ];

  plan.sections.forEach((section) => {
    if (section.items.length === 0) return;
    const category = categoryMap.get(section.categoryId);
    const categoryName = section.titleOverrides?.[locale] ?? category?.translations[locale].name ?? section.categoryId;
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      children: [new TextRun({ text: categoryName, bold: true, color: "12241F" })],
    }));
    for (const item of section.items) {
      const block = blockMap.get(item.blockId);
      if (!block) continue;
      const content = block.translations[locale] ?? block.translations.de;
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        keepNext: true,
        children: [new TextRun({ text: content.title, bold: true, color: "12241F" })],
      }));
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            cantSplit: true,
            children: [
              blockDetailsCell(
                content.longDescription,
                locale === "de" ? "Vorschriften" : "Regulations",
                block.regulations.join(" · "),
              ),
            ],
          }),
        ],
        borders: {
          top: { style: BorderStyle.SINGLE, color: "C7D0CC", size: 4 },
          bottom: { style: BorderStyle.SINGLE, color: "C7D0CC", size: 4 },
          left: { style: BorderStyle.SINGLE, color: "C7D0CC", size: 4 },
          right: { style: BorderStyle.SINGLE, color: "C7D0CC", size: 4 },
          insideVertical: { style: BorderStyle.SINGLE, color: "DDE3E0", size: 2 },
        },
      }));
      children.push(new Paragraph({ text: "", spacing: { after: 180 } }));
    }
  });

  return new Document({
    creator: "QuickSiGe",
    title: `${project.projectNumber} ${locale === "de" ? "Sicherheits- und Gesundheitsschutzplan" : "Safety and Health Plan"}`,
    description: "Generated from a QuickSiGe plan revision",
    styles: {
      default: { document: { run: { font: "Aptos", size: 21 }, paragraph: { spacing: { line: 280 } } } },
    },
    sections: [{
      properties: {
        page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } },
      },
      children,
    }],
  });
}

export async function exportPlanDocx(
  project: Project,
  plan: Plan,
  blocks: BuildingBlock[],
  categories: BuildingBlockCategory[],
  locale: Locale,
  revision?: PlanRevision,
): Promise<void> {
  const blob = await Packer.toBlob(buildPlanDocxDocument(project, plan, blocks, categories, locale, revision));
  downloadBlob(blob, `${safeFilename(project.projectNumber)}-sige-plan-${revision?.index ?? "draft"}.docx`);
}

interface SupportingCopy {
  title: string;
  subtitle: string;
}

const supportingCopy: Record<Locale, Record<Plan["supportingDocuments"][number]["type"], SupportingCopy>> = {
  de: {
    site_rules: { title: "Baustellengrundsätze", subtitle: "Verbindliche Grundregeln für dieses Bauvorhaben" },
    alarm_plan: { title: "Alarmplan", subtitle: "Melden · Retten · Sichern" },
    fire_safety: { title: "Verhalten im Brandfall", subtitle: "Ruhe bewahren und geordnet handeln" },
    first_aid: { title: "Erste Hilfe", subtitle: "Sofortmaßnahmen und wichtige Kontakte" },
    participants: { title: "Projektbeteiligte", subtitle: "Verantwortlichkeiten und Erreichbarkeit" },
    advance_notice: { title: "Vorankündigung", subtitle: "Projektangaben gemäß Baustellenverordnung" },
  },
  en: {
    site_rules: { title: "Site principles", subtitle: "Binding ground rules for this construction project" },
    alarm_plan: { title: "Emergency plan", subtitle: "Alert · Rescue · Secure" },
    fire_safety: { title: "Fire response", subtitle: "Stay calm and act in an orderly manner" },
    first_aid: { title: "First aid", subtitle: "Immediate actions and important contacts" },
    participants: { title: "Project participants", subtitle: "Responsibilities and contact information" },
    advance_notice: { title: "Advance notice", subtitle: "Project information for the construction authority" },
  },
};

const participantRoleCopy: Record<Locale, Record<Project["participants"][number]["role"], string>> = {
  de: {
    client: "Auftraggeber",
    owner: "Bauherr",
    coordinator: "SiGe-Koordination",
    architect: "Architektur",
    planner: "Fachplanung",
    site_manager: "Bauleitung",
    contractor: "Auftragnehmer",
  },
  en: {
    client: "Client",
    owner: "Owner",
    coordinator: "Safety coordination",
    architect: "Architecture",
    planner: "Specialist planning",
    site_manager: "Site management",
    contractor: "Contractor",
  },
};

const constructionTypeCopy: Record<Locale, Record<Project["constructionType"], string>> = {
  de: { new_build: "Neubau", renovation: "Sanierung", demolition: "Abbruch" },
  en: { new_build: "New build", renovation: "Renovation", demolition: "Demolition" },
};

function drawA4Header(pdf: jsPDF, project: Project, copy: SupportingCopy, locale: Locale): number {
  pdf.setFillColor(18, 36, 31);
  pdf.rect(0, 0, 210, 46, "F");
  pdf.setTextColor(213, 255, 63);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("QUICKSiGe", 16, 14);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(24);
  pdf.text(copy.title, 16, 29);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(copy.subtitle, 16, 38);
  pdf.text(`${project.projectNumber} · ${project.name}`, 194, 17, { align: "right" });
  pdf.text(`${project.address}, ${project.city}`, 194, 28, { align: "right" });
  pdf.text(new Date().toLocaleDateString(locale === "de" ? "de-DE" : "en-GB"), 194, 38, { align: "right" });
  pdf.setTextColor(28, 43, 38);
  return 58;
}

function drawRows(pdf: jsPDF, rows: Array<[string, string]>, startY: number): number {
  let y = startY;
  for (const [label, value] of rows) {
    const valueLines = pdf.splitTextToSize(value || "—", 111);
    const rowHeight = Math.max(12, valueLines.length * 5 + 6);
    pdf.setFillColor(242, 245, 243);
    pdf.roundedRect(16, y, 50, rowHeight, 2, 2, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.text(label, 20, y + 7);
    pdf.setFont("helvetica", "normal");
    pdf.text(valueLines, 72, y + 7);
    y += rowHeight + 3;
  }
  return y;
}

export function buildSupportingDocumentPdf(project: Project, type: Plan["supportingDocuments"][number]["type"], locale: Locale): jsPDF {
  const copy = supportingCopy[locale][type];
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  let y = drawA4Header(pdf, project, copy, locale);
  pdf.setTextColor(28, 43, 38);

  if (type === "alarm_plan" || type === "first_aid") {
    const rows: Array<[string, string]> = project.emergencyContacts.map((contact) => [contact.label, `${contact.name} · ${contact.phone}`]);
    y = drawRows(pdf, rows, y);
    pdf.setFillColor(213, 255, 63);
    pdf.roundedRect(16, y + 8, 178, 38, 3, 3, "F");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(locale === "de" ? "Notruf: Wo? Was? Wie viele? Welche Verletzungen? Warten!" : "Emergency call: Where? What? How many? What injuries? Wait!", 22, y + 23);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(locale === "de" ? "Unfallstelle sichern · Eigenschutz beachten · Einweisen · Verletzte nicht allein lassen" : "Secure the scene · Protect yourself · Guide responders · Do not leave injured people alone", 22, y + 35);
  } else if (type === "participants") {
    drawRows(pdf, project.participants.map((participant) => [participantRoleCopy[locale][participant.role], `${participant.name}\n${participant.company}\n${participant.phone} · ${participant.email}`]), y);
  } else if (type === "advance_notice") {
    const coordinator = project.participants.find((participant) => participant.role === "coordinator");
    const owner = project.participants.find((participant) => participant.role === "owner");
    drawRows(pdf, [
      [locale === "de" ? "Baustelle" : "Construction site", `${project.address}, ${project.city}`],
      [locale === "de" ? "Bauherr" : "Client", owner ? `${owner.name}, ${owner.company}` : "—"],
      [locale === "de" ? "Art" : "Type", constructionTypeCopy[locale][project.constructionType]],
      [locale === "de" ? "Koordinator" : "Coordinator", coordinator ? `${coordinator.name}, ${coordinator.company}` : "—"],
      [locale === "de" ? "Zeitraum" : "Period", `${project.startDate} – ${project.endDate}`],
    ], y);
  } else {
    const items = type === "site_rules"
      ? locale === "de"
        ? ["Zutritt nur für befugte Personen", "Vorgeschriebene persönliche Schutzausrüstung benutzen", "Verkehrs- und Rettungswege freihalten", "Änderungen und Gefährdungen unverzüglich melden", "Alkohol und berauschende Mittel sind verboten"]
        : ["Access for authorized persons only", "Use required personal protective equipment", "Keep traffic and escape routes clear", "Report changes and hazards immediately", "Alcohol and intoxicating substances are prohibited"]
      : locale === "de"
        ? ["Ruhe bewahren", "Brand über 112 melden", "Gefährdete Personen warnen und Hilflose mitnehmen", "Gekennzeichneten Fluchtwegen folgen", "Löschversuch nur ohne Eigengefährdung unternehmen"]
        : ["Stay calm", "Report the fire via 112", "Warn people at risk and assist anyone needing help", "Follow marked escape routes", "Only attempt firefighting without putting yourself at risk"];
    items.forEach((item, index) => {
      pdf.setFillColor(index === 0 ? 213 : 242, index === 0 ? 255 : 245, index === 0 ? 63 : 243);
      pdf.circle(25, y + 6, 7, "F");
      pdf.setTextColor(18, 36, 31);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(String(index + 1), 25, y + 9, { align: "center" });
      pdf.setFontSize(12);
      pdf.text(pdf.splitTextToSize(item, 148), 39, y + 9);
      y += 27;
    });
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(100, 112, 107);
  pdf.text(locale === "de" ? "Aus QuickSiGe-Projektdaten erzeugt · Vor Aushang fachlich prüfen" : "Generated from QuickSiGe project data · Review professionally before posting", 105, 286, { align: "center" });
  return pdf;
}

export function exportSupportingDocumentPdf(project: Project, type: Plan["supportingDocuments"][number]["type"], locale: Locale): void {
  buildSupportingDocumentPdf(project, type, locale)
    .save(`${safeFilename(project.projectNumber)}-${type.replaceAll("_", "-")}.pdf`);
}
