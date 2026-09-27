import { createReport, listCommands } from "docx-templates/lib/browser.js";
import {
  AlignmentType, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, ShadingType,
  Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import JSZip from "jszip";
import type {
  BuildingBlock, BuildingBlockCategory, DocumentType, Locale, Plan, Project,
  ProjectDocumentConfiguration,
} from "../domain/types";
import { overviewSectionTemplateData } from "../domain/overviewTemplates";

const COMMAND_DELIMITER: [string, string] = ["{{", "}}"];
const SAFE_PATH = /^(qs(?:\.[A-Za-z_][A-Za-z0-9_]*)+|\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|\$idx)$/;
const SAFE_LOOP = /^([A-Za-z_][A-Za-z0-9_]*)\s+IN\s+(qs(?:\.[A-Za-z_][A-Za-z0-9_]*)+|\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)$/;
const SAFE_LOOP_END = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const MAX_TEMPLATE_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TEMPLATE_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
export const MAX_TEMPLATE_ZIP_ENTRIES = 400;
const MAX_TEMPLATE_COMPRESSION_RATIO = 40;
const WORD_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const UNSAFE_PACKAGE_PATH = /(^|\/)(vbaProject\.bin|activeX|embeddings)(\/|$)/i;
const EXTERNAL_RELATIONSHIP = /TargetMode\s*=\s*["']External["']/i;
const XML_TEXT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
const XML_ENTITY_MAP: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

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

export function documentDependencyFingerprint(project: Project, plan?: Plan): string {
  const payload = stableStringify({ project, plan });
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

function dataUrlImage(dataUrl?: string): { data: string; extension: ".png" | ".jpg"; width: number; height: number } | undefined {
  if (!dataUrl) return undefined;
  const match = /^data:image\/(png|jpeg);base64,(.+)$/i.exec(dataUrl);
  if (!match) return undefined;
  return { data: match[2], extension: match[1].toLowerCase() === "png" ? ".png" : ".jpg", width: 4.8, height: 3.2 };
}

export function buildTemplateData(
  project: Project,
  plan: Plan | undefined,
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
    construction_type_label: constructionTypeLabels[project.documentLocale][project.constructionType], language: project.documentLocale,
  };
  project.customFields.forEach((field, index) => { projectFields[field.placeholderKey || normalizePlaceholderKey(field.key, `field_${index + 1}`)] = field.value; });
  const customSections: Record<string, unknown> = {};
  project.customSections.forEach((section, sectionIndex) => {
    const values: Record<string, string> = {};
    section.fields.forEach((field, fieldIndex) => { values[field.placeholderKey || normalizePlaceholderKey(field.key, `field_${fieldIndex + 1}`)] = field.value; });
    customSections[section.placeholderKey || normalizePlaceholderKey(section.title, `section_${sectionIndex + 1}`)] = values;
  });
  project.overviewSections.forEach((section) => {
    customSections[section.placeholderKey] = overviewSectionTemplateData(section, project.documentLocale);
  });
  const blockMap = new Map(blocks.map((block) => [block.id, block]));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const planLocale = plan?.documentLocale ?? project.documentLocale;
  const semanticOrder = new Map(plan?.layout.elements.map((element) => [element.kind === "block" ? element.itemId : element.kind === "section" ? element.sectionId : element.id, element.semanticOrder ?? Number.MAX_SAFE_INTEGER]) ?? []);
  const orderedSections = plan ? [...plan.sections].sort((left, right) => (semanticOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (semanticOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)) : [];
  const planSections = orderedSections.map((section) => {
    const category = categoryMap.get(section.categoryId);
    const sectionTitle = section.titleOverrides?.[planLocale] ?? category?.translations[planLocale]?.name ?? section.categoryId;
    const sectionBlocks = [...section.items].sort((left, right) => (semanticOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (semanticOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)).map((item) => {
    const block = blockMap.get(item.blockId);
    if (!block) return null;
    const content = block.translations[planLocale] ?? block.translations.de;
    return {
      category: sectionTitle,
      title: item.customTitle?.[planLocale] ?? content.title,
      a0_description: item.customShortDescription?.[planLocale] ?? content.shortDescription,
      a4_description: content.longDescription,
      short_description: item.customShortDescription?.[planLocale] ?? content.shortDescription,
      long_description: content.longDescription,
      regulations: block.regulations.join(", "),
      image: dataUrlImage(item.imageDataUrl ?? block.imageDataUrl),
      expert_note: item.expertNote ?? "",
    };
    }).filter(Boolean);
    return { id: section.id, category_id: section.categoryId, title: sectionTitle, blocks: sectionBlocks };
  }) ?? [];
  const planBlocks = planSections.flatMap((section) => section.blocks);
  return {
    qs: {
      project: projectFields,
      overview: { ...projectFields, ...customSections },
      emergency_contacts: project.emergencyContacts.map((contact) => ({ label: contact.label, name: contact.name, phone: contact.phone })),
      participants: project.participants.map((participant) => ({ role: participant.role, role_label: participantRoleLabels[project.documentLocale][participant.role], company: participant.company, name: participant.name, email: participant.email, phone: participant.phone })),
      plan: { title: plan?.title ?? "", sections: planSections, blocks: planBlocks },
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
    const contentNames = names.filter((name) => /^word\/(document|header\d+|footer\d+)\.xml$/.test(name));
    for (const contentName of contentNames) {
      const xml = await zip.file(contentName)?.async("text");
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
  const commands = await listCommands(await applyControlledPageBreaks(template), COMMAND_DELIMITER);
  const placeholders = new Set<string>();
  const missing = new Set<string>();
  const unsafe = new Set<string>();
  const loopPaths = new Map<string, string>();
  const loopStack: string[] = [];
  commands.forEach((command) => {
    const code = command.code.trim();
    if (["INS", "IMAGE"].includes(command.type)) {
      if (!SAFE_PATH.test(code)) { unsafe.add(command.raw); return; }
      placeholders.add(code);
      if (code.startsWith("qs.") && !resolvePath(data, code).exists) missing.add(code);
      if (code.startsWith("$")) {
        const [variable, ...segments] = code.slice(1).split(".");
        const collectionPath = loopPaths.get(variable);
        const collection = collectionPath ? resolvePath(data, collectionPath).value : undefined;
        if (Array.isArray(collection) && segments.length && collection.some((entry) => !resolvePath(entry as TemplateData, segments.join(".")).exists)) missing.add(code);
      }
      return;
    }
    if (command.type === "FOR") {
      const match = SAFE_LOOP.exec(code);
      if (!match) { unsafe.add(command.raw); return; }
      if (loopStack.length > 1) { unsafe.add(`${command.raw} (loop nesting is limited to two levels)`); return; }
      if (loopPaths.has(match[1])) { unsafe.add(`${command.raw} (duplicate loop variable)`); return; }
      placeholders.add(match[2]);
      if (match[2].startsWith("qs.") && !resolvePath(data, match[2]).exists) missing.add(match[2]);
      loopPaths.set(match[1], match[2]);
      loopStack.push(match[1]);
      return;
    }
    if (command.type === "END-FOR" && SAFE_LOOP_END.test(code)) {
      if (loopStack.at(-1) !== code) { unsafe.add(`${command.raw} (unmatched loop end)`); return; }
      loopStack.pop(); loopPaths.delete(code); return;
    }
    unsafe.add(command.raw);
  });
  loopStack.forEach((variable) => unsafe.add(`Missing END-FOR for ${variable}`));
  return { placeholders: [...placeholders], missingPlaceholders: [...missing], unsafeCommands: [...unsafe] };
}

export async function renderTemplate(template: ArrayBuffer, data: TemplateData): Promise<Blob> {
  const inspection = await inspectTemplate(template, data);
  if (inspection.unsafeCommands.length) throw new Error(`Unsafe template commands: ${inspection.unsafeCommands.join(", ")}`);
  const normalizedTemplate = await applyControlledPageBreaks(template);
  const report = await createReport({
    template: new Uint8Array(normalizedTemplate), data, cmdDelimiter: COMMAND_DELIMITER, rejectNullish: false,
    // Every command is restricted to a property path before execution, so the direct evaluator
    // avoids the browser-only vm shim without exposing arbitrary template JavaScript.
    failFast: false, processLineBreaks: true, noSandbox: true,
  });
  const reportBuffer = report.buffer.slice(report.byteOffset, report.byteOffset + report.byteLength) as ArrayBuffer;
  return new Blob([reportBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function command(text: string): TextRun { return new TextRun({ text: `{{${text}}}`, color: "296C5D" }); }
function label(text: string): TextRun { return new TextRun({ text, bold: true, color: "10251F" }); }

function standardSupportingBody(documentType: DocumentType, locale: Locale): Array<Paragraph | Table> {
  if (documentType === "participants") {
    return [
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360 }, children: [new TextRun(locale === "de" ? "Projektbeteiligte" : "Project participants")] }),
      new Paragraph({ children: [command("FOR participant IN qs.participants")] }),
      new Paragraph({ children: [command("INS $participant.role_label"), new TextRun(" · "), command("INS $participant.name"), new TextRun(" · "), command("INS $participant.company")] }),
      new Paragraph({ children: [command("INS $participant.phone"), new TextRun(" · "), command("INS $participant.email")] }),
      new Paragraph({ children: [command("END-FOR participant")] }),
    ];
  }
  if (documentType === "advance_notice") {
    return [
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360 }, children: [new TextRun(locale === "de" ? "Angaben zum Bauvorhaben" : "Project information")] }),
      new Paragraph({ children: [label(locale === "de" ? "Art: " : "Type: "), command("INS qs.project.construction_type_label")] }),
      new Paragraph({ children: [label(locale === "de" ? "Beginn: " : "Start: "), command("INS qs.project.start_date"), new TextRun(" · "), label(locale === "de" ? "Ende: " : "End: "), command("INS qs.project.end_date")] }),
      new Paragraph({ children: [label(locale === "de" ? "Beschreibung: " : "Description: "), command("INS qs.project.description")] }),
    ];
  }
  if (documentType === "site_rules") {
    return [
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360 }, children: [new TextRun(locale === "de" ? "Verbindliche Maßnahmen" : "Binding measures")] }),
      new Paragraph({ children: [command("FOR block IN qs.plan.blocks")] }),
      new Paragraph({ children: [label("• "), command("INS $block.title"), new TextRun(" — "), command("INS $block.short_description")] }),
      new Paragraph({ children: [command("END-FOR block")] }),
    ];
  }
  const contactLabel = locale === "de" ? "Notfallkontakte" : "Emergency contacts";
  return [
    new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360 }, children: [new TextRun(contactLabel)] }),
    new Paragraph({ children: [command("FOR contact IN qs.emergency_contacts")] }),
    new Paragraph({ children: [command("INS $contact.label"), new TextRun(" · "), command("INS $contact.name"), new TextRun(" · "), command("INS $contact.phone")] }),
    new Paragraph({ children: [command("END-FOR contact")] }),
  ];
}

