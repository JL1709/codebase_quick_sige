import { readFile } from "node:fs/promises";
import { Document, Packer, Paragraph } from "docx";
import { strFromU8, unzipSync } from "fflate";
import { expect, test, type Page } from "@playwright/test";
import catalog from "../src/data/wordTemplateCatalog.json" with { type: "json" };

async function uploadTemplate(page: Page, name: string, paragraphs: string[]): Promise<Buffer> {
  const buffer = await Packer.toBuffer(new Document({ sections: [{ children: paragraphs.map((text) => new Paragraph(text)) }] }));
  await page.getByRole("button", { name: "Add Word template" }).click();
  await page.getByRole("dialog").getByLabel("Template name").fill(name);
  await page.getByLabel("DOCX file").setInputFiles({ name: "report.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer });
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  return buffer;
}

async function storedOutputCounts(page: Page) {
  return page.evaluate(() => {
    const database = JSON.parse(localStorage.getItem("quicksige.database.v3") ?? "{}");
    return { outputs: database.generatedDocuments.length, assets: database.projects.reduce((total: number, project: { assets: unknown[] }) => total + project.assets.length, 0), configurations: database.documentConfigurations.length };
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /English/ }).click();
  await page.goto("/templates");
});

test("generates every bundled template for the example project and downloads without storing documents", async ({ page }) => {
  const countsBefore = await storedOutputCounts(page);
  for (const template of catalog) {
    const row = page.locator(".template-row").filter({ has: page.getByText(template.name, { exact: true }) });
    await expect(row).toHaveCount(1);
    await row.getByRole("button", { name: "Create document" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Project", { exact: true }).selectOption("project-logistics-center");
    const downloadPromise = page.waitForEvent("download");
    await dialog.getByRole("button", { name: "Create document" }).click();
    const download = await downloadPromise;
    const files = unzipSync(await readFile((await download.path())!));
    const body = strFromU8(files["word/document.xml"]);
    const footer = Object.entries(files).filter(([name]) => /^word\/footer\d+\.xml$/.test(name)).map(([, bytes]) => strFromU8(bytes)).join("");
    expect(body).toContain("Logistikzentrum West");
    expect(body).toContain("LW-2026-001");
    expect(footer).toContain("Sicher Planen Ingenieure");
    expect(footer).toContain("kontakt@sicher-planen.example.test");
    expect(body + footer).not.toContain("{{");
    if (template.slug === "lageplan") {
      const sitePlan = await readFile("public/project-documents/logistikzentrum-west/lageplan.jpg");
      expect(Object.entries(files).some(([name, bytes]) => name.startsWith("word/media/") && Buffer.from(bytes).equals(sitePlan))).toBe(true);
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  expect(await storedOutputCounts(page)).toEqual(countsBefore);
});

test("keeps a bundled template replacement and deletion across reloads", async ({ page }) => {
  const row = page.locator(".template-row").filter({ has: page.getByText("Alarmplan", { exact: true }) });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByLabel("Template name").fill("My alarm plan");
  const replacement = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Replacement {{qs.project.name}}") ] }] }));
  await modal.getByLabel("DOCX file").setInputFiles({ name: "my-alarm-plan.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: replacement });
  await modal.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  const replacedRow = page.locator(".template-row").filter({ hasText: "My alarm plan" });
  const downloadPromise = page.waitForEvent("download");
  await replacedRow.getByRole("button", { name: "Download", exact: true }).click();
  expect(await readFile((await (await downloadPromise).path())!)).toEqual(replacement);
  await replacedRow.getByRole("button", { name: "Delete: My alarm plan" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await page.reload();
  await expect(page.getByText("My alarm plan", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Alarmplan", { exact: true })).toHaveCount(0);
});

test("keeps placeholder paths stable when interface and template languages change", async ({ page }) => {
  await page.getByLabel("Project for placeholders").selectOption("project-logistics-center");
  await expect(page.getByText("{{qs.project.allgemein.nummer}}", { exact: true })).toBeVisible();
  const englishPaths = await page.locator(".placeholder-copy code").allTextContents();
  await page.getByLabel("Search placeholders").fill("qs.project.projektbeteiligte");
  await expect(page.getByText("{{qs.project.projektbeteiligte.company}}", { exact: true })).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("button", { name: /Deutsch/ }).click();
  await page.goto("/templates");
  await page.getByLabel("Projekt für Platzhalter").selectOption("project-logistics-center");
  await expect(page.getByText("{{qs.project.allgemein.nummer}}", { exact: true })).toBeVisible();
  expect(await page.locator(".placeholder-copy code").allTextContents()).toEqual(englishPaths);
  await page.getByLabel("Platzhalter suchen").fill("qs.project.projektbeteiligte");
  await expect(page.getByText("{{qs.project.projektbeteiligte.company}}", { exact: true })).toBeVisible();
  const germanRow = page.locator(".template-row").filter({ has: page.getByText("Alarmplan", { exact: true }) });
  await germanRow.getByRole("button", { name: "Bearbeiten", exact: true }).click();
  await expect(page.getByLabel("Vorlagensprache")).toHaveAccessibleDescription("Bestimmt Datumsformate und die Sprache eingefügter Texte. Übersetzt die Word-Datei nicht. Platzhalternamen bleiben gleich.");
  await page.getByRole("dialog").getByRole("button", { name: "Abbrechen", exact: true }).click();
  await page.goto("/settings");
  await page.getByRole("button", { name: /English/ }).click();
  await page.goto("/templates");
  const source = await uploadTemplate(page, "Stable language report", [
    "Statischer deutscher Text",
    "{{qs.project.allgemein.geplanter_beginn}}",
    "{{#qs.project.projektbeteiligte}}",
    "{{qs.project.projektbeteiligte.name}} | {{qs.project.projektbeteiligte.company}} | {{qs.project.projektbeteiligte.role}} | {{qs.project.projektbeteiligte.email}} | {{qs.project.projektbeteiligte.phone}}",
    "{{/qs.project.projektbeteiligte}}",
  ]);
  const row = page.locator(".template-row").filter({ hasText: "Stable language report" });
  for (const language of ["de", "en"]) {
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel("Template language")).toHaveAccessibleDescription("Controls date formats and the language of inserted text. Does not translate the Word file. Placeholder names stay the same.");
    await page.getByLabel("Template language").selectOption(language);
    await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
    await row.getByRole("button", { name: "Create document" }).click();
    await page.getByRole("dialog").getByLabel("Project", { exact: true }).selectOption("project-logistics-center");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("dialog").getByRole("button", { name: "Create document" }).click();
    const xml = strFromU8(unzipSync(await readFile((await (await downloadPromise).path())!))["word/document.xml"]);
    expect(xml).toContain(language === "de" ? "12.10.2026" : "12/10/2026");
    expect(xml).toContain(language === "de" ? "Bauherr" : "Owner");
    expect(xml).toContain("Westpark Projekt GmbH");
    expect(xml).toContain("Statischer deutscher Text");
    expect(xml).not.toContain("{{");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  const sourceDownload = page.waitForEvent("download");
  await row.getByRole("button", { name: "Download", exact: true }).click();
  expect(await readFile((await (await sourceDownload).path())!)).toEqual(source);
});

test("creates a custom document for a project without a plan and only downloads the output", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Document-only project");
  await page.getByRole("button", { name: "Create project", exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/plan$/);
  const projectId = page.url().match(/projects\/([^/]+)/)![1];
  await page.goto("/templates");
  await uploadTemplate(page, "Project summary", ["Project: {{qs.project.name}}", "Organization: {{qs.organization.name}}", "Number: {{qs.project.number}}"]);
  const countsBefore = await storedOutputCounts(page);
  const row = page.locator(".template-row").filter({ hasText: "Project summary" });
  await row.getByRole("button", { name: "Create document" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Create document" })).toBeDisabled();
  await dialog.getByLabel("Project", { exact: true }).selectOption(projectId);
  const downloadPromise = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Create document" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("document-only-project-project-summary.docx");
  const xml = strFromU8(unzipSync(await readFile((await download.path())!))["word/document.xml"]);
  expect(xml).toContain("Document-only project");
  expect(xml).not.toContain("{{");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await storedOutputCounts(page)).toEqual(countsBefore);
  await expect(page).toHaveURL(/\/templates$/);
});

test("lists unknown nested paths, cancels, and can download with empty values without rewriting the template", async ({ page }) => {
  const source = await uploadTemplate(page, "Unknown fields", ["Project {{qs.project.name}}", "Before {{qs.project.absent.field}} after", "{{qs.project.absent.image}}", "{{#qs.project.absent.rows}}", "{{qs.project.absent.rows.name}}", "{{/qs.project.absent.rows}}"]);
  const row = page.locator(".template-row").filter({ hasText: "Unknown fields" });
  const countsBefore = await storedOutputCounts(page);
  await row.getByRole("button", { name: "Create document" }).click();
  await page.getByRole("dialog").getByLabel("Project", { exact: true }).selectOption("project-logistics-center");
  await page.getByRole("dialog").getByRole("button", { name: "Create document" }).click();
  await expect(page.getByRole("heading", { name: "Unknown placeholders" })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("{{qs.project.absent.field}}", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog").getByText("{{qs.project.absent.rows.name}}", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
  expect(await storedOutputCounts(page)).toEqual(countsBefore);

  await row.getByRole("button", { name: "Create document" }).click();
  await page.getByRole("dialog").getByLabel("Project", { exact: true }).selectOption("project-logistics-center");
  await page.getByRole("dialog").getByRole("button", { name: "Create document" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Continue with empty fields" }).click();
  const output = await downloadPromise;
  const xml = strFromU8(unzipSync(await readFile((await output.path())!))["word/document.xml"]);
  expect(xml).toContain("Logistikzentrum West");
  expect(xml).not.toContain("{{");
  expect(xml).not.toContain("<w:drawing>");
  expect(await storedOutputCounts(page)).toEqual(countsBefore);
  const templateDownloadPromise = page.waitForEvent("download");
  await row.getByRole("button", { name: "Download", exact: true }).click();
  const templateDownload = await templateDownloadPromise;
  expect(await readFile((await templateDownload.path())!)).toEqual(source);
});

test("shows current section, field, and participant names in the placeholder reference", async ({ page }) => {
  await page.getByLabel("Project for placeholders").selectOption("project-logistics-center");
  await expect(page.getByText("{{qs.project.allgemein.geplanter_beginn}}", { exact: true })).toBeVisible();
  await page.goto("/projects/project-logistics-center");
  const general = page.locator(".overview-template-section").filter({ has: page.getByRole("heading", { name: "Allgemein", exact: true }) });
  await general.getByRole("button", { name: "Edit", exact: true }).click();
  const editingGeneral = page.locator(".overview-template-section").filter({ has: page.getByRole("button", { name: "Save", exact: true }) });
  await editingGeneral.locator('input[value="Geplanter Beginn"]').fill("Baubeginn");
  await editingGeneral.getByLabel("Section title").fill("Bauablauf");
  await editingGeneral.getByRole("button", { name: "Save", exact: true }).click();
  const participants = page.locator(".project-contacts-panel");
  await participants.getByRole("button", { name: /^Edit section title:/ }).click();
  await participants.getByLabel("Section title").fill("Bauteam");
  await participants.getByRole("button", { name: "Save", exact: true }).click();
  await page.goto("/templates");
  await page.getByLabel("Project for placeholders").selectOption("project-logistics-center");
  await expect(page.getByText("{{qs.project.bauablauf.baubeginn}}", { exact: true })).toBeVisible();
  await expect(page.getByText("{{qs.project.allgemein.geplanter_beginn}}", { exact: true })).toHaveCount(0);
  await page.getByLabel("Search placeholders").fill("qs.project.bauteam");
  await expect(page.getByText("{{qs.project.bauteam.name}}", { exact: true })).toBeVisible();
  await expect(page.getByText("{{qs.project.allgemein.geplanter_beginn}}", { exact: true })).toHaveCount(0);
  await expect(page.getByText("{{qs.project.projektbeteiligte.name}}", { exact: true })).toHaveCount(0);
});

test("keeps document creation and long placeholder paths usable on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Project for placeholders").selectOption("project-logistics-center");
  await expect(page.getByText("{{qs.project.allgemein.geplanter_beginn}}", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator(".template-row").filter({ hasText: "A4 safety plan" }).getByRole("button", { name: "Create document" }).click();
  await expect(page.getByRole("dialog").getByLabel("Project", { exact: true })).toBeVisible();
  await page.getByRole("dialog").screenshot({ path: `test-results/word-document-mobile-${test.info().project.name}.png` });
});

test("groups the reference, copies usable repeat blocks, and contains long paths at every screen width", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text: string) => { (window as unknown as { copiedReference: string }).copiedReference = text; },
    } });
  });
  await page.reload();
  await page.getByLabel("Project for placeholders").selectOption("project-logistics-center");
  const reference = page.getByRole("region", { name: "Placeholder reference" });
  await expect(reference.getByText("{{qs.project.allgemein.nummer}}", { exact: true })).toBeVisible();
  const numberRow = reference.locator('[data-placeholder-path="qs.project.allgemein.nummer"]');
  await expect(numberRow.getByText("Nummer", { exact: true })).toBeVisible();
  await expect(numberRow.getByText("LW-2026-001", { exact: true })).toBeVisible();
  await expect(reference.locator('[data-placeholder-group="qs.project.projektbeteiligte"]')).not.toHaveAttribute("open");
  await reference.getByText("How to use placeholders in Word", { exact: true }).click();
  await expect(reference.getByText(/Renaming a section or field changes its placeholder/)).toBeVisible();
  await reference.getByText("How to use placeholders in Word", { exact: true }).click();
  await page.getByLabel("Search placeholders").fill("qs.project.plan.category_tree.blocks.a4_description");
  const longPath = reference.getByText("{{qs.project.plan.category_tree.blocks.a4_description}}", { exact: true });
  await expect(longPath).toBeVisible();
  await reference.locator('[data-placeholder-group="qs.project.plan.category_tree.blocks"] .reference-repeat-example > summary').click();
  for (const width of [1440, 1024, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await reference.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const tokenBounds = await longPath.boundingBox();
    const referenceBounds = await reference.boundingBox();
    expect(tokenBounds!.x + tokenBounds!.width).toBeLessThanOrEqual(referenceBounds!.x + referenceBounds!.width);
  }
  await page.getByLabel("Search placeholders").fill("no-matching-field");
  await expect(reference.getByText("No matching placeholders. Try a different search.")).toBeVisible();
  await page.getByLabel("Search placeholders").fill("qs.project.projektbeteiligte.company");
  await expect(reference.getByText("{{qs.project.projektbeteiligte.company}}", { exact: true })).toBeVisible();
  await reference.locator('[data-placeholder-group="qs.project.projektbeteiligte"] > summary').click();
  await expect(reference.getByText("{{qs.project.projektbeteiligte.company}}", { exact: true })).not.toBeVisible();
  await page.getByLabel("Search placeholders").fill("qs.project.projektbeteiligte.phone");
  await expect(reference.getByText("{{qs.project.projektbeteiligte.phone}}", { exact: true })).toBeVisible();
  await reference.getByText("Show repeat block example", { exact: true }).click();
  await reference.getByRole("button", { name: "Copy repeat block" }).click();
  await expect(reference.getByRole("button", { name: "Copy repeat block" })).toContainText("Copied");
  const copied = await page.evaluate(() => (window as unknown as { copiedReference: string }).copiedReference);
  expect(copied.split("\n")[0]).toBe("{{#qs.project.projektbeteiligte}}");
  expect(copied).toContain("{{qs.project.projektbeteiligte.email}}");
  expect(copied.split("\n").at(-1)).toBe("{{/qs.project.projektbeteiligte}}");
  await page.setViewportSize({ width: 1280, height: 900 });
  await uploadTemplate(page, "Copied team block", copied.split("\n"));
  const templateRow = page.locator(".template-row").filter({ hasText: "Copied team block" });
  await templateRow.getByRole("button", { name: "Create document" }).click();
  await page.getByRole("dialog").getByLabel("Project", { exact: true }).selectOption("project-logistics-center");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("dialog").getByRole("button", { name: "Create document" }).click();
  const download = await downloadPromise;
  const body = strFromU8(unzipSync(await readFile((await download.path())!))["word/document.xml"]);
  expect(body).toContain("Dr. Anna Richter");
  expect(body).toContain("Daniel König");
  expect(body).toContain("Westpark Projekt GmbH");
  expect(body).not.toContain("{{");
  await page.goto("/settings");
  await page.locator(".language-option").filter({ hasText: "Deutsch" }).click();
  await page.goto("/templates");
  await page.getByLabel("Projekt für Platzhalter").selectOption("project-logistics-center");
  await page.getByLabel("Platzhalter suchen").fill("qs.project.projektbeteiligte.company");
  await expect(page.getByText("{{qs.project.projektbeteiligte.company}}", { exact: true })).toBeVisible();
  await page.getByText("So verwenden Sie Platzhalter in Word", { exact: true }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await page.locator(".template-reference").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
});
