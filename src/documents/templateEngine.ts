import { createReport, listCommands } from "docx-templates/lib/browser.js";
import {
  AlignmentType, BorderStyle, Document, Packer, Paragraph, ShadingType,
  Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
} from "docx";
import JSZip from "jszip";
import type {
  BuildingBlock, BuildingBlockCategory, DocumentType, Locale, Plan, Project,
  Organization, ProjectOverviewEntry,
} from "../domain/types";
import { categoryHierarchyColor, categoryIdsInHierarchyOrder, categoryTrail } from "../domain/categoryTree";
import { overviewSectionTemplateData } from "../domain/overviewTemplates";
import { normalizeOverviewKey } from "../domain/placeholderNames";
import { PROJECT_PARTICIPANTS_SECTION_ID } from "../domain/projectOverviewOrder";
import { emptyOrganizationProfile, organizationAddressLines } from "../domain/organizationProfile";
import type { OrganizationDocumentProfile } from "./organizationData";

const COMMAND_DELIMITER: [string, string] = ["{{", "}}"];
const PARTICIPANT_FIELD_KEYS = ["name", "company", "role", "email", "phone"] as const;
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
// User fields may also be named Image or Color, so formatting is restricted to built-in paths.
const IMAGE_PLACEHOLDER_PATH = /^qs\.(?:organization\.(?:logo|logo_images)|project\.(?:files|plan\.(?:blocks|category_tree\.blocks)))\.image$/;
const PROJECT_IMAGE_MAX_WIDTH_CM = 18.6;
const PROJECT_IMAGE_MAX_HEIGHT_CM = 17.5;
const PLAN_STYLE_PLACEHOLDER_PATH = /^qs\.project\.plan\.(?:blocks|category_tree(?:\.blocks)?)\.(color|cell_fill)$/;
const LEGACY_AUTHOR_COMMAND = /\{\{\s*(?:FOR|END-FOR|INS|IMAGE)\b[^{}]*\}\}/gi;
const DYNAMIC_CELL_FILL = /\[\[QS_CELL_FILL:([0-9A-F]{6})\]\]/gi;
const DYNAMIC_TEXT_COLOR = /\[\[QS_TEXT_COLOR:([0-9A-F]{6})\]\]/gi;
const FALLBACK_CATEGORY_COLOR = "496F5F";
const A4_PAGE_WIDTH_DXA = 11_906;
const A4_PAGE_HEIGHT_DXA = 16_838;
const A4_PAGE_MARGIN_DXA = 720;
const A4_CONTENT_WIDTH_DXA = A4_PAGE_WIDTH_DXA - (2 * A4_PAGE_MARGIN_DXA);
const BLOCK_ACCENT_COLUMN_WIDTH_DXA = 240;
const BLOCK_IMAGE_COLUMN_WIDTH_DXA = 3_500;
const BLOCK_DESCRIPTION_COLUMN_WIDTH_DXA = A4_CONTENT_WIDTH_DXA - BLOCK_ACCENT_COLUMN_WIDTH_DXA - BLOCK_IMAGE_COLUMN_WIDTH_DXA;
const BLOCK_IMAGE_WIDTH_CM = 5.3;
const BLOCK_IMAGE_HEIGHT_CM = 3.6;
const ORGANIZATION_LOGO_MAX_WIDTH_CM = 4;
const ORGANIZATION_LOGO_MAX_HEIGHT_CM = 1.5;

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

export type TemplateData = Record<string, unknown> & {
  collectionExamples?: Record<string, Record<string, unknown>>;
};

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
  const scope = [...scopes].reverse().find((candidate) => path === candidate.path || path.startsWith(`${candidate.path}.`));
  if (scope) return `$${scope.variable}${path.slice(scope.path.length)}`;
  return path;
}