function standardSupportingTemplate(documentType: DocumentType, locale: Locale): Document {
  const titles: Record<Locale, Record<string, string>> = {
    de: { site_rules: "Baustellengrundsätze", alarm_plan: "Alarmplan", fire_safety: "Verhalten im Brandfall", first_aid: "Erste Hilfe", participants: "Projektbeteiligte", advance_notice: "Vorankündigung", a4_plan: "SiGe-Plan" },
    en: { site_rules: "Site principles", alarm_plan: "Emergency plan", fire_safety: "Fire response", first_aid: "First aid", participants: "Project participants", advance_notice: "Advance notice", a4_plan: "Safety plan" },
  };
  return new Document({
    creator: "QuickSiGe", title: titles[locale][documentType],
    styles: { default: { document: { run: { font: "Aptos", size: 20, color: "263A34" }, paragraph: { spacing: { after: 120 } } } } },
    sections: [{
      properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun("QuickSiGe · "), new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
      children: [
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [new TableCell({ shading: { fill: "10251F", type: ShadingType.CLEAR }, children: [new Paragraph({ children: [new TextRun({ text: "QUICKSiGe", bold: true, color: "D5FF3F", size: 18 })] }), new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: titles[locale][documentType], bold: true, color: "FFFFFF", size: 36 })] })] })] })] }),
        new Paragraph({ spacing: { before: 360 }, children: [label(locale === "de" ? "Projekt: " : "Project: "), command("INS qs.project.name")] }),
        new Paragraph({ children: [label(locale === "de" ? "Projektnummer: " : "Project number: "), command("INS qs.project.number")] }),
        new Paragraph({ children: [label(locale === "de" ? "Adresse: " : "Address: "), command("INS qs.project.address"), new TextRun(", "), command("INS qs.project.city")] }),
        ...standardSupportingBody(documentType, locale),
      ],
    }],
  });
}

