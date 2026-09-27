import { Document, Packer, Paragraph } from "docx";
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

describe("Word template engine", () => {
  it("distinguishes an undefined placeholder from a defined empty value", async () => {
    const database = createSeedDatabase();
    const project = { ...database.projects[0], description: "" };
    const data = buildTemplateData(project, database.plans[0], database.blocks);

    const existing = await inspectTemplate(await commandTemplate("INS qs.project.description"), data);
    const missing = await inspectTemplate(await commandTemplate("INS qs.overview.not_defined"), data);

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
    const inspection = await inspectTemplate(await commandTemplate("INS qs.overview.notfallkontakte.kontakte.0.telefon"), data);
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

  it("expands the standard A4 block loop into a valid DOCX", async () => {
    const database = createSeedDatabase();
    const template = await createStandardTemplate("a4_plan", "de");
    const data = buildTemplateData(database.projects[0], database.plans[0], database.blocks);
    const generated = await renderTemplate(await blobToArrayBuffer(template), data);

    expect(generated.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(generated.size).toBeGreaterThan(10_000);
    expect((await inspectTemplate(await blobToArrayBuffer(generated), data)).placeholders).toEqual([]);
  });

  it("normalizes Unicode labels into stable ASCII placeholder keys", () => {
    expect(normalizePlaceholderKey("Nächster Prüf-Ort", "field")).toBe("nachster_pruf_ort");
    expect(normalizePlaceholderKey("***", "field_4")).toBe("field_4");
  });

  it("rejects unmatched and over-nested loop scopes", async () => {
    const unmatchedEnd = await commandTemplate("END-FOR block");
    const missingEnd = await commandTemplate("FOR block IN qs.plan.blocks");
    const nestedDocument = new Document({ sections: [{ children: [
      new Paragraph("{{FOR section IN qs.plan.sections}}"),
      new Paragraph("{{FOR block IN $section.blocks}}"),
      new Paragraph("{{FOR nested IN $section.blocks}}"),
      new Paragraph("{{END-FOR nested}}"),
      new Paragraph("{{END-FOR block}}"),
      new Paragraph("{{END-FOR section}}"),
    ] }] });
    const nested = await blobToArrayBuffer(await Packer.toBlob(nestedDocument));

    expect((await inspectTemplate(unmatchedEnd, {})).unsafeCommands.join(" ")).toContain("unmatched loop end");
    expect((await inspectTemplate(missingEnd, {})).unsafeCommands).toContain("Missing END-FOR for block");
    expect((await inspectTemplate(nested, {})).unsafeCommands.join(" ")).toContain("loop nesting is limited to two levels");
  });

  it("rejects invalid packages, macro extensions, oversized files, and unsafe compression", async () => {
    const invalid = new Uint8Array([0, 1, 2, 3]).buffer;
    expect((await validateTemplateFile(invalid, "invalid.docx")).valid).toBe(false);

    const normal = await commandTemplate("INS qs.project.name");
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
    const source = await commandTemplate("INS qs.project.name");
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
    const document = new Document({ sections: [{ children: [new Paragraph("Logo: {{IMAGE qs.plan.blocks}}")]}] });
    const validation = await validateTemplateFile(
      await blobToArrayBuffer(await Packer.toBlob(document)),
      "unsafe-image.docx",
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toContain("Image command must be alone");
  });
});
