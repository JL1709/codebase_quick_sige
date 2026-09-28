import { createReport, listCommands } from "docx-templates/lib/browser.js";
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, ShadingType,
  Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} from "docx";
import JSZip from "jszip";
import type {
  BuildingBlock, BuildingBlockCategory, DocumentType, Locale, Plan, Project,
  ProjectDocumentConfiguration,
} from "../domain/types";
import { blockHierarchyColor, categoryHierarchyColor, categoryTrail } from "../domain/categoryTree";
import { overviewSectionTemplateData } from "../domain/overviewTemplates";

const COMMAND_DELIMITER: [string, string] = ["{{", "}}"];
const SAFE_PATH = /^(qs(?:\.[A-Za-z_][A-Za-z0-9_]*)+|\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|\$idx)$/;
const SAFE_LOOP = /^([A-Za-z_][A-Za-z0-9_]*)\s+IN\s+(qs(?:\.[A-Za-z_][A-Za-z0-9_]*)+|\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)$/;
const SAFE_LOOP_END = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAXIMUM_LOOP_NESTING = 3;
export const MAX_TEMPLATE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TEMPLATE_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
export const MAX_TEMPLATE_ZIP_ENTRIES = 400;
const MAX_TEMPLATE_COMPRESSION_RATIO = 40;
const WORD_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const UNSAFE_PACKAGE_PATH = /(^|\/)(vbaProject\.bin|activeX|embeddings)(\/|$)/i;
const EXTERNAL_RELATIONSHIP = /TargetMode\s*=\s*["']External["']/i;
const XML_TEXT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
const XML_ENTITY_MAP: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };
const FRIENDLY_PLACEHOLDER = /\{\{\s*([#/])?\s*(qs(?:\.[A-Za-z_][A-Za-z0-9_]*)+)\s*\}\}/g;
const LEGACY_AUTHOR_COMMAND = /\{\{\s*(?:FOR|END-FOR|INS|IMAGE)\b[^{}]*\}\}/gi;
const DYNAMIC_CELL_FILL = /\[\[QS_CELL_FILL:([0-9A-F]{6})\]\]/gi;
const FALLBACK_CATEGORY_COLOR = "496F5F";
const A4_PAGE_WIDTH_DXA = 11_906;
const A4_PAGE_HEIGHT_DXA = 16_838;
const A4_PAGE_MARGIN_DXA = 720;
const A4_CONTENT_WIDTH_DXA = A4_PAGE_WIDTH_DXA - (2 * A4_PAGE_MARGIN_DXA);
const BLOCK_IMAGE_COLUMN_WIDTH_DXA = 3_500;
const BLOCK_DESCRIPTION_COLUMN_WIDTH_DXA = A4_CONTENT_WIDTH_DXA - BLOCK_IMAGE_COLUMN_WIDTH_DXA;
const BLOCK_IMAGE_WIDTH_CM = 5.4;
const BLOCK_IMAGE_HEIGHT_CM = 3.6;
const FRIENDLY_LOOP_VARIABLES: Record<string, string> = {
  "qs.emergency_contacts": "contact",
  "qs.participants": "participant",
  "qs.plan.categories": "category",
  "qs.category.sections": "section",
  "qs.section.blocks": "block",
  "qs.plan.sections": "section",
  "qs.plan.blocks": "block",
};

export interface TemplateInspection {
  placeholders: string[];
  missingPlaceholders: string[];
  unsafeCommands: string[];
}

export interface TemplateFileValidation extends TemplateInspection {
  valid: boolean;
  errors: string[];
  warnings: string[];
  byteSize: number;
  entryCount: number;
  uncompressedBytes: number;
}

type TemplateData = Record<string, unknown>;

interface FriendlyLoopScope {
  path: string;
  variable: string;
}

interface XmlTextNode {
  contentStart: number;
  contentEnd: number;
  plainStart: number;
  plainEnd: number;
  text: string;
}

function decodeXmlText(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITY_MAP[entity] ?? entity);
}

function encodeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rewriteXmlTextMatches(
  fragment: string,
  expression: RegExp,
  replacement: (match: RegExpMatchArray) => string,
): string {
  const nodes: XmlTextNode[] = [];
  let plainLength = 0;
  for (const match of fragment.matchAll(XML_TEXT)) {
    const text = decodeXmlText(match[1]);
    const contentStart = (match.index ?? 0) + match[0].indexOf(match[1]);
    nodes.push({
      contentStart,
      contentEnd: contentStart + match[1].length,
      plainStart: plainLength,
      plainEnd: plainLength + text.length,
      text,
    });
    plainLength += text.length;
  }
  if (!nodes.length) return fragment;

  const plainText = nodes.map((node) => node.text).join("");
  const matches = [...plainText.matchAll(expression)];
  const replacements = matches.map((match) => replacement(match));
  for (let matchIndex = matches.length - 1; matchIndex >= 0; matchIndex -= 1) {
    const match = matches[matchIndex];
    const matchStart = match.index ?? 0;
    const matchEnd = matchStart + match[0].length;
    const firstNodeIndex = nodes.findIndex((node) => matchStart >= node.plainStart && matchStart < node.plainEnd);
    const lastNodeIndex = nodes.findIndex((node) => matchEnd > node.plainStart && matchEnd <= node.plainEnd);
    if (firstNodeIndex < 0 || lastNodeIndex < 0) continue;
    const firstNode = nodes[firstNodeIndex];
    const lastNode = nodes[lastNodeIndex];
    const localStart = matchStart - firstNode.plainStart;
    const localEnd = matchEnd - lastNode.plainStart;
    if (firstNodeIndex === lastNodeIndex) {
      firstNode.text = `${firstNode.text.slice(0, localStart)}${replacements[matchIndex]}${firstNode.text.slice(localEnd)}`;
      continue;
    }
    firstNode.text = `${firstNode.text.slice(0, localStart)}${replacements[matchIndex]}`;
    for (let nodeIndex = firstNodeIndex + 1; nodeIndex < lastNodeIndex; nodeIndex += 1) nodes[nodeIndex].text = "";
    lastNode.text = lastNode.text.slice(localEnd);
  }

  let rewritten = fragment;
  for (let nodeIndex = nodes.length - 1; nodeIndex >= 0; nodeIndex -= 1) {
    const node = nodes[nodeIndex];
    rewritten = `${rewritten.slice(0, node.contentStart)}${encodeXmlText(node.text)}${rewritten.slice(node.contentEnd)}`;
  }
  return rewritten;
}

function scopedTemplatePath(path: string, scopes: FriendlyLoopScope[]): string {
  const segments = path.split(".");
  const contextualVariable = segments[1];
  if (scopes.some((scope) => scope.variable === contextualVariable)) {
    return `$${contextualVariable}${segments.length > 2 ? `.${segments.slice(2).join(".")}` : ""}`;
  }
  return path;
}

function loopVariable(path: string): string {
  const knownVariable = FRIENDLY_LOOP_VARIABLES[path];
  if (knownVariable) return knownVariable;
  return path.split(".").at(-1) ?? "item";
}

function friendlyCommand(match: RegExpMatchArray, scopes: FriendlyLoopScope[]): string {
  const marker = match[1];
  const path = match[2];
  if (marker === "#") {
    const variable = loopVariable(path);
    const collectionPath = scopedTemplatePath(path, scopes);
    scopes.push({ path, variable });
    return `{{FOR ${variable} IN ${collectionPath}}}`;
  }
  if (marker === "/") {
    const scope = scopes.at(-1);
    if (!scope || scope.path !== path) return match[0];
    scopes.pop();
    return `{{END-FOR ${scope.variable}}}`;
  }

  let valuePath = scopedTemplatePath(path, scopes);
  const lastSegment = path.split(".").at(-1);
  if (lastSegment === "color" && valuePath.startsWith("$")) valuePath = `${valuePath.slice(0, -"color".length)}cell_fill`;
  return `{{${lastSegment === "image" ? "IMAGE" : "INS"} ${valuePath}}}`;
}

async function normalizeTemplateSyntax(template: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(template);
  const xmlNames = Object.keys(zip.files).filter((name) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(name));
  for (const name of xmlNames) {
    const file = zip.file(name);
    if (!file) continue;
    const scopes: FriendlyLoopScope[] = [];
    const xml = await file.async("text");
    const rewritten = xml.replace(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g, (paragraph) => (
      rewriteXmlTextMatches(paragraph, FRIENDLY_PLACEHOLDER, (match) => friendlyCommand(match, scopes))
    ));
    if (rewritten !== xml) zip.file(name, rewritten);
  }
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

async function findLegacyAuthorCommands(template: ArrayBuffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(template);
  const xmlNames = Object.keys(zip.files).filter((name) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(name));
  const commands: string[] = [];
  for (const name of xmlNames) {
    const xml = await zip.file(name)?.async("text");
    if (!xml) continue;
    for (const paragraph of xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
      const text = [...paragraph[0].matchAll(XML_TEXT)].map((match) => decodeXmlText(match[1])).join("");
      commands.push(...[...text.matchAll(LEGACY_AUTHOR_COMMAND)].map((match) => match[0]));
      LEGACY_AUTHOR_COMMAND.lastIndex = 0;
    }
  }
  return commands;
}

function setTableCellFill(cell: string, fill: string): string {
  const shading = `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
  if (/<w:shd\b/.test(cell)) return cell.replace(/<w:shd\b[^>]*(?:\/>|>[\s\S]*?<\/w:shd>)/, shading);
  if (/<w:tcPr\s*\/>/.test(cell)) return cell.replace(/<w:tcPr\s*\/>/, `<w:tcPr>${shading}</w:tcPr>`);
  if (/<w:tcPr(?:\s[^>]*)?>/.test(cell)) return cell.replace(/<w:tcPr(?:\s[^>]*)?>/, (properties) => `${properties}${shading}`);
  return cell.replace(/<w:tc(?:\s[^>]*)?>/, (opening) => `${opening}<w:tcPr>${shading}</w:tcPr>`);
}

function setParagraphFill(paragraph: string, fill: string): string {
  const shading = `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>`;
  if (/<w:shd\b/.test(paragraph)) return paragraph.replace(/<w:shd\b[^>]*(?:\/>|>[\s\S]*?<\/w:shd>)/, shading);
  if (/<w:pPr\s*\/>/.test(paragraph)) return paragraph.replace(/<w:pPr\s*\/>/, `<w:pPr>${shading}</w:pPr>`);
  if (/<w:pPr(?:\s[^>]*)?>/.test(paragraph)) return paragraph.replace(/<w:pPr(?:\s[^>]*)?>/, (properties) => `${properties}${shading}`);
  return paragraph.replace(/<w:p(?:\s[^>]*)?>/, (opening) => `${opening}<w:pPr>${shading}</w:pPr>`);
}

interface XmlElementSpan {
  start: number;
  end: number;
}

function findXmlElementSpans(xml: string, elementName: "p" | "tc"): XmlElementSpan[] {
  const elementTokens = new RegExp(`<w:${elementName}(?:\\s[^>]*)?>|<\\/w:${elementName}>`, "g");
  const openElements: number[] = [];
  const spans: XmlElementSpan[] = [];
  for (const token of xml.matchAll(elementTokens)) {
    const tokenStart = token.index ?? 0;
    if (token[0].startsWith("</")) {
      const elementStart = openElements.pop();
      if (elementStart !== undefined) spans.push({ start: elementStart, end: tokenStart + token[0].length });
    } else {
      openElements.push(tokenStart);
    }
  }
  return spans;
}

function applyDynamicCellFillsToXml(xml: string): string {
  const cellSpans = findXmlElementSpans(xml, "tc");
  const paragraphSpans = findXmlElementSpans(xml, "p");
  const targets = new Map<number, XmlElementSpan & { kind: "cell" | "paragraph" }>();
  for (const marker of xml.matchAll(DYNAMIC_CELL_FILL)) {
    const markerPosition = marker.index ?? 0;
    const containingCells = cellSpans.filter((cell) => cell.start < markerPosition && cell.end > markerPosition);
    const innermostCell = containingCells.sort((left, right) => (left.end - left.start) - (right.end - right.start))[0];
    if (innermostCell) {
      targets.set(innermostCell.start, { ...innermostCell, kind: "cell" });
      continue;
    }
    const paragraph = paragraphSpans.find((candidate) => candidate.start < markerPosition && candidate.end > markerPosition);
    if (paragraph) targets.set(paragraph.start, { ...paragraph, kind: "paragraph" });
  }
  DYNAMIC_CELL_FILL.lastIndex = 0;

  let rewritten = xml;
  const orderedTargets = [...targets.values()].sort((left, right) => right.start - left.start);
  orderedTargets.forEach((target) => {
    const fragment = rewritten.slice(target.start, target.end);
    const visibleText = [...fragment.matchAll(XML_TEXT)].map((match) => decodeXmlText(match[1])).join("");
    const fill = /\[\[QS_CELL_FILL:([0-9A-F]{6})\]\]/i.exec(visibleText)?.[1]?.toUpperCase();
    if (!fill) return;
    const withoutMarker = rewriteXmlTextMatches(fragment, DYNAMIC_CELL_FILL, () => "");
    DYNAMIC_CELL_FILL.lastIndex = 0;
    const filledFragment = target.kind === "cell"
      ? setTableCellFill(withoutMarker, fill)
      : setParagraphFill(withoutMarker, fill);
    rewritten = `${rewritten.slice(0, target.start)}${filledFragment}${rewritten.slice(target.end)}`;
  });
  return rewritten;
}

async function applyDynamicCellFills(document: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(document);
  const xmlNames = Object.keys(zip.files).filter((name) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(name));
  for (const name of xmlNames) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("text");
    const rewritten = applyDynamicCellFillsToXml(xml);
    if (rewritten !== xml) zip.file(name, rewritten);
  }
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

function cellFillMarker(color: string): string {
  const normalized = color.replace("#", "").toUpperCase();
  return `[[QS_CELL_FILL:${/^[0-9A-F]{6}$/.test(normalized) ? normalized : FALLBACK_CATEGORY_COLOR}]]`;
}

async function applyControlledPageBreaks(template: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(template);
  const xmlNames = Object.keys(zip.files).filter((name) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(name));
  for (const name of xmlNames) {
    const file = zip.file(name); if (!file) continue;
    const xml = await file.async("text");
    const replaced = xml.replace(/<w:t([^>]*)>\{\{PAGEBREAK\}\}<\/w:t>/g, "<w:t$1></w:t></w:r><w:r><w:br w:type=\"page\"/>");
    if (replaced !== xml) zip.file(name, replaced);
  }
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function documentDependencyFingerprint(project: Project, locale: Locale, plan?: Plan): string {
  const payload = stableStringify({ locale, project, plan });
  let hash = 2_166_136_261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizePlaceholderKey(value: string, fallback: string): string {
  const normalized = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return normalized || fallback;
}

function dataUrlImage(
  dataUrl?: string,
  dimensions: { width: number; height: number } = { width: 4.8, height: 3.2 },
): { data: string; extension: ".png" | ".jpg"; width: number; height: number } | undefined {
  if (!dataUrl) return undefined;
  const match = /^data:image\/(png|jpeg);base64,(.+)$/i.exec(dataUrl);
  if (!match) return undefined;
  return { data: match[2], extension: match[1].toLowerCase() === "png" ? ".png" : ".jpg", ...dimensions };
}

export function buildTemplateData(
  project: Project,
  plan: Plan | undefined,
  locale: Locale,
  blocks: BuildingBlock[],
  categories: BuildingBlockCategory[] = [],
  documentConfigurations: ProjectDocumentConfiguration[] = [],
): TemplateData {
  const constructionTypeLabels: Record<Locale, Record<Project["constructionType"], string>> = {
    de: { new_build: "Neubau", renovation: "Sanierung / Umbau", demolition: "Abbruch" },
    en: { new_build: "New build", renovation: "Renovation", demolition: "Demolition" },
  };
  const participantRoleLabels: Record<Locale, Record<Project["participants"][number]["role"], string>> = {
    de: { client: "Auftraggeber", owner: "Bauherr", coordinator: "SiGe-Koordination", architect: "Architektur", planner: "Fachplanung", site_manager: "Bauleitung", contractor: "Auftragnehmer" },
    en: { client: "Client", owner: "Owner", coordinator: "Safety coordination", architect: "Architecture", planner: "Specialist planning", site_manager: "Site management", contractor: "Contractor" },
  };
  const projectFields: Record<string, unknown> = {
    number: project.projectNumber, name: project.name, description: project.description, address: project.address,
    city: project.city, construction_type: project.constructionType, start_date: project.startDate, end_date: project.endDate,
    construction_type_label: constructionTypeLabels[locale][project.constructionType], language: locale,
  };
  project.customFields.forEach((field, index) => { projectFields[field.placeholderKey || normalizePlaceholderKey(field.key, `field_${index + 1}`)] = field.value; });
  const customSections: Record<string, unknown> = {};
  project.customSections.forEach((section, sectionIndex) => {
    const values: Record<string, string> = {};
    section.fields.forEach((field, fieldIndex) => { values[field.placeholderKey || normalizePlaceholderKey(field.key, `field_${fieldIndex + 1}`)] = field.value; });
    customSections[section.placeholderKey || normalizePlaceholderKey(section.title, `section_${sectionIndex + 1}`)] = values;
  });
  project.overviewSections.forEach((section) => {
    customSections[section.placeholderKey] = overviewSectionTemplateData(section, locale);
  });
  const blockMap = new Map(blocks.map((block) => [block.id, block]));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const planLocale = locale;
  const semanticOrder = new Map(plan?.layout.elements.map((element) => [element.kind === "block" ? element.itemId : element.kind === "section" ? element.sectionId : element.id, element.semanticOrder ?? Number.MAX_SAFE_INTEGER]) ?? []);
  const orderedSections = plan ? [...plan.sections].sort((left, right) => (semanticOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (semanticOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)) : [];
  const planSections = orderedSections.map((section) => {
    const category = categoryMap.get(section.categoryId);
    const trail = categoryTrail(section.categoryId, categories);
    const trailTitles = trail.map((trailCategory) => trailCategory.translations[planLocale]?.name ?? trailCategory.id);
    const rootCategory = trail[0] ?? category;
    const sectionTitle = section.titleOverrides?.[planLocale] ?? category?.translations[planLocale]?.name ?? section.categoryId;
    const sectionHeading = section.titleOverrides?.[planLocale]
      ?? (trailTitles.length > 1 ? trailTitles.slice(1).join(" › ") : category?.translations[planLocale]?.description ?? sectionTitle);
    const sectionBlocks = [...section.items].sort((left, right) => (semanticOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (semanticOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)).map((item) => {
    const block = blockMap.get(item.blockId);
    if (!block) return null;
    const content = block.translations[planLocale] ?? block.translations.de;
    const blockColor = blockHierarchyColor(block, categories);
    return {
      category: sectionTitle,
      title: item.customTitle?.[planLocale] ?? content.title,
      a0_description: item.customShortDescription?.[planLocale] ?? content.shortDescription,
      a4_description: content.longDescription,
      short_description: item.customShortDescription?.[planLocale] ?? content.shortDescription,
      long_description: content.longDescription,
      regulations: block.regulations.join(", "),
      image: dataUrlImage(item.imageDataUrl ?? block.imageDataUrl, { width: BLOCK_IMAGE_WIDTH_CM, height: BLOCK_IMAGE_HEIGHT_CM }),
      color: blockColor,
      cell_fill: cellFillMarker(blockColor),
      expert_note: item.expertNote ?? "",
    };
    }).filter(Boolean);
    const rootCategoryId = rootCategory?.id ?? section.categoryId;
    const rootCategoryTitle = rootCategory?.translations[planLocale]?.name ?? sectionTitle;
    const rootCategoryColor = rootCategory
      ? categoryHierarchyColor(rootCategory.id, categories)
      : `#${FALLBACK_CATEGORY_COLOR}`;
    return {
      id: section.id,
      category_id: section.categoryId,
      title: sectionTitle,
      heading: sectionHeading,
      category_path: trailTitles.join(" › ") || sectionTitle,
      color: category ? categoryHierarchyColor(category.id, categories) : rootCategoryColor,
      root_category_id: rootCategoryId,
      root_category_title: rootCategoryTitle,
      root_category_color: rootCategoryColor,
      blocks: sectionBlocks,
    };
  }) ?? [];
  const planBlocks = planSections.flatMap((section) => section.blocks);
  const planCategories: Array<{ id: string; title: string; color: string; cell_fill: string; sections: typeof planSections }> = [];
  planSections.forEach((section) => {
    let category = planCategories.find((candidate) => candidate.id === section.root_category_id);
    if (!category) {
      category = {
        id: section.root_category_id,
        title: section.root_category_title,
        color: section.root_category_color,
        cell_fill: cellFillMarker(section.root_category_color),
        sections: [],
      };
      planCategories.push(category);
    }
    category.sections.push(section);
  });
  return {
    qs: {
      project: projectFields,
      overview: { ...projectFields, ...customSections },
      emergency_contacts: project.emergencyContacts.map((contact) => ({ label: contact.label, name: contact.name, phone: contact.phone })),
      participants: project.participants.map((participant) => ({ role: participant.role, role_label: participantRoleLabels[locale][participant.role], company: participant.company, name: participant.name, email: participant.email, phone: participant.phone })),
      plan: { title: plan ? (locale === "de" ? "Sicherheits- und Gesundheitsschutzplan" : "Safety and Health Plan") : "", categories: planCategories, sections: planSections, blocks: planBlocks },
      assets: project.assets.map((asset) => ({ filename: asset.filename, image: asset.mimeType.startsWith("image/") ? dataUrlImage(asset.dataUrl) : undefined })),
      documents: documentConfigurations.map((configuration) => ({ type: configuration.documentType, template_id: configuration.templateId })),
    },
  };
}

interface ZipEntryMetadata { encrypted: boolean; compressedSize: number; uncompressedSize: number }

function readZipEntryMetadata(buffer: ArrayBuffer): ZipEntryMetadata[] {
  const view = new DataView(buffer);
  const entries: ZipEntryMetadata[] = [];
  for (let offset = 0; offset <= view.byteLength - 46; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const flags = view.getUint16(offset + 8, true);
    entries.push({
      encrypted: (flags & 0x0001) !== 0,
      compressedSize: view.getUint32(offset + 20, true),
      uncompressedSize: view.getUint32(offset + 24, true),
    });
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 45 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function invalidImageCommandParagraphs(xml: string): string[] {
  const invalid: string[] = [];
  for (const paragraph of xml.matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)) {
    const text = [...paragraph[0].matchAll(XML_TEXT)]
      .map((match) => match[1].replace(/&(amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITY_MAP[entity] ?? entity))
      .join("")
      .trim();
    if (text.includes("{{IMAGE") && !/^\{\{IMAGE\s+(?:qs\.|\$)[^{}]+\}\}$/.test(text)) invalid.push(text);
  }
  return invalid;
}

export async function validateTemplateFile(
  template: ArrayBuffer,
  filename: string,
  mimeType = WORD_MIME_TYPE,
): Promise<TemplateFileValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!filename.toLowerCase().endsWith(".docx")) errors.push("Only .docx files are supported; macro-enabled .docm files are rejected.");
  if (mimeType && ![WORD_MIME_TYPE, "application/octet-stream", "application/zip"].includes(mimeType)) errors.push(`Unexpected MIME type: ${mimeType}`);
  if (template.byteLength > MAX_TEMPLATE_FILE_BYTES) errors.push(`Template exceeds ${MAX_TEMPLATE_FILE_BYTES / 1024 / 1024} MB.`);
  const bytes = new Uint8Array(template);
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) errors.push("The file is not a valid ZIP-based Word document.");

  const metadata = readZipEntryMetadata(template);
  const uncompressedBytes = metadata.reduce((total, entry) => total + entry.uncompressedSize, 0);
  if (metadata.some((entry) => entry.encrypted)) errors.push("Encrypted Word files are not supported.");
  if (metadata.length > MAX_TEMPLATE_ZIP_ENTRIES) errors.push(`Template contains more than ${MAX_TEMPLATE_ZIP_ENTRIES} package entries.`);
  if (uncompressedBytes > MAX_TEMPLATE_UNCOMPRESSED_BYTES) errors.push(`Expanded template exceeds ${MAX_TEMPLATE_UNCOMPRESSED_BYTES / 1024 / 1024} MB.`);
  if (metadata.some((entry) => entry.compressedSize > 0 && entry.uncompressedSize / entry.compressedSize > MAX_TEMPLATE_COMPRESSION_RATIO)) errors.push("Template contains an unsafe compression ratio.");

  let inspection: TemplateInspection = { placeholders: [], missingPlaceholders: [], unsafeCommands: [] };
  try {
    const zip = await JSZip.loadAsync(template, { checkCRC32: true });
    const names = Object.keys(zip.files);
    if (!zip.file("[Content_Types].xml") || !zip.file("word/document.xml")) errors.push("The package is missing required Word document parts.");
    if (names.some((name) => UNSAFE_PACKAGE_PATH.test(name))) errors.push("Macros, ActiveX controls, and embedded executable objects are not supported.");
    const relationshipNames = names.filter((name) => name.endsWith(".rels"));
    for (const relationshipName of relationshipNames) {
      const xml = await zip.file(relationshipName)?.async("text");
      if (xml && EXTERNAL_RELATIONSHIP.test(xml)) errors.push(`External relationship found in ${relationshipName}.`);
    }
    const normalizedTemplate = await normalizeTemplateSyntax(template);
    const normalizedZip = await JSZip.loadAsync(normalizedTemplate);
    const contentNames = names.filter((name) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(name));
    for (const contentName of contentNames) {
      const xml = await normalizedZip.file(contentName)?.async("text");
      if (!xml) continue;
      invalidImageCommandParagraphs(xml).forEach((text) => errors.push(`Image command must be alone in its paragraph or table cell: ${text}`));
    }
    inspection = await inspectTemplate(template, {});
    if (inspection.unsafeCommands.length) errors.push(...inspection.unsafeCommands.map((command) => `Unsupported template command: ${command}`));
  } catch (error) {
    errors.push(error instanceof Error ? `Malformed Word package: ${error.message}` : "Malformed Word package.");
  }
  return {
    ...inspection,
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings,
    byteSize: template.byteLength,
    entryCount: metadata.length,
    uncompressedBytes,
  };
}

function resolvePath(data: TemplateData, path: string): { exists: boolean; value: unknown } {
  const segments = path.split(".");
  let current: unknown = data;
  for (const segment of segments) {
    if (!current || typeof current !== "object" || !(segment in current)) return { exists: false, value: undefined };
    current = (current as Record<string, unknown>)[segment];
  }
  return { exists: true, value: current };
}

export async function inspectTemplate(template: ArrayBuffer, data: TemplateData): Promise<TemplateInspection> {
  const legacyAuthorCommands = await findLegacyAuthorCommands(template);
  const normalizedTemplate = await normalizeTemplateSyntax(template);
  const commands = await listCommands(await applyControlledPageBreaks(normalizedTemplate), COMMAND_DELIMITER);
  const placeholders = new Set<string>();
  const missing = new Set<string>();
  const unsafe = new Set(legacyAuthorCommands);
  const loopStack: Array<{ path: string; variable: string; entries: unknown[] }> = [];
  const resolveValues = (path: string): { exists: boolean; values: unknown[] } => {
    if (path.startsWith("qs.")) {
      const resolved = resolvePath(data, path);
      return { exists: resolved.exists, values: resolved.exists ? [resolved.value] : [] };
    }
    const [variable, ...segments] = path.slice(1).split(".");
    const scope = [...loopStack].reverse().find((candidate) => candidate.variable === variable);
    if (!scope) return { exists: false, values: [] };
    if (!segments.length) return { exists: true, values: scope.entries };
    if (!scope.entries.length) return { exists: true, values: [] };
    const resolved = scope.entries.map((entry) => resolvePath(entry as TemplateData, segments.join(".")));
    return { exists: resolved.every((entry) => entry.exists), values: resolved.filter((entry) => entry.exists).map((entry) => entry.value) };
  };
  commands.forEach((command) => {
    const code = command.code.trim();
    if (["INS", "IMAGE"].includes(command.type)) {
      if (!SAFE_PATH.test(code)) { unsafe.add(command.raw); return; }
      placeholders.add(code);
      if (!resolveValues(code).exists) missing.add(code);
      return;
    }
    if (command.type === "FOR") {
      const match = SAFE_LOOP.exec(code);
      if (!match) { unsafe.add(command.raw); return; }
      if (loopStack.length >= MAXIMUM_LOOP_NESTING) { unsafe.add(`${command.raw} (loop nesting is limited to ${MAXIMUM_LOOP_NESTING} levels)`); return; }
      if (loopStack.some((scope) => scope.variable === match[1])) { unsafe.add(`${command.raw} (duplicate loop variable)`); return; }
      placeholders.add(match[2]);
      const collection = resolveValues(match[2]);
      if (!collection.exists) missing.add(match[2]);
      loopStack.push({ path: match[2], variable: match[1], entries: collection.values.flatMap((value) => Array.isArray(value) ? value : []) });
      return;
    }
    if (command.type === "END-FOR" && SAFE_LOOP_END.test(code)) {
      if (loopStack.at(-1)?.variable !== code) { unsafe.add(`${command.raw} (unmatched loop end)`); return; }
      loopStack.pop(); return;
    }
    unsafe.add(command.raw);
  });
  loopStack.forEach(({ path }) => unsafe.add(`Missing closing loop marker for ${path}`));
  return { placeholders: [...placeholders], missingPlaceholders: [...missing], unsafeCommands: [...unsafe] };
}

export async function renderTemplate(template: ArrayBuffer, data: TemplateData): Promise<Blob> {
  const inspection = await inspectTemplate(template, data);
  if (inspection.unsafeCommands.length) throw new Error(`Unsafe template commands: ${inspection.unsafeCommands.join(", ")}`);
  const friendlyTemplate = await normalizeTemplateSyntax(template);
  const normalizedTemplate = await applyControlledPageBreaks(friendlyTemplate);
  const report = await createReport({
    template: new Uint8Array(normalizedTemplate), data, cmdDelimiter: COMMAND_DELIMITER, rejectNullish: false,
    // Every command is restricted to a property path before execution, so the direct evaluator
    // avoids the browser-only vm shim without exposing arbitrary template JavaScript.
    failFast: false, processLineBreaks: true, noSandbox: true,
  });
  const reportBuffer = report.buffer.slice(report.byteOffset, report.byteOffset + report.byteLength) as ArrayBuffer;
  const styledReport = await applyDynamicCellFills(reportBuffer);
  return new Blob([styledReport], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function standardA4Template(locale: Locale): Document {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" };
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const tableBorders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder };
  const placeholder = (path: string, options: { bold?: boolean; color?: string; size?: number } = {}) => new TextRun({
    text: `{{${path}}}`,
    bold: options.bold,
    color: options.color ?? "296C5D",
    font: "Arial",
    size: options.size,
  });
  const control = (marker: string) => new Paragraph({ spacing: { before: 0, after: 0 }, children: [placeholder(marker, { size: 16 })] });
  const categoryHeader = new Paragraph({
    keepNext: true,
    shading: { fill: "496F5F", type: ShadingType.CLEAR },
    spacing: { before: 120, after: 120 },
    children: [
      new TextRun({ text: "  ", font: "Arial", size: 28 }),
      placeholder("qs.category.color", { color: "FFFFFF", size: 28 }),
      placeholder("qs.category.title", { bold: true, color: "FFFFFF", size: 28 }),
    ],
  });
  const sectionHeader = new Paragraph({
    keepNext: true,
    shading: { fill: "E7F1ED", type: ShadingType.CLEAR },
    spacing: { before: 90, after: 90 },
    children: [
      new TextRun({ text: "  ", font: "Arial", size: 22 }),
      placeholder("qs.section.heading", { bold: true, color: "10251F", size: 22 }),
    ],
  });
  const blockCardContents = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: [BLOCK_IMAGE_COLUMN_WIDTH_DXA, BLOCK_DESCRIPTION_COLUMN_WIDTH_DXA],
    borders: tableBorders,
    rows: [
      new TableRow({ cantSplit: true, children: [new TableCell({
        columnSpan: 2,
        shading: { fill: "D5FF3F", type: ShadingType.CLEAR },
        margins: { top: 90, bottom: 90, left: 150, right: 150 },
        children: [new Paragraph({ keepNext: true, spacing: { before: 0, after: 0 }, children: [
          placeholder("qs.block.color", { color: "10251F", size: 22 }),
          placeholder("qs.block.title", { bold: true, color: "10251F", size: 22 }),
        ] })],
      })] }),
      new TableRow({ cantSplit: true, children: [
        new TableCell({
          width: { size: BLOCK_IMAGE_COLUMN_WIDTH_DXA, type: WidthType.DXA },
          margins: { top: 140, bottom: 140, left: 140, right: 140 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ keepNext: true, alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [placeholder("qs.block.image", { size: 18 })] })],
        }),
        new TableCell({
          width: { size: BLOCK_DESCRIPTION_COLUMN_WIDTH_DXA, type: WidthType.DXA },
          margins: { top: 160, bottom: 160, left: 170, right: 170 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ keepNext: true, spacing: { before: 0, after: 0, line: 276 }, children: [placeholder("qs.block.a4_description", { color: "263A34", size: 20 })] })],
        }),
      ] }),
      new TableRow({ cantSplit: true, children: [new TableCell({
        columnSpan: 2,
        shading: { fill: "F7F9F8", type: ShadingType.CLEAR },
        margins: { top: 70, bottom: 70, left: 150, right: 150 },
        children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [placeholder("qs.block.regulations", { color: "5B6A65", size: 17 })] })],
      })] }),
    ],
  });
  const blockCard = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    columnWidths: [A4_CONTENT_WIDTH_DXA],
    borders: noBorders,
    rows: [new TableRow({ cantSplit: true, children: [new TableCell({
      width: { size: A4_CONTENT_WIDTH_DXA, type: WidthType.DXA },
      borders: noBorders,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      children: [blockCardContents],
    })] })],
  });
  return new Document({
    creator: "QuickSiGe",
    title: locale === "de" ? "QuickSiGe A4 Vorlage" : "QuickSiGe A4 Template",
    styles: { default: { document: { run: { font: "Arial", size: 20, color: "263A34" }, paragraph: { spacing: { after: 80 } } } } },
    sections: [{
      properties: {
        page: {
          size: { width: A4_PAGE_WIDTH_DXA, height: A4_PAGE_HEIGHT_DXA },
          margin: { top: A4_PAGE_MARGIN_DXA, right: A4_PAGE_MARGIN_DXA, bottom: A4_PAGE_MARGIN_DXA, left: A4_PAGE_MARGIN_DXA },
        },
      },
      children: [
        control("#qs.plan.categories"),
        categoryHeader,
        new Paragraph({ keepNext: true, spacing: { before: 0, after: 60 } }),
        control("#qs.category.sections"),
        sectionHeader,
        new Paragraph({ keepNext: true, spacing: { before: 0, after: 40 } }),
        control("#qs.section.blocks"),
        blockCard,
        new Paragraph({ spacing: { before: 0, after: 100 } }),
        control("/qs.section.blocks"),
        control("/qs.category.sections"),
        control("/qs.plan.categories"),
      ],
    }],
  });
}

export async function createStandardTemplate(documentType: DocumentType, locale: Locale): Promise<Blob> {
  if (documentType !== "a4_plan") throw new Error(`No standard Word template exists for ${documentType}.`);
  return Packer.toBlob(standardA4Template(locale));
}

export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error("Unexpected binary file result"));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
