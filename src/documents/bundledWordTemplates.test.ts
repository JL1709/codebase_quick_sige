// @vitest-environment node
import { readFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { BUNDLED_WORD_TEMPLATE_CATALOG, createBundledWordTemplates } from "../data/bundledWordTemplates";
import { createSeedDatabase } from "../data/seed";
import { projectWithResolvedParticipants } from "../domain/contacts";
import { blobToArrayBuffer, buildTemplateData, inspectTemplate, renderTemplate, validateTemplateFile } from "./templateEngine";

describe("bundled project Word templates", () => {
  it.each(BUNDLED_WORD_TEMPLATE_CATALOG)("fills $name with current project and organization data, including the real footer", async ({ filename }) => {
    const database = createSeedDatabase();
    const project = { ...projectWithResolvedParticipants(database, database.projects[0]), name: "Changed example project" };
    const organization = { ...database.organization, name: "Changed organization", email: "new@example.test" };
    const data = buildTemplateData(project, undefined, "de", database.blocks, database.categories, organization);
    const bytes = await readFile(new URL(`../../public/word-templates/${filename}`, import.meta.url));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    expect((await validateTemplateFile(buffer, filename)).valid).toBe(true);
    expect(await inspectTemplate(buffer, data)).toMatchObject({ missingPlaceholders: [], unsafeCommands: [] });
    const generated = unzipSync(new Uint8Array(await blobToArrayBuffer(await renderTemplate(buffer, data))));
    const body = strFromU8(generated["word/document.xml"]);
    const footers = Object.entries(generated).filter(([name]) => /^word\/footer\d+\.xml$/.test(name)).map(([, xml]) => strFromU8(xml)).join("");
    expect(body).toContain("Changed example project");
    expect(footers).toContain("Changed organization");
    expect(footers).toContain("new@example.test");
    expect(footers).toContain("<w:tbl>");
    expect(footers).toContain("NUMPAGES");
    expect(body + footers).not.toMatch(/\{\{|DOCVARIABLE|DOCPROPERTY|IKE Mustermann|iqsoftware/);
    if (filename === "alarmplan.docx") {
      expect(body).toContain("Klinikum Nord");
      expect(body).toContain("Dr. Anna Richter");
      expect(body).toContain("Daniel König");
      const tables = [...body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>/g)].map((match) => match[0]);
      const emergencyRows = [...tables[2].matchAll(/<w:tr>[\s\S]*?<\/w:tr>/g)].map((match) => match[0]);
      expect(emergencyRows).toHaveLength(4);
      expect(emergencyRows[1]).toContain("112");
      expect(emergencyRows[1]).not.toContain("Polizei");
      expect(emergencyRows[3]).toContain("Klinikum Nord");
    }
    if (filename === "vorankuendigung.docx") {
      expect(body).toContain("Arbeitsschutzbehörde Musterregion");
      expect(body).toContain("12.10.2026");
      expect(body).toContain("48");
    }
  });

  it.each(["de", "en"] as const)("fills the same Alarmplan participant paths in %s", async (locale) => {
    const database = createSeedDatabase();
    const project = projectWithResolvedParticipants(database, database.projects[0]);
    const data = buildTemplateData(project, undefined, locale, database.blocks, database.categories, database.organization);
    const bytes = await readFile(new URL("../../public/word-templates/alarmplan.docx", import.meta.url));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    expect((await inspectTemplate(buffer, data)).missingPlaceholders).toEqual([]);
    const generated = unzipSync(new Uint8Array(await blobToArrayBuffer(await renderTemplate(buffer, data))));
    const body = strFromU8(generated["word/document.xml"]);
    expect(body).toContain(locale === "de" ? "Bauherr" : "Owner");
    expect(body).toContain("Westpark Projekt GmbH");
    expect(body).toContain("Daniel König");
    expect(body).not.toContain("{{");
  });

  it("provides a unique editable catalog independent of organization identity", () => {
    const templates = createBundledWordTemplates("another-organization");
    expect(templates).toHaveLength(20);
    expect(new Set(templates.map((template) => template.id)).size).toBe(20);
    expect(new Set(templates.map((template) => template.filename)).size).toBe(20);
    expect(templates.every((template) => template.organizationId === "another-organization" && template.origin === "custom")).toBe(true);
  });
});
