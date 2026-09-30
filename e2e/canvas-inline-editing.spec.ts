import { expect, test, type Page } from "@playwright/test";
import type { AppDatabase } from "../src/domain/types";

const BLANK_PAPER_EDGE_INSET_PX = 4;

async function readDatabase(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("quicksige.database.v3")!) as AppDatabase);
}

async function clickBlankPaper(page: Page) {
  const paper = (await page.locator(".wysiwyg-page").boundingBox())!;
  await page.mouse.click(paper.x + paper.width - BLANK_PAPER_EDGE_INSET_PX, paper.y + paper.height - BLANK_PAPER_EDGE_INSET_PX);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "English" }).click();
  await page.goto("/projects/project-logistics-center/plan");
  await expect(page.locator(".wysiwyg-page")).toBeVisible();
});

test("clicking blank paper saves a description locally and survives reload", async ({ page, browserName }) => {
  const database = await readDatabase(page);
  const originalCatalog = database.blocks;
  const originalCategories = database.categories;
  const otherPlans = database.plans.filter((plan) => plan.projectId !== "project-logistics-center");
  const description = page.locator('[data-inline-field="blockDescription"]').first();
  const originalDescription = await description.textContent();
  await description.dblclick({ force: true });
  await page.getByLabel("Description on plan").fill("Project-only instruction\nKeep this second line.");
  await clickBlankPaper(page);
  await expect(page.getByLabel("Description on plan")).toHaveCount(0);
  await expect(description).toHaveText("Project-only instruction\nKeep this second line.");
  await page.keyboard.press(browserName === "webkit" ? "Meta+z" : "Control+z");
  await expect(description).toHaveText(originalDescription!);
  await page.keyboard.press(browserName === "webkit" ? "Meta+Shift+z" : "Control+y");
  await expect(description).toHaveText("Project-only instruction\nKeep this second line.");
  expect((await readDatabase(page)).blocks).toEqual(originalCatalog);
  await page.reload();
  await expect(description).toHaveText("Project-only instruction\nKeep this second line.");
  expect((await readDatabase(page)).blocks).toEqual(originalCatalog);
  expect((await readDatabase(page)).categories).toEqual(originalCategories);
  expect((await readDatabase(page)).plans.filter((plan) => plan.projectId !== "project-logistics-center")).toEqual(otherPlans);
});

test("a toolbar action sees the just-saved edit and undo restores it in one step", async ({ page }) => {
  const title = page.locator('[data-inline-field="blockTitle"]').first();
  const originalTitle = await title.textContent();
  await title.dblclick({ force: true });
  await page.getByLabel("Title on plan", { exact: true }).fill("Project-specific title");
  await page.getByRole("button", { name: /^Undo/ }).click({ force: true });
  await expect(title).toHaveText(originalTitle!);
  await page.getByRole("button", { name: /^Redo/ }).click();
  await expect(title).toHaveText("Project-specific title");
});

test("Tab saves a heading and multiline descriptions save with Command or Control Enter", async ({ page, browserName }) => {
  const heading = page.locator('[data-inline-field="sectionTitle"]').first();
  await heading.dblclick({ force: true });
  await page.getByLabel("Section heading").fill("Tab-saved heading");
  await page.getByLabel("Section heading").press("Tab");
  await expect(heading).toHaveText("Tab-saved heading");
  const description = page.locator('[data-inline-field="blockDescription"]').first();
  await description.dblclick({ force: true });
  const editor = page.getByLabel("Description on plan");
  await editor.fill("First line");
  await editor.press("End");
  await editor.press("Enter");
  await editor.pressSequentially("Second line");
  await expect(editor).toHaveValue("First line\nSecond line");
  await editor.press(browserName === "webkit" ? "Meta+Enter" : "Control+Enter");
  await expect(description).toHaveText("First line\nSecond line");
});

test("Escape cancels only that session and the next heading edit saves on blur", async ({ page }) => {
  const heading = page.locator('[data-inline-field="sectionTitle"]').first();
  const originalHeading = await heading.textContent();
  await heading.dblclick({ force: true });
  await page.getByLabel("Section heading").fill("Cancelled title");
  await page.getByLabel("Section heading").press("Escape");
  await expect(heading).toHaveText(originalHeading!);
  await heading.dblclick({ force: true });
  await page.getByLabel("Section heading").fill("Project-only heading");
  await page.getByRole("button", { name: "Fit plan" }).click();
  await expect(heading).toHaveText("Project-only heading");
  await page.reload();
  await expect(heading).toHaveText("Project-only heading");
});
