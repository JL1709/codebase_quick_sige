import { Document, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { instantiateOverviewSection } from "../domain/overviewTemplates";
import {
  blobToArrayBuffer, buildTemplateData, createStandardTemplate, inspectTemplate,
  MAX_TEMPLATE_FILE_BYTES, normalizePlaceholderKey, renderTemplate, validateTemplateFile,
} from "./templateEngine";

async function commandTemplate(command: string): Promise<ArrayBuffer> {
  const document = new Document({ sections: [{ children: [new Paragraph(`{{${command}}}`)] }] });
  return blobToArrayBuffer(await Packer.toBlob(document));
}

async function documentXml(document: Blob | ArrayBuffer): Promise<string> {
  const buffer = document instanceof Blob ? await blobToArrayBuffer(document) : document;
  const zip = await JSZip.loadAsync(buffer);
  return await zip.file("word/document.xml")?.async("text") ?? "";
}

describe("Word template engine", () => {
  it("distinguishes an undefined placeholder from a defined empty value", async () => {
    const database = createSeedDatabase();
    const project = { ...database.projects[0], description: "" };
    const data = buildTemplateData(project, database.plans[0], database.blocks);

    const existing = await inspectTemplate(await commandTemplate("qs.project.description"), data);
    const missing = await inspectTemplate(await commandTemplate("qs.overview.not_defined"), data);

    expect(existing.missingPlaceholders).toEqual([]);
    expect(missing.missingPlaceholders).toEqual(["qs.overview.not_defined"]);
  });

  it("exposes hierarchical overview-template values to the Word engine", async () => {
    const database = createSeedDatabase();
    const template = database.overviewTemplates.find((candidate) => candidate.id === "overview-template-emergency")!;
    let sequence = 0;
    const section = instantiateOverviewSection(template, (prefix) => `${prefix}-${++sequence}`);
    const project = { ...database.projects[0], overviewSections: [section] };
    const data = buildTemplateData(project, database.plans[0], database.blocks) as {
      qs: { overview: { notfallkontakte: { kontakte: Array<{ telefon: string }> } } };
    };

    expect(data.qs.overview.notfallkontakte.kontakte[0].telefon).toBe("112");
    const inspection = await inspectTemplate(await commandTemplate("qs.overview.notfallkontakte.kontakte.0.telefon"), data);
    expect(inspection.missingPlaceholders).toEqual([]);
  });

  it("blocks executable commands before rendering", async () => {
    const database = createSeedDatabase();
    const template = await commandTemplate("EXEC globalThis.compromised = true");
    const data = buildTemplateData(database.projects[0], database.plans[0], database.blocks);

    const inspection = await inspectTemplate(template, data);
    expect(inspection.unsafeCommands).toHaveLength(1);
    await expect(renderTemplate(template, data)).rejects.toThrow("Unsafe template commands");
  });

  it("rejects the legacy Word-template command syntax", async () => {
    for (const command of [
      "INS qs.project.name",
      "IMAGE qs.block.image",
      "FOR block IN qs.plan.blocks",
      "END-FOR block",
    ]) {
      const inspection = await inspectTemplate(await commandTemplate(command), {});
      expect(inspection.unsafeCommands).toContain(`{{${command}}}`);
    }
  });

  it("expands the standard A4 block loop into a valid DOCX", async () => {
    const database = createSeedDatabase();
    const onePixelPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X0YV5wAAAABJRU5ErkJggg==";
    database.blocks.forEach((block) => { block.imageDataUrl = onePixelPng; });
    const template = await createStandardTemplate("a4_plan", "de");
    const templateBuffer = await blobToArrayBuffer(template);
    const data = buildTemplateData(database.projects[0], database.plans[0], database.blocks, database.categories);
    const generated = await renderTemplate(templateBuffer, data);
    const xml = await documentXml(generated);

    expect((await validateTemplateFile(templateBuffer, "a4-plan.docx")).valid).toBe(true);
    expect(generated.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(generated.size).toBeGreaterThan(10_000);
    expect((await inspectTemplate(await blobToArrayBuffer(generated), data)).placeholders).toEqual([]);
    expect(xml).toContain('w:fill="C8644D"');
    expect(xml).not.toContain("QS_CELL_FILL");
    expect(xml).toContain('<w:gridCol w:w="10466"/>');
    expect(xml).not.toContain('<w:gridCol w:w="100"/>');
    expect(xml).toContain('<wp:extent cx="1944000" cy="1296000"/>');

    const xmlDocument = new DOMParser().parseFromString(xml, "application/xml");
    const nestedBlockTable = [...xmlDocument.getElementsByTagName("w:tbl")]
      .find((table) => table.parentElement?.localName === "tc");
    const wrapperRow = nestedBlockTable?.parentElement?.parentElement;
    const wrapperRowProperties = [...(wrapperRow?.children ?? [])]
      .find((element) => element.localName === "trPr");
    expect(nestedBlockTable).toBeDefined();
    expect([...(wrapperRowProperties?.children ?? [])].some((element) => element.localName === "cantSplit")).toBe(true);
  });

  it("renders the friendly placeholder syntax even when Word splits a marker across runs", async () => {
    const database = createSeedDatabase();
    const document = new Document({ sections: [{ children: [
      new Paragraph({ children: [new TextRun("{{#qs.plan."), new TextRun("blocks}}")]}),
      new Paragraph("{{qs.block.title}}"),
      new Paragraph("{{/qs.plan.blocks}}"),
    ] }] });
    const template = await blobToArrayBuffer(await Packer.toBlob(document));
    const data = buildTemplateData(database.projects[0], database.plans[0], database.blocks, database.categories);

    const inspection = await inspectTemplate(template, data);
    const generated = await renderTemplate(template, data);
    const xml = await documentXml(generated);

    expect(inspection.unsafeCommands).toEqual([]);
    expect(inspection.missingPlaceholders).toEqual([]);
    expect(xml).toContain("Sichere Baustellenzugänge");
    expect(xml).not.toContain("{{");
  });

  it("publishes the friendly hierarchical placeholders in the standard A4 template", async () => {
    const template = await createStandardTemplate("a4_plan", "en");
    const xml = await documentXml(template);

    expect(xml).toContain("{{#qs.plan.categories}}");
    expect(xml).toContain("{{qs.category.title}}");
    expect(xml).toContain("{{#qs.category.sections}}");
    expect(xml).toContain("{{#qs.section.blocks}}");
    expect(xml).toContain("{{qs.block.a4_description}}");
    expect(xml).toContain("{{qs.block.image}}");
    expect(xml).toContain("{{qs.block.regulations}}");
  });

  it("normalizes Unicode labels into stable ASCII placeholder keys", () => {
    expect(normalizePlaceholderKey("Nächster Prüf-Ort", "field")).toBe("nachster_pruf_ort");
    expect(normalizePlaceholderKey("***", "field_4")).toBe("field_4");
  });

  it("rejects unmatched loop scopes and nesting beyond the category hierarchy", async () => {
    const unmatchedEnd = await commandTemplate("/qs.plan.blocks");
    const missingEnd = await commandTemplate("#qs.plan.blocks");
    const nestedDocument = new Document({ sections: [{ children: [
      new Paragraph("{{#qs.plan.categories}}"),
      new Paragraph("{{#qs.category.sections}}"),
      new Paragraph("{{#qs.section.blocks}}"),
      new Paragraph("{{#qs.block.items}}"),
      new Paragraph("{{/qs.block.items}}"),
      new Paragraph("{{/qs.section.blocks}}"),
      new Paragraph("{{/qs.category.sections}}"),
      new Paragraph("{{/qs.plan.categories}}"),
    ] }] });
    const nested = await blobToArrayBuffer(await Packer.toBlob(nestedDocument));

    expect((await inspectTemplate(unmatchedEnd, {})).unsafeCommands.join(" ")).toContain("/qs.plan.blocks");
    expect((await inspectTemplate(missingEnd, {})).unsafeCommands).toContain("Missing closing loop marker for qs.plan.blocks");
    expect((await inspectTemplate(nested, {})).unsafeCommands.join(" ")).toContain("loop nesting is limited to 3 levels");
  });

  it("rejects invalid packages, macro extensions, oversized files, and unsafe compression", async () => {
    const invalid = new Uint8Array([0, 1, 2, 3]).buffer;
    expect((await validateTemplateFile(invalid, "invalid.docx")).valid).toBe(false);

    const normal = await commandTemplate("qs.project.name");
    const macroEnabled = await validateTemplateFile(normal, "unsafe.docm", "application/vnd.ms-word.document.macroEnabled.12");
    expect(macroEnabled.errors.join(" ")).toMatch(/\.docx|MIME/i);

    const oversized = new Uint8Array(MAX_TEMPLATE_FILE_BYTES + 1).buffer;
    expect((await validateTemplateFile(oversized, "large.docx")).errors.join(" ")).toContain("exceeds 10 MB");

    const compressed = new JSZip();
    compressed.file("[Content_Types].xml", "<Types />");
    compressed.file("word/document.xml", "A".repeat(1_000_000));
    const compressedBuffer = await compressed.generateAsync({ type: "arraybuffer", compression: "DEFLATE" });
    expect((await validateTemplateFile(compressedBuffer, "compressed.docx")).errors.join(" ")).toContain("unsafe compression ratio");
  });

  it("rejects external package relationships while preserving the original template", async () => {
    const source = await commandTemplate("qs.project.name");
    const zip = await JSZip.loadAsync(source);
    const relationshipsPath = "word/_rels/document.xml.rels";
    const relationships = await zip.file(relationshipsPath)?.async("text");
    expect(relationships).toBeTruthy();
    zip.file(relationshipsPath, String(relationships).replace(
      "</Relationships>",
      '<Relationship Id="external" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.invalid" TargetMode="External"/></Relationships>',
    ));
    const unsafe = await zip.generateAsync({ type: "arraybuffer" });

    const validation = await validateTemplateFile(unsafe, "external.docx");
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toContain("External relationship");
    expect(source.byteLength).toBeGreaterThan(5_000);
  });

  it("rejects image commands mixed with other paragraph text", async () => {
    const document = new Document({ sections: [{ children: [new Paragraph("Logo: {{qs.block.image}}")]}] });
    const validation = await validateTemplateFile(
      await blobToArrayBuffer(await Packer.toBlob(document)),
      "unsafe-image.docx",
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toContain("Image command must be alone");
  });
});