function friendlyCommand(match: RegExpMatchArray, scopes: FriendlyLoopScope[]): string {
  const marker = match[1];
  const path = match[2];
  if (marker === "#") {
    const variable = `loop${scopes.length}`;
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
  if (path.endsWith(".color") && PLAN_STYLE_PLACEHOLDER_PATH.test(path) && valuePath.startsWith("$")) valuePath = `${valuePath.slice(0, -"color".length)}cell_fill`;
  return `{{${IMAGE_PLACEHOLDER_PATH.test(path) ? "IMAGE" : "INS"} ${valuePath}}}`;
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

function setRunTextColor(run: string, color: string): string {
  const colorElement = `<w:color w:val="${color}"/>`;
  if (/<w:color\b/.test(run)) return run.replace(/<w:color\b[^>]*(?:\/>|>[\s\S]*?<\/w:color>)/, colorElement);
  if (/<w:rPr\s*\/>/.test(run)) return run.replace(/<w:rPr\s*\/>/, `<w:rPr>${colorElement}</w:rPr>`);
  if (/<w:rPr(?:\s[^>]*)?>/.test(run)) return run.replace(/<w:rPr(?:\s[^>]*)?>/, (properties) => `${properties}${colorElement}`);
  return run.replace(/<w:r(?:\s[^>]*)?>/, (opening) => `${opening}<w:rPr>${colorElement}</w:rPr>`);
}

function setVisibleRunTextColor(fragment: string, color: string): string {
  return fragment.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, (run) => {
    const visibleText = [...run.matchAll(XML_TEXT)].map((match) => decodeXmlText(match[1])).join("");
    return visibleText ? setRunTextColor(run, color) : run;
  });
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

function applyDynamicStylesToXml(xml: string): string {
  const cellSpans = findXmlElementSpans(xml, "tc");
  const paragraphSpans = findXmlElementSpans(xml, "p");
  const targets = new Map<number, XmlElementSpan & { kind: "cell" | "paragraph" }>();
  const styleMarkers = [...xml.matchAll(DYNAMIC_CELL_FILL), ...xml.matchAll(DYNAMIC_TEXT_COLOR)];
  for (const marker of styleMarkers) {
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
  DYNAMIC_TEXT_COLOR.lastIndex = 0;

  let rewritten = xml;
  const orderedTargets = [...targets.values()].sort((left, right) => right.start - left.start);
  orderedTargets.forEach((target) => {
    const fragment = rewritten.slice(target.start, target.end);
    const visibleText = [...fragment.matchAll(XML_TEXT)].map((match) => decodeXmlText(match[1])).join("");
    const fill = /\[\[QS_CELL_FILL:([0-9A-F]{6})\]\]/i.exec(visibleText)?.[1]?.toUpperCase();
    const textColor = /\[\[QS_TEXT_COLOR:([0-9A-F]{6})\]\]/i.exec(visibleText)?.[1]?.toUpperCase();
    let styledFragment = rewriteXmlTextMatches(fragment, DYNAMIC_CELL_FILL, () => "");
    DYNAMIC_CELL_FILL.lastIndex = 0;
    styledFragment = rewriteXmlTextMatches(styledFragment, DYNAMIC_TEXT_COLOR, () => "");
    DYNAMIC_TEXT_COLOR.lastIndex = 0;
    if (fill) styledFragment = target.kind === "cell"
      ? setTableCellFill(styledFragment, fill)
      : setParagraphFill(styledFragment, fill);
    if (textColor) styledFragment = setVisibleRunTextColor(styledFragment, textColor);
    rewritten = `${rewritten.slice(0, target.start)}${styledFragment}${rewritten.slice(target.end)}`;
  });
  return rewritten;
}

async function applyDynamicStyles(document: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(document);
  const xmlNames = Object.keys(zip.files).filter((name) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(name));
  for (const name of xmlNames) {
    const file = zip.file(name);
    if (!file) continue;
    const xml = await file.async("text");
    const rewritten = applyDynamicStylesToXml(xml);
    if (rewritten !== xml) zip.file(name, rewritten);
  }
  return zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
}

function cellFillMarker(color: string): string {
  const normalized = color.replace("#", "").toUpperCase();
  return `[[QS_CELL_FILL:${/^[0-9A-F]{6}$/.test(normalized) ? normalized : FALLBACK_CATEGORY_COLOR}]]`;
}

function textColorMarker(color: string): string {
  const normalized = color.replace("#", "").toUpperCase();
  return `[[QS_TEXT_COLOR:${/^[0-9A-F]{6}$/.test(normalized) ? normalized : "FFFFFF"}]]`;
}

function readableTextColor(backgroundColor: string): string {
  const normalized = backgroundColor.replace("#", "");
  if (!/^[0-9A-F]{6}$/i.test(normalized)) return "#FFFFFF";
  const channels = [0, 2, 4].map((offset) => Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const relativeLuminance = (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  return relativeLuminance > 0.179 ? "#000000" : "#FFFFFF";
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

export function documentDependencyFingerprint(project: Project, locale: Locale, plan?: Plan, organization?: Organization): string {
  const payload = stableStringify({ locale, project, plan, organization });
  let hash = 2_166_136_261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
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

interface A4TemplateBlock {
  category: string;
  title: string;
  a0_description: string;
  a4_description: string;
  regulations: string;
  image: ReturnType<typeof dataUrlImage>;
  color: string;
  cell_fill: string;
  expert_note: string;
}

interface A4TemplateCategory {
  id: string;
  title: string;
  path: string;
  depth: number;
  color: string;
  cell_fill: string;
  blocks: A4TemplateBlock[];
}

function buildA4CategoryTree(
  plan: Plan | undefined,
  locale: Locale,
  blocks: BuildingBlock[],
  categories: BuildingBlockCategory[],
): A4TemplateCategory[] {
  if (!plan) return [];

  const blockById = new Map(blocks.map((block) => [block.id, block]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const sectionByCategoryId = new Map(plan.sections.map((section) => [section.categoryId, section]));
  const semanticOrder = new Map(plan.layout.elements.map((element) => [
    element.kind === "block" ? element.itemId : element.id,
    element.semanticOrder ?? Number.MAX_SAFE_INTEGER,
  ]));
  const itemsByCategoryId = new Map<string, Array<{
    item: Plan["sections"][number]["items"][number];
    block: BuildingBlock;
    sourceOrder: number;
  }>>();
  const visibleCategoryIds = new Set<string>();
  const unknownCategoryIds: string[] = [];
  let sourceOrder = 0;

  plan.sections.forEach((section) => {
    section.items.forEach((item) => {
      const block = blockById.get(item.blockId);
      if (!block) return;
      const categoryId = categoryById.has(block.primaryCategoryId) ? block.primaryCategoryId : section.categoryId;
      const categoryItems = itemsByCategoryId.get(categoryId) ?? [];
      categoryItems.push({ item, block, sourceOrder });
      sourceOrder += 1;
      itemsByCategoryId.set(categoryId, categoryItems);

      const trail = categoryTrail(categoryId, categories);
      if (trail.length) trail.forEach((category) => visibleCategoryIds.add(category.id));
      else if (!unknownCategoryIds.includes(categoryId)) unknownCategoryIds.push(categoryId);
    });
  });

  const orderedCategoryIds = [
    ...categoryIdsInHierarchyOrder(categories).filter((categoryId) => visibleCategoryIds.has(categoryId)),
    ...unknownCategoryIds,
  ];

  return orderedCategoryIds.map((categoryId) => {
    const category = categoryById.get(categoryId);
    const trail = categoryTrail(categoryId, categories);
    const categoryTitle = sectionByCategoryId.get(categoryId)?.titleOverrides?.[locale]?.trim()
      || category?.translations[locale]?.name
      || categoryId;
    const categoryColor = category ? categoryHierarchyColor(categoryId, categories) : `#${FALLBACK_CATEGORY_COLOR}`;
    const categoryBlocks = (itemsByCategoryId.get(categoryId) ?? [])
      .sort((left, right) => (semanticOrder.get(left.item.id) ?? Number.MAX_SAFE_INTEGER)
        - (semanticOrder.get(right.item.id) ?? Number.MAX_SAFE_INTEGER)
        || left.sourceOrder - right.sourceOrder)
      .map(({ item, block }) => {
        const content = block.translations[locale] ?? block.translations.de;
        const blockColor = category ? categoryColor : `#${FALLBACK_CATEGORY_COLOR}`;
        return {
          category: categoryTitle,
          title: item.customTitle?.[locale] ?? content.title,
          a0_description: item.customShortDescription?.[locale] ?? content.shortDescription,
          a4_description: content.longDescription,
          regulations: block.regulations.join(", "),
          image: dataUrlImage(item.imageDataUrl ?? block.imageDataUrl, { width: BLOCK_IMAGE_WIDTH_CM, height: BLOCK_IMAGE_HEIGHT_CM }),
          color: blockColor,
          cell_fill: cellFillMarker(blockColor),
          expert_note: item.expertNote ?? "",
        };
      });

    return {
      id: categoryId,
      title: categoryTitle,
      path: trail.map((trailCategory) => trailCategory.translations[locale]?.name ?? trailCategory.id).join(" › ") || categoryTitle,
      depth: Math.max(0, trail.length - 1),
      color: categoryColor,
      cell_fill: `${cellFillMarker(categoryColor)}${textColorMarker(readableTextColor(categoryColor))}`,
      blocks: categoryBlocks,
    };
  });
}

export function buildTemplateData(
  project: Project | undefined,
  plan: Plan | undefined,
  locale: Locale,
  blocks: BuildingBlock[],
  categories: BuildingBlockCategory[] = [],
  organization?: OrganizationDocumentProfile,
): TemplateData {
  const participantRoleLabels: Record<Locale, Record<Project["participants"][number]["role"], string>> = {
    de: { client: "Auftraggeber", owner: "Bauherr", responsible_third_party: "Beauftragter Dritter", coordinator: "SiGe-Koordination", architect: "Architektur", planner: "Fachplanung", site_manager: "Bauleitung", contractor: "Auftragnehmer", custom: "Weitere Rolle" },
    en: { client: "Client", owner: "Owner", responsible_third_party: "Responsible third party", coordinator: "Safety coordination", architect: "Architecture", planner: "Specialist planning", site_manager: "Site management", contractor: "Contractor", custom: "Other role" },
  };
  const projectFields: Record<string, unknown> = {
    name: project?.name ?? "", number: project?.projectNumber ?? "", language: locale,
    ...Object.fromEntries((project?.overviewSections ?? []).map((section) => [normalizeOverviewKey(section.name), overviewSectionTemplateData(section, locale)])),
  };
  const collectionExamples: Record<string, Record<string, unknown>> = {};
  const entryExample = (entry: ProjectOverviewEntry, parentPath: string): unknown => {
    const path = `${parentPath}.${normalizeOverviewKey(entry.label)}`;
    if (entry.type === "text" || entry.type === "date") return "";
    const example = Object.fromEntries(entry.children.map((child) => [normalizeOverviewKey(child.label), entryExample(child, path)]));
    if (entry.type === "repeating_group") { collectionExamples[path] = example; return []; }
    return example;
  };
  project?.overviewSections.forEach((section) => section.entries.forEach((entry) => entryExample(entry, `qs.project.${normalizeOverviewKey(section.name)}`)));
  if (project?.overviewSectionOrder.includes(PROJECT_PARTICIPANTS_SECTION_ID)) {
    const participantPath = `qs.project.${normalizeOverviewKey(project.participantsSectionName)}`;
    collectionExamples[participantPath] = Object.fromEntries(PARTICIPANT_FIELD_KEYS.map((key) => [key, ""]));
    const participantsByAssignment = new Map<string, { participant: Project["participants"][number]; roles: string[] }>();
    project.participants.forEach((participant) => {
      const assignmentId = participant.id.split(":")[0];
      const current = participantsByAssignment.get(assignmentId) ?? { participant, roles: [] };
      const roleLabel = participant.role === "custom" ? participant.customRole ?? "" : participantRoleLabels[locale][participant.role];
      if (roleLabel) current.roles.push(roleLabel);
      participantsByAssignment.set(assignmentId, current);
    });
    projectFields[normalizeOverviewKey(project.participantsSectionName)] = [...participantsByAssignment.values()].map(({ participant, roles }) => (
      Object.fromEntries([participant.name, participant.company, roles.join(", "), participant.email, participant.phone].map((value, index) => [PARTICIPANT_FIELD_KEYS[index], value]))
    ));
  }
  const categoryTree = buildA4CategoryTree(plan, locale, blocks, categories);
  const planBlocks = categoryTree.flatMap((category) => category.blocks);
  const profile = organization ?? emptyOrganizationProfile();
  const logo = organization?.logo;
  const logoScale = logo ? Math.min(ORGANIZATION_LOGO_MAX_WIDTH_CM / logo.width, ORGANIZATION_LOGO_MAX_HEIGHT_CM / logo.height) : 1;
  const logoImage = dataUrlImage(organization?.logoDataUrl, logo ? { width: logo.width * logoScale, height: logo.height * logoScale } : undefined);
  const addressLines = organizationAddressLines(organization);
  const contactLine = [profile.phone && `${profile.phone}${profile.phoneExtension ? ` ext. ${profile.phoneExtension}` : ""}`, profile.email, profile.website].filter(Boolean).join(" · ");
  const blockExample = { category: "", title: "", a0_description: "", a4_description: "", regulations: "", image: undefined, color: "", cell_fill: "", expert_note: "" } satisfies A4TemplateBlock;
  collectionExamples["qs.project.plan.blocks"] = blockExample;
  collectionExamples["qs.project.plan.category_tree"] = { id: "", title: "", path: "", depth: 0, color: "", cell_fill: "", blocks: [] };
  collectionExamples["qs.project.plan.category_tree.blocks"] = blockExample;
  collectionExamples["qs.project.files"] = { filename: "", image: undefined };
  collectionExamples["qs.organization.profiles"] = {};
  collectionExamples["qs.organization.logo_images"] = { image: undefined };
  return {
    collectionExamples,
    qs: {
      organization: {
        profiles: organization ? [{}] : [],
        name: profile.name,
        address: { street: profile.address.street, house_number: profile.address.houseNumber, address_addition: profile.address.addressAddition, postal_code: profile.address.postalCode, city: profile.address.city, region: profile.address.region, country_code: profile.address.countryCode },
        formatted_address: addressLines.join("\n"),
        phone: profile.phone, phone_extension: profile.phoneExtension, mobile_phone: profile.mobilePhone,
        fax: profile.fax, fax_extension: profile.faxExtension, email: profile.email, website: profile.website,
        logo: { image: logoImage },
        logo_images: logoImage ? [{ image: logoImage }] : [],
        address_line: addressLines.join(" · "),
        contact_line: contactLine,
      },
      project: {
        ...projectFields,
        plan: {
          title: plan ? (locale === "de" ? "Sicherheits- und Gesundheitsschutzplan" : "Safety and Health Plan") : "",
          category_tree: categoryTree,
          blocks: planBlocks,
        },
        files: (project?.assets ?? []).map((asset) => {
          const scale = asset.width && asset.height ? Math.min(PROJECT_IMAGE_MAX_WIDTH_CM / asset.width, PROJECT_IMAGE_MAX_HEIGHT_CM / asset.height) : undefined;
          const dimensions = scale && asset.width && asset.height ? { width: asset.width * scale, height: asset.height * scale } : undefined;
          return { filename: asset.filename, image: asset.mimeType.startsWith("image/") ? dataUrlImage(asset.dataUrl, dimensions) : undefined };
        }),
      },
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
    if (!current || typeof current !== "object" || !Object.hasOwn(current, segment)) return { exists: false, value: undefined };
    current = (current as Record<string, unknown>)[segment];
  }
  return { exists: true, value: current };
}

export function templatePlaceholderReference(data: TemplateData): string[] {
  const placeholders = new Set<string>();
  const visit = (value: unknown, path: string) => {
    if (path.endsWith(".cell_fill") && PLAN_STYLE_PLACEHOLDER_PATH.test(path)) return;
    if (IMAGE_PLACEHOLDER_PATH.test(path)) { placeholders.add(`{{${path}}}`); return; }
    if (Array.isArray(value)) {
      placeholders.add(`{{#${path}}}`);
      const example = data.collectionExamples?.[path];
      if (example) visit(example, path);
      value.forEach((entry) => visit(entry, path));
      placeholders.add(`{{/${path}}}`);
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
    } else placeholders.add(`{{${path}}}`);
  };
  visit(data.qs, "qs");
  return [...placeholders];
}

export async function inspectTemplate(template: ArrayBuffer, data: TemplateData): Promise<TemplateInspection> {
  const legacyAuthorCommands = await findLegacyAuthorCommands(template);
  const normalizedTemplate = await normalizeTemplateSyntax(template);
  const commands = await listCommands(await applyControlledPageBreaks(normalizedTemplate), COMMAND_DELIMITER);
  const placeholders = new Set<string>();
  const missing = new Set<string>();
  const unsafe = new Set(legacyAuthorCommands);
  const loopStack: Array<{ path: string; variable: string; entries: unknown[] }> = [];
  const sourcePath = (path: string): string => {
    if (!path.startsWith("$")) return path;
    const [variable, ...segments] = path.slice(1).split(".");
    const scope = [...loopStack].reverse().find((candidate) => candidate.variable === variable);
    return scope ? `${scope.path}${segments.length ? `.${segments.join(".")}` : ""}` : path;
  };
  const resolveValues = (path: string): { exists: boolean; values: unknown[] } => {
    if (path.startsWith("qs.")) {
      const resolved = resolvePath(data, path);
      return { exists: resolved.exists, values: resolved.exists ? [resolved.value] : [] };
    }
    const [variable, ...segments] = path.slice(1).split(".");
    const scope = [...loopStack].reverse().find((candidate) => candidate.variable === variable);
    if (!scope) return { exists: false, values: [] };
    if (!segments.length) return { exists: true, values: scope.entries };
    const entries = scope.entries.length ? scope.entries : data.collectionExamples?.[scope.path] ? [data.collectionExamples[scope.path]] : [];
    const resolved = entries.map((entry) => resolvePath(entry as TemplateData, segments.join(".")));
    if (!entries.length) return { exists: false, values: [] };
    return { exists: resolved.every((entry) => entry.exists), values: resolved.filter((entry) => entry.exists).map((entry) => entry.value) };
  };
  commands.forEach((command) => {
    const code = command.code.trim();
    if (["INS", "IMAGE"].includes(command.type)) {
      if (!SAFE_PATH.test(code)) { unsafe.add(command.raw); return; }
      placeholders.add(sourcePath(code));
      if (!resolveValues(code).exists) missing.add(sourcePath(code));
      return;
    }
    if (command.type === "FOR") {
      const match = SAFE_LOOP.exec(code);
      if (!match) { unsafe.add(command.raw); return; }
      if (loopStack.length >= MAXIMUM_LOOP_NESTING) { unsafe.add(`${command.raw} (loop nesting is limited to ${MAXIMUM_LOOP_NESTING} levels)`); return; }
      if (loopStack.some((scope) => scope.variable === match[1])) { unsafe.add(`${command.raw} (duplicate loop variable)`); return; }
      const path = sourcePath(match[2]);
      placeholders.add(path);
      const collection = resolveValues(match[2]);
      if (!collection.exists) missing.add(path);
      loopStack.push({ path, variable: match[1], entries: collection.values.flatMap((value) => Array.isArray(value) ? value : []) });
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
  const commands = await listCommands(normalizedTemplate, COMMAND_DELIMITER);
  const collectionPaths = new Set(commands.filter((command) => command.type === "FOR")
    .map((command) => SAFE_LOOP.exec(command.code.trim())?.[2]));
  const report = await createReport({
    template: new Uint8Array(normalizedTemplate), data, cmdDelimiter: COMMAND_DELIMITER, rejectNullish: false,
    // Resolve property paths directly so absent parents render empty without evaluating template code.
    runJs: ({ sandbox }) => {
      const path = sandbox.__code__?.trim() ?? "";
      if (!SAFE_PATH.test(path)) throw new Error(`Unsupported template path: ${path}`);
      const { value } = resolvePath(sandbox, path);
      return { modifiedSandbox: sandbox, result: collectionPaths.has(path) ? (Array.isArray(value) ? value : []) : value };
    },
    failFast: false, processLineBreaks: true,
  });
  const reportBuffer = report.buffer.slice(report.byteOffset, report.byteOffset + report.byteLength) as ArrayBuffer;
  const styledReport = await applyDynamicStyles(reportBuffer);
  return new Blob([styledReport], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function standardA4Template(locale: Locale): Document {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "D9D9D9" };
  const tableBorders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };
  const placeholder = (path: string, options: { bold?: boolean; color?: string; size?: number } = {}) => new TextRun({
    text: `{{${path}}}`,
    bold: options.bold,
    color: options.color ?? "296C5D",
    font: "Arial",
    size: options.size,
  });
  const control = (marker: string) => new Paragraph({ keepNext: true, spacing: { before: 0, after: 0 }, children: [placeholder(marker, { size: 16 })] });
  const categoryHeader = new Table({
    width: { size: A4_CONTENT_WIDTH_DXA, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [A4_CONTENT_WIDTH_DXA],
    borders: tableBorders,
    rows: [new TableRow({ cantSplit: true, children: [new TableCell({
      width: { size: A4_CONTENT_WIDTH_DXA, type: WidthType.DXA },
      shading: { fill: FALLBACK_CATEGORY_COLOR, type: ShadingType.CLEAR },
      margins: { top: 120, bottom: 120, left: 180, right: 180 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        keepNext: true,
        spacing: { before: 0, after: 0 },
        children: [
          placeholder("qs.project.plan.category_tree.color", { color: FALLBACK_CATEGORY_COLOR, size: 2 }),
          placeholder("qs.project.plan.category_tree.title", { bold: true, color: "FFFFFF", size: 27 }),
        ],
      })],
    })] })],
  });
  const blockCard = new Table({
    width: { size: A4_CONTENT_WIDTH_DXA, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [BLOCK_ACCENT_COLUMN_WIDTH_DXA, BLOCK_IMAGE_COLUMN_WIDTH_DXA, BLOCK_DESCRIPTION_COLUMN_WIDTH_DXA],
    borders: tableBorders,
    rows: [new TableRow({ cantSplit: true, children: [
        new TableCell({
          width: { size: BLOCK_ACCENT_COLUMN_WIDTH_DXA, type: WidthType.DXA },
          shading: { fill: "D5FF3F", type: ShadingType.CLEAR },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          children: [new Paragraph({ spacing: { before: 0, after: 0 }, children: [placeholder("qs.project.plan.category_tree.blocks.color", { color: "D5FF3F", size: 2 })] })],
        }),
        new TableCell({
          width: { size: BLOCK_IMAGE_COLUMN_WIDTH_DXA, type: WidthType.DXA },
          margins: { top: 140, bottom: 140, left: 140, right: 140 },
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [placeholder("qs.project.plan.category_tree.blocks.image", { size: 18 })] })],
        }),
        new TableCell({
          width: { size: BLOCK_DESCRIPTION_COLUMN_WIDTH_DXA, type: WidthType.DXA },
          margins: { top: 150, bottom: 150, left: 190, right: 190 },
          verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({ keepNext: true, spacing: { before: 0, after: 100 }, children: [placeholder("qs.project.plan.category_tree.blocks.title", { bold: true, color: "10251F", size: 22 })] }),
            new Paragraph({ keepNext: true, spacing: { before: 0, after: 110, line: 276 }, children: [placeholder("qs.project.plan.category_tree.blocks.a4_description", { color: "263A34", size: 20 })] }),
            new Paragraph({ spacing: { before: 0, after: 0 }, children: [placeholder("qs.project.plan.category_tree.blocks.regulations", { color: "5B6A65", size: 17 })] }),
          ],
        }),
      ] })],
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
        control("#qs.organization.profiles"),
        control("#qs.organization.logo_images"),
        new Paragraph({ alignment: AlignmentType.RIGHT, spacing: { after: 60 }, children: [placeholder("qs.organization.logo_images.image")] }),
        control("/qs.organization.logo_images"),
        new Paragraph({ spacing: { after: 40 }, children: [placeholder("qs.organization.name", { bold: true, size: 18 })] }),
        new Paragraph({ spacing: { after: 40 }, children: [placeholder("qs.organization.address_line", { size: 14 })] }),
        new Paragraph({ spacing: { after: 160 }, children: [placeholder("qs.organization.contact_line", { size: 14 })] }),
        control("/qs.organization.profiles"),
        control("#qs.project.plan.category_tree"),
        categoryHeader,
        new Paragraph({ keepNext: true, spacing: { before: 0, after: 55 } }),
        control("#qs.project.plan.category_tree.blocks"),
        blockCard,
        new Paragraph({ spacing: { before: 0, after: 100 } }),
        control("/qs.project.plan.category_tree.blocks"),
        control("/qs.project.plan.category_tree"),
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
