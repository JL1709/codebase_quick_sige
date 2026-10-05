import { Document, Footer, Header, Packer, Paragraph, TextRun } from "docx";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "../data/seed";
import { instantiateOverviewSection } from "../domain/overviewTemplates";
import { projectWithResolvedParticipants } from "../domain/contacts";
import {
  blobToArrayBuffer, buildTemplateData, createStandardTemplate, documentDependencyFingerprint, inspectTemplate,
  MAX_TEMPLATE_FILE_BYTES, templatePlaceholderReference, renderTemplate, validateTemplateFile,
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

async function paragraphTemplate(paragraphs: string[]): Promise<ArrayBuffer> {
  return blobToArrayBuffer(await Packer.toBlob(new Document({ sections: [{ children: paragraphs.map((text) => new Paragraph(text)) }] })));
}

describe("Word template engine", () => {
  it("fits project images onto a page while preserving their original aspect ratio", () => {
    const database = createSeedDatabase();
    const project = { ...database.projects[0], assets: [{ ...database.projects[0].assets[0], width: 400, height: 800, dataUrl: "data:image/png;base64,AQID" }] };
    const data = buildTemplateData(project, undefined, "de", []) as { qs: { project: { files: Array<{ image: unknown }> } } };
    const image = data.qs.project.files[0].image;
    expect(image).toMatchObject({ width: 8.75, height: 17.5 });
  });
  it("derives paths from current labels and leaves the uploaded template detached", async () => {
    const database = createSeedDatabase();
    const project = structuredClone(database.projects[0]);
    const section = project.overviewSections.find((candidate) => candidate.name === "Allgemein")!;
    const date = section.entries.find((entry) => entry.label === "Geplanter Beginn")!;
    date.value = "2030-01-02";
    const template = await commandTemplate("qs.project.allgemein.geplanter_beginn");
    const originalBytes = template.slice(0);
    let data = buildTemplateData(project, undefined, "de", []);
    expect(await documentXml(await renderTemplate(template, data))).toContain("02.01.2030");
    section.name = "Bauablauf";
    date.label = "Baubeginn";
    data = buildTemplateData(project, undefined, "de", []);
    expect((await inspectTemplate(template, data)).missingPlaceholders).toEqual(["qs.project.allgemein.geplanter_beginn"]);
    expect(templatePlaceholderReference(data)).toContain("{{qs.project.bauablauf.baubeginn}}");
    expect(templatePlaceholderReference(data)).not.toContain("{{qs.project.start_date}}");
    expect(await documentXml(await renderTemplate(await commandTemplate("qs.project.bauablauf.baubeginn"), data))).toContain("02.01.2030");
    expect(new Uint8Array(template)).toEqual(new Uint8Array(originalBytes));
  });

  it("uses the visible participant section name and emits each assigned person once", async () => {
    const database = createSeedDatabase();
    database.projectContactAssignments[0].roles.push({ id: "second-role", role: "contractor" });
    const project = { ...projectWithResolvedParticipants(database, database.projects[0]), participantsSectionName: "Bauteam" };
    const data = buildTemplateData(project, undefined, "de", []);
    const template = await paragraphTemplate(["{{#qs.project.bauteam}}", "{{qs.project.bauteam.name}} | {{qs.project.bauteam.role}}", "{{/qs.project.bauteam}}"]);
    expect((await inspectTemplate(template, data)).missingPlaceholders).toEqual([]);
    const xml = await documentXml(await renderTemplate(template, data));
    expect(xml.match(/Dr\. Anna Richter/g)).toHaveLength(1);
    expect(xml).toContain("Bauherr, Auftragnehmer");
    expect(templatePlaceholderReference(data)).toContain("{{qs.project.bauteam.email}}");
    expect((await inspectTemplate(await commandTemplate("qs.participants"), data)).missingPlaceholders).toEqual(["qs.participants"]);
  });

  it("keeps participant paths stable across document languages while localizing values", async () => {
    const database = createSeedDatabase();
    const project = { ...projectWithResolvedParticipants(database, database.projects[0]), participantsSectionName: "Bauteam" };
    const section = project.overviewSections.find((candidate) => candidate.name === "Allgemein")!;
    section.entries.find((entry) => entry.label === "Geplanter Beginn")!.value = "2030-01-02";
    const template = await paragraphTemplate([
      "Statischer deutscher Text",
      "{{qs.project.allgemein.geplanter_beginn}}",
      "{{#qs.project.bauteam}}",
      "{{qs.project.bauteam.name}} | {{qs.project.bauteam.company}} | {{qs.project.bauteam.role}} | {{qs.project.bauteam.email}} | {{qs.project.bauteam.phone}}",
      "{{/qs.project.bauteam}}",
    ]);
    const german = buildTemplateData(project, undefined, "de", []);
    const english = buildTemplateData(project, undefined, "en", []);
    expect(templatePlaceholderReference(german)).toEqual(templatePlaceholderReference(english));
    for (const data of [german, english]) expect((await inspectTemplate(template, data)).missingPlaceholders).toEqual([]);
    const germanXml = await documentXml(await renderTemplate(template, german));
    const englishXml = await documentXml(await renderTemplate(template, english));
    expect(germanXml).toContain("02.01.2030");
    expect(germanXml).toContain("Bauherr");
    expect(englishXml).toContain("02/01/2030");
    expect(englishXml).toContain("Owner");
    for (const xml of [germanXml, englishXml]) {
      expect(xml).toContain("Statischer deutscher Text");
      expect(xml).toContain("Westpark Projekt GmbH");
      expect(xml).not.toContain("{{");
    }
    expect((await inspectTemplate(await commandTemplate("qs.project.bauteam.unternehmen"), german)).missingPlaceholders).toEqual(["qs.project.bauteam.unternehmen"]);
  });

  it.each(["de", "en"] as const)("exposes stable participant fields for an empty collection in %s", async (locale) => {
    const database = createSeedDatabase();
    const data = buildTemplateData({ ...database.projects[0], participants: [] }, undefined, locale, []);
    const fields = ["name", "company", "role", "email", "phone"].map((key) => `qs.project.projektbeteiligte.${key}`);
    for (const path of fields) expect(templatePlaceholderReference(data)).toContain(`{{${path}}}`);
    const template = await paragraphTemplate(["{{#qs.project.projektbeteiligte}}", ...fields.map((path) => `{{${path}}}`), "{{/qs.project.projektbeteiligte}}"]);
    expect((await inspectTemplate(template, data)).missingPlaceholders).toEqual([]);
    expect(await documentXml(await renderTemplate(template, data))).not.toContain("{{");
  });

  it("recognizes declared fields in empty collections and reports unknown full paths", async () => {
    const database = createSeedDatabase();
    const section = instantiateOverviewSection(database.overviewTemplates.find((template) => template.id === "overview-template-emergency")!, (prefix) => `${prefix}-${crypto.randomUUID()}`);
    section.entries[0].items = [];
    const data = buildTemplateData({ ...database.projects[0], overviewSections: [section], participants: [] }, undefined, "de", []);
    const template = await paragraphTemplate(["{{#qs.project.notfallkontakte.kontakte}}", "{{qs.project.notfallkontakte.kontakte.telefon}}", "{{qs.project.notfallkontakte.kontakte.typfehler}}", "{{/qs.project.notfallkontakte.kontakte}}"]);
    expect((await inspectTemplate(template, data)).missingPlaceholders).toEqual(["qs.project.notfallkontakte.kontakte.typfehler"]);
    expect(templatePlaceholderReference(data)).toContain("{{qs.project.notfallkontakte.kontakte.telefon}}");
    expect(await documentXml(await renderTemplate(template, data))).not.toContain("{{");
  });

  it("leaves an unassigned participant role empty", async () => {
    const database = createSeedDatabase();
    database.projectContactAssignments[0].roles = [];
    const project = { ...projectWithResolvedParticipants(database, database.projects[0]), participantsSectionName: "Team" };
    const data = buildTemplateData(project, undefined, "en", []);
    const template = await paragraphTemplate(["{{#qs.project.team}}", "{{qs.project.team.name}} {{qs.project.team.role}}", "{{/qs.project.team}}"]);
    expect((await inspectTemplate(template, data)).missingPlaceholders).toEqual([]);
    const xml = await documentXml(await renderTemplate(template, data));
    expect(xml).not.toContain("Other role");
    expect(xml).toContain("Dr. Anna Richter");
  });

  it("renders unknown nested text, images, and loops empty in body, header, and footer", async () => {
    const document = new Document({ sections: [{
      headers: { default: new Header({ children: [new Paragraph("Header {{qs.project.absent.header}}") ] }) },
      footers: { default: new Footer({ children: [new Paragraph("Footer {{qs.project.absent.footer}}") ] }) },
      children: [new Paragraph("Before {{qs.project.absent.field}} after"), new Paragraph("{{qs.project.absent.image}}"), new Paragraph("{{#qs.project.absent.rows}}"), new Paragraph("{{qs.project.absent.rows.name}}"), new Paragraph("{{/qs.project.absent.rows}}")],
    }] });
    const template = await blobToArrayBuffer(await Packer.toBlob(document));
    const data = buildTemplateData(undefined, undefined, "en", []);
    const inspection = await inspectTemplate(template, data);
    expect(inspection.unsafeCommands).toEqual([]);
    expect(inspection.missingPlaceholders).toContain("qs.project.absent.rows.name");
    const zip = await JSZip.loadAsync(await blobToArrayBuffer(await renderTemplate(template, data)));
    const xml = await zip.file("word/document.xml")!.async("text");
    expect(new DOMParser().parseFromString(xml, "application/xml").documentElement.textContent?.replace(/\s+/g, " ")).toContain("Before after");
    for (const part of ["word/document.xml", "word/header1.xml", "word/footer1.xml"]) expect(await zip.file(part)!.async("text")).not.toContain("{{");
    expect(xml).not.toContain("<w:drawing>");
  });

  it("resolves nested collections with identical group names through their full paths", async () => {
    const data = { qs: { project: { rows: [{ name: "Outer", rows: [{ name: "Inner" }] }] } } };
    const template = await paragraphTemplate(["{{#qs.project.rows}}", "{{qs.project.rows.name}}", "{{#qs.project.rows.rows}}", "{{qs.project.rows.rows.name}}", "{{/qs.project.rows.rows}}", "{{/qs.project.rows}}"]);
    expect((await inspectTemplate(template, data)).missingPlaceholders).toEqual([]);
    const xml = await documentXml(await renderTemplate(template, data));
    expect(xml).toContain("Outer");
    expect(xml).toContain("Inner");
  });

  it("does not resolve inherited object properties", async () => {
    const data = buildTemplateData(undefined, undefined, "en", []);
    const template = await commandTemplate("qs.project.constructor.name");
    expect((await inspectTemplate(template, data)).missingPlaceholders).toEqual(["qs.project.constructor.name"]);
    expect(await documentXml(await renderTemplate(template, data))).not.toContain("Object");
  });

  it("treats custom fields named Image, Color, and Cell fill as ordinary user data", async () => {
    const data = { qs: { project: { details: { image: { caption: "Site photo" }, rows: [{ image: "Drawing reference", color: "Blue", cell_fill: "User value" }] } } } };
    const template = await paragraphTemplate(["{{qs.project.details.image.caption}}", "{{#qs.project.details.rows}}", "Image: {{qs.project.details.rows.image}}", "{{qs.project.details.rows.color}}", "{{qs.project.details.rows.cell_fill}}", "{{/qs.project.details.rows}}"]);
    expect((await validateTemplateFile(template, "custom-labels.docx")).valid).toBe(true);
    expect((await inspectTemplate(template, data)).missingPlaceholders).toEqual([]);
    const xml = await documentXml(await renderTemplate(template, data));
    expect(xml).toContain("Drawing reference");
    expect(xml).toContain("Blue");
    expect(xml).toContain("User value");
    expect(templatePlaceholderReference(data)).toContain("{{qs.project.details.image.caption}}");
    expect(templatePlaceholderReference(data)).toContain("{{qs.project.details.rows.cell_fill}}");
  });
  it("exposes organization fields and embeds a logo without stretching it", async () => {
    const database = createSeedDatabase();
    const logoDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X0YV5wAAAABJRU5ErkJggg==";
    const organization = {
      ...database.organization,
      name: "Example Engineering",
      email: "office@example.test",
      address: { ...database.organization.address, street: "Example Street", houseNumber: "12a", postalCode: "01234", city: "Berlin", countryCode: "DE" },
      logo: { blobId: "company-logo", filename: "logo.png", mimeType: "image/png" as const, width: 240, height: 80 },
      logoDataUrl,
    };
    const data = buildTemplateData(database.projects[0], database.plans[0], "en", database.blocks, database.categories, organization) as {
      qs: { organization: { name: string; formatted_address: string; logo: { image: { width: number; height: number } } } };
    };
    expect(data.qs.organization.formatted_address).toContain("01234 Berlin");
    expect(data.qs.organization.logo.image.width / data.qs.organization.logo.image.height).toBe(3);
    const template = await blobToArrayBuffer(await createStandardTemplate("a4_plan", "en"));
    const rendered = await renderTemplate(template, data);
    const xml = await documentXml(rendered);
    expect(xml).toContain("Example Engineering");
    expect(xml).toContain("office@example.test");
    expect(xml).toContain("01234 Berlin");
    expect(xml).toContain("<w:drawing>");
    expect(xml).not.toContain("{{");
  });

  it("keeps historical reports without an organization snapshot unbranded", async () => {
    const database = createSeedDatabase();
    const data = buildTemplateData(database.projects[0], database.plans[0], "en", database.blocks, database.categories);
    const template = await blobToArrayBuffer(await createStandardTemplate("a4_plan", "en"));
    const xml = await documentXml(await renderTemplate(template, data));
    expect(xml).not.toContain(database.organization.name);
    expect(xml).not.toContain("{{");
  });

  it("includes organization changes in the document dependency fingerprint", () => {
    const database = createSeedDatabase();
    const original = documentDependencyFingerprint(database.projects[0], "en", database.plans[0], database.organization);
    database.organization.email = "updated@example.test";
    expect(documentDependencyFingerprint(database.projects[0], "en", database.plans[0], database.organization)).not.toBe(original);
  });
  it("uses the requested document language for safety-plan text and language values", () => {
    const database = createSeedDatabase();
    const data = buildTemplateData(database.projects[0], database.plans[0], "en", database.blocks, database.categories) as {
      qs: { project: { language: string; plan: { title: string; blocks: Array<{ title: string }> } } };
    };

    expect(data.qs.project.language).toBe("en");
    expect(data.qs.project.plan.title).toBe("Safety and Health Plan");
    expect(data.qs.project.plan.blocks.some((block) => block.title === "Organize first aid")).toBe(true);
  });

  it("derives a depth-first category tree with blocks only on their direct category", () => {
    const database = createSeedDatabase();
    const plan = structuredClone(database.plans[0]);
    plan.sections = [{
      id: "section-mobile-distribution-units",
      categoryId: "mobile-distribution-units",
      items: [{ id: "item-import-small-distribution", blockId: "import-small-distribution" }],
    }];
    plan.layout.elements = [];

    const data = buildTemplateData(database.projects[0], plan, "en", database.blocks, database.categories) as {
      qs: {
        project: { plan: {
          category_tree: Array<{ id: string; depth: number; path: string; blocks: Array<{ title: string }> }>;
        } };
      };
    };

    expect(data.qs.project.plan.category_tree.map((category) => category.id)).toEqual([
      "site-setup",
      "site-utilities",
      "site-power-water",
      "temporary-electrical-distribution",
      "mobile-distribution-units",
    ]);
    expect(data.qs.project.plan.category_tree.map((category) => category.depth)).toEqual([0, 1, 2, 3, 4]);
    expect(data.qs.project.plan.category_tree.at(-1)?.path).toBe(
      "Site setup › Utilities and infrastructure › Temporary power, water, and mobile tanks › Temporary electrical distribution › Mobile distribution units",
    );
    expect(data.qs.project.plan.category_tree.slice(0, -1).every((category) => category.blocks.length === 0)).toBe(true);
    expect(data.qs.project.plan.category_tree.at(-1)?.blocks.map((block) => block.title)).toEqual(["Portable electrical distribution board"]);
    expect("sections" in data.qs.project.plan).toBe(false);
    expect("categories" in data.qs.project.plan).toBe(false);
  });

  it("distinguishes an undefined placeholder from a defined empty value", async () => {
    const database = createSeedDatabase();
    const project = { ...database.projects[0], name: "" };
    const data = buildTemplateData(project, database.plans[0], database.user.preferredLocale, database.blocks);

    const existing = await inspectTemplate(await commandTemplate("qs.project.name"), data);
    const missing = await inspectTemplate(await commandTemplate("qs.project.not_defined"), data);

    expect(existing.missingPlaceholders).toEqual([]);
    expect(missing.missingPlaceholders).toEqual(["qs.project.not_defined"]);
  });

  it("exposes hierarchical overview-template values to the Word engine", async () => {
    const database = createSeedDatabase();
    const template = database.overviewTemplates.find((candidate) => candidate.id === "overview-template-emergency")!;
    let sequence = 0;
    const section = instantiateOverviewSection(template, (prefix) => `${prefix}-${++sequence}`);
    const project = { ...database.projects[0], overviewSections: [section] };
    const data = buildTemplateData(project, database.plans[0], database.user.preferredLocale, database.blocks) as {
      qs: { project: { notfallkontakte: { kontakte: Array<{ telefon: string }> } } };
    };

    expect(data.qs.project.notfallkontakte.kontakte[0].telefon).toBe("112");
    const loop = new Document({ sections: [{ children: [new Paragraph("{{#qs.project.notfallkontakte.kontakte}}"), new Paragraph("{{qs.project.notfallkontakte.kontakte.telefon}}"), new Paragraph("{{/qs.project.notfallkontakte.kontakte}}")] }] });
    const inspection = await inspectTemplate(await blobToArrayBuffer(await Packer.toBlob(loop)), data);
    expect(inspection.missingPlaceholders).toEqual([]);
  });

  it("blocks executable commands before rendering", async () => {
    const database = createSeedDatabase();
    const template = await commandTemplate("EXEC globalThis.compromised = true");
    const data = buildTemplateData(database.projects[0], database.plans[0], database.user.preferredLocale, database.blocks);

    const inspection = await inspectTemplate(template, data);
    expect(inspection.unsafeCommands).toHaveLength(1);
    await expect(renderTemplate(template, data)).rejects.toThrow("Unsafe template commands");
  });

  it("rejects the legacy Word-template command syntax", async () => {
    for (const command of [
      "INS qs.project.name",
      "IMAGE qs.project.plan.category_tree.blocks.image",
      "FOR block IN qs.project.plan.blocks",
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
    const data = buildTemplateData(database.projects[0], database.plans[0], database.user.preferredLocale, database.blocks, database.categories);
    const generated = await renderTemplate(templateBuffer, data);
    const xml = await documentXml(generated);

    expect((await validateTemplateFile(templateBuffer, "a4-plan.docx")).valid).toBe(true);
    expect(generated.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(generated.size).toBeGreaterThan(10_000);
    expect((await inspectTemplate(await blobToArrayBuffer(generated), data)).placeholders).toEqual([]);
    expect(xml).toContain('w:fill="C8644D"');
    expect(xml).not.toContain("QS_CELL_FILL");
    expect(xml).not.toContain("QS_TEXT_COLOR");
    expect(xml).toContain('<w:gridCol w:w="10466"/>');
    expect(xml).not.toContain('<w:gridCol w:w="100"/>');
    expect(xml).toContain('<wp:extent cx="1908000" cy="1296000"/>');

    const xmlDocument = new DOMParser().parseFromString(xml, "application/xml");
    const blockTable = [...xmlDocument.getElementsByTagName("w:tbl")]
      .find((table) => table.textContent?.includes("Sichere Baustellenzugänge"));
    const blockRow = blockTable?.getElementsByTagName("w:tr")[0];
    const blockRowProperties = [...(blockRow?.children ?? [])]
      .find((element) => element.localName === "trPr");
    expect(blockTable).toBeDefined();
    expect(blockTable?.getElementsByTagName("w:tc")).toHaveLength(3);
    expect(blockTable?.getElementsByTagName("w:tbl")).toHaveLength(0);
    expect([...(blockRowProperties?.children ?? [])].some((element) => element.localName === "cantSplit")).toBe(true);
  });

  it("renders the friendly placeholder syntax even when Word splits a marker across runs", async () => {
    const database = createSeedDatabase();
    const document = new Document({ sections: [{ children: [
      new Paragraph({ children: [new TextRun("{{#qs.project.plan."), new TextRun("blocks}}")]}),
      new Paragraph("{{qs.project.plan.blocks.title}}"),
      new Paragraph("{{/qs.project.plan.blocks}}"),
    ] }] });
    const template = await blobToArrayBuffer(await Packer.toBlob(document));
    const data = buildTemplateData(database.projects[0], database.plans[0], database.user.preferredLocale, database.blocks, database.categories);

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

    expect(xml).toContain("{{#qs.project.plan.category_tree}}");
    expect(xml).toContain("{{qs.project.plan.category_tree.title}}");
    expect(xml).toContain("{{#qs.project.plan.category_tree.blocks}}");
    expect(xml).toContain("{{qs.project.plan.category_tree.blocks.a4_description}}");
    expect(xml).toContain("{{qs.project.plan.category_tree.blocks.image}}");
    expect(xml).toContain("{{qs.project.plan.category_tree.blocks.regulations}}");
    expect(xml).not.toContain("qs.section");
  });

  it("rejects unmatched loop scopes and nesting beyond the category hierarchy", async () => {
    const unmatchedEnd = await commandTemplate("/qs.project.plan.blocks");
    const missingEnd = await commandTemplate("#qs.project.plan.blocks");
    const nestedDocument = new Document({ sections: [{ children: [
      new Paragraph("{{#qs.project.plan.category_tree}}"),
      new Paragraph("{{#qs.project.plan.category_tree.blocks}}"),
      new Paragraph("{{#qs.project.plan.category_tree.blocks.items}}"),
      new Paragraph("{{#qs.project.plan.category_tree.blocks.items.children}}"),
      new Paragraph("{{/qs.project.plan.category_tree.blocks.items.children}}"),
      new Paragraph("{{/qs.project.plan.category_tree.blocks.items}}"),
      new Paragraph("{{/qs.project.plan.category_tree.blocks}}"),
      new Paragraph("{{/qs.project.plan.category_tree}}"),
    ] }] });
    const nested = await blobToArrayBuffer(await Packer.toBlob(nestedDocument));

    expect((await inspectTemplate(unmatchedEnd, {})).unsafeCommands.join(" ")).toContain("/qs.project.plan.blocks");
    expect((await inspectTemplate(missingEnd, {})).unsafeCommands).toContain("Missing closing loop marker for qs.project.plan.blocks");
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
    const document = new Document({ sections: [{ children: [new Paragraph("Logo: {{qs.project.plan.category_tree.blocks.image}}")]}] });
    const validation = await validateTemplateFile(
      await blobToArrayBuffer(await Packer.toBlob(document)),
      "unsafe-image.docx",
    );
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toContain("Image command must be alone");
  });
});
