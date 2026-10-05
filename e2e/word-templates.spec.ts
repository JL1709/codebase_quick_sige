import { readFile } from "node:fs/promises";
import { Document, Packer, Paragraph } from "docx";
import { strFromU8, unzipSync } from "fflate";
import { expect, test, type Page } from "@playwright/test";

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