function standardA4Template(locale: Locale): Document {
  const title = locale === "de" ? "Sicherheits- und Gesundheitsschutzplan" : "Safety and Health Plan";
  return new Document({
    creator: "QuickSiGe", title,
    styles: { default: { document: { run: { font: "Aptos", size: 19, color: "263A34" }, paragraph: { spacing: { after: 90 } } } } },
    sections: [{
      properties: { page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun("QuickSiGe · "), new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
      children: [
        new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: title, color: "10251F", bold: true })] }),
        new Paragraph({ children: [label(locale === "de" ? "Projekt: " : "Project: "), command("INS qs.project.name"), new TextRun(" · "), command("INS qs.project.number")] }),
        new Paragraph({ children: [command("FOR block IN qs.plan.blocks")] }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [
          new TableRow({ children: [new TableCell({ shading: { fill: "E7F1ED", type: ShadingType.CLEAR }, children: [new Paragraph({ children: [command("INS $block.title")] })] })] }),
          new TableRow({ children: [new TableCell({ children: [new Paragraph({ children: [command("IMAGE $block.image")] }), new Paragraph({ children: [command("INS $block.short_description")] }), new Paragraph({ children: [command("INS $block.long_description")] }), new Paragraph({ children: [label(locale === "de" ? "Regelwerk: " : "References: "), command("INS $block.regulations")] })] })] }),
        ] }),
        new Paragraph({ children: [command("END-FOR block")] }),
      ],
    }],
  });
}

export async function createStandardTemplate(documentType: DocumentType, locale: Locale): Promise<Blob> {
  const document = documentType === "a4_plan" ? standardA4Template(locale) : standardSupportingTemplate(documentType, locale);
  return Packer.toBlob(document);
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
