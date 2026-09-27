import AxeBuilder from "@axe-core/playwright";
import { Document, Packer, Paragraph } from "docx";
import { expect, test, type Page } from "@playwright/test";

async function useEnglishInterface(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: /English/ }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    window.localStorage.clear();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase("quicksige-files");
      request.onsuccess = () => resolve(); request.onerror = () => resolve(); request.onblocked = () => resolve();
    });
  });
  await page.reload();
});

test("complete project workflow remains localized and revision-safe", async ({ page, browserName }) => {
  await useEnglishInterface(page);
  await page.getByRole("link", { name: "Projects" }).click();
  await expect(page.getByRole("heading", { name: /Good morning/ })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/local prototype|\bmvp\b|multilingual catalog/i);

  await page.getByRole("article").filter({ hasText: "Logistikzentrum West" }).getByRole("link", { name: "Open" }).click();
  const navigation = page.getByRole("navigation", { name: "Project navigation" });
  const initialNavigationBox = await navigation.boundingBox();
  expect(initialNavigationBox).not.toBeNull();
  for (const tab of ["Project assessment", "Safety plan", "Documents", "Revisions", "Overview"]) {
    await navigation.getByRole("link", { name: tab, exact: true }).click();
    await expect(navigation).toBeVisible();
    const box = await navigation.boundingBox();
    expect(Math.round(box?.x ?? -1)).toBe(Math.round(initialNavigationBox?.x ?? -2));
    expect(Math.round(box?.width ?? -1)).toBe(Math.round(initialNavigationBox?.width ?? -2));
  }

  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.getByRole("button", { name: "Add field" }).click();
  const keyInputs = page.getByLabel("Label");
  await keyInputs.last().fill("Site induction room");
  await page.getByLabel("Value (optional)").last().fill("");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Site induction room")).toBeVisible();

  await navigation.getByRole("link", { name: "Safety plan", exact: true }).click();
  await expect.poll(() => page.locator(".canvas-block").count()).toBeGreaterThan(0);
  await expect(page.locator(".canvas-asset")).toHaveCount(2);
  await expect(page.locator(".canvas-document")).toHaveCount(1);
  await page.locator('[data-element-id="layout-demo-pdf"]').click({ force: true });
  await page.getByRole("button", { name: "Selected element options" }).click();
  await expect(page.getByLabel("PDF page")).toHaveValue("2");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /block library/i }).click();
  await expect(page.locator(".editor-sidebar")).toHaveCount(0);
  await page.getByRole("button", { name: /block library/i }).click();
  await expect(page.locator(".editor-sidebar")).toBeVisible();
  const blockCountBefore = await page.locator(".canvas-block").count();
  const libraryItem = page.locator(".editor-catalog-card").first();
  const libraryBox = await libraryItem.boundingBox();
  const canvasBox = await page.locator(".wysiwyg-page").boundingBox();
  expect(libraryBox).not.toBeNull(); expect(canvasBox).not.toBeNull();
  await page.mouse.move((libraryBox?.x ?? 0) + 20, (libraryBox?.y ?? 0) + 20);
  await page.mouse.down();
  await page.mouse.move((canvasBox?.x ?? 0) + 420, (canvasBox?.y ?? 0) + 320, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".canvas-block")).toHaveCount(blockCountBefore + 1);
  await page.keyboard.press(browserName === "webkit" ? "Meta+z" : "Control+z");
  await expect(page.locator(".canvas-block")).toHaveCount(blockCountBefore);
  await page.keyboard.press(browserName === "webkit" ? "Meta+Shift+z" : "Control+y");
  await expect(page.locator(".canvas-block")).toHaveCount(blockCountBefore + 1);
  await page.locator(".canvas-block").last().click({ force: true });
  await page.keyboard.press("Delete");
  await expect(page.locator(".canvas-block")).toHaveCount(blockCountBefore);
  await page.keyboard.press(browserName === "webkit" ? "Meta+z" : "Control+z");
  await expect(page.locator(".canvas-block")).toHaveCount(blockCountBefore + 1);
  await page.keyboard.press(browserName === "webkit" ? "Meta+Shift+z" : "Control+y");
  await expect(page.locator(".canvas-block")).toHaveCount(blockCountBefore);
  await page.keyboard.press(browserName === "webkit" ? "Meta+z" : "Control+z");
  await expect(page.locator(".canvas-block")).toHaveCount(blockCountBefore + 1);

  await page.getByRole("button", { name: "Publish revision" }).click();
  await page.getByLabel("Change summary").fill("Updated logistics controls");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/Revision B was published/)).toBeVisible();

  await navigation.getByRole("link", { name: "Revisions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Current draft" })).toBeVisible();
  await expect(page.getByText("Updated logistics controls")).toBeVisible();
  const [a0Download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "A0 PDF" }).first().click(),
  ]);
  expect(a0Download.suggestedFilename()).toMatch(/sige-plan-b\.pdf$/i);
  const [wordDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "A4 Word" }).first().click(),
  ]);
  expect(wordDownload.suggestedFilename()).toMatch(/sige-plan-b\.docx$/i);
});

test("project creation applies templates and guided assessment creates a plan", async ({ page }) => {
  await useEnglishInterface(page);
  await page.getByRole("link", { name: "Projects" }).click();
  await page.getByRole("link", { name: "New project" }).click();
  await page.getByLabel("Project name").fill("Minimal project");
  await page.getByLabel("Address").fill("1 Test Street");
  await page.getByLabel("City").fill("Berlin");
  await page.getByLabel("Planned end").fill("2027-09-27");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Minimal project", { exact: true }).first()).toBeVisible();

  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Single-template project");
  await page.getByLabel("Address").fill("2 Test Street");
  await page.getByLabel("City").fill("Berlin");
  await page.getByLabel("Planned end").fill("2027-09-27");
  await page.getByRole("checkbox", { name: /Standard project information/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Single-template project", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Bauherr", { exact: true })).toBeVisible();
  await expect(page.getByText("Feuerwehr / Rettungsdienst", { exact: true })).toHaveCount(0);

  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("North Campus Extension");
  await page.getByLabel("Address").fill("10 Campus Way");
  await page.getByLabel("City").fill("Hamburg");
  await page.getByLabel("Planned end").fill("2027-12-18");
  const projectInformationTemplate = page.getByRole("checkbox", { name: /Standard project information/ });
  const emergencyServicesTemplate = page.getByRole("checkbox", { name: /German emergency services/ });
  await projectInformationTemplate.check();
  await emergencyServicesTemplate.check();
  await expect(projectInformationTemplate).toBeChecked();
  await expect(emergencyServicesTemplate).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Bauherr", { exact: true })).toBeVisible();
  await expect(page.getByText("Feuerwehr / Rettungsdienst", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add section" }).click();
  await page.getByLabel("Section name").fill("Site logistics");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Site logistics" })).toBeVisible();

  await page.getByRole("navigation", { name: "Project navigation" }).getByRole("link", { name: "Project assessment" }).click();
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Review recommendations" }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.locator(".wysiwyg-page")).toBeVisible();
  await expect.poll(() => page.locator(".canvas-block").count()).toBeGreaterThan(0);

  await page.getByRole("navigation", { name: "Project navigation" }).getByRole("link", { name: "Documents" }).click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X0YV5wAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("Add file").setInputFiles({ name: "north-campus.png", mimeType: "image/png", buffer: png });
  await expect(page.getByText(/north-campus\.png was added/)).toBeVisible();
});

test("custom Word template reports missing data and generates with explicit consent", async ({ page }) => {
  await useEnglishInterface(page);
  await page.getByRole("link", { name: "Templates" }).click();
  const customTemplate = new Document({ sections: [{ children: [new Paragraph("Project: {{INS qs.project.name}}"), new Paragraph("Missing: {{INS qs.overview.intentionally_missing}}"), new Paragraph("{{PAGEBREAK}}"), new Paragraph("Second page")] }] });
  const templateBuffer = await Packer.toBuffer(customTemplate);

  await page.getByRole("button", { name: "Add Word template" }).click();
  await page.getByLabel("Name").fill("Missing field template");
  await page.getByLabel("DOCX file").setInputFiles({ name: "missing-template.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: templateBuffer });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const stored = window.localStorage.getItem("quicksige.database.v3");
    return stored ? (JSON.parse(stored) as { documentTemplates: Array<{ name: string }> }).documentTemplates.map((template) => template.name) : [];
  })).toContain("Missing field template");
  await expect(page.getByText("Missing field template")).toBeVisible();

  await page.goto("/projects/project-logistics-center/documents");
  const a4Card = page.locator(".document-card").first();
  const customOptionValue = await a4Card.locator("option").filter({ hasText: "Missing field template" }).getAttribute("value");
  expect(customOptionValue).not.toBeNull();
  await a4Card.locator("select").selectOption(customOptionValue ?? "");
  await a4Card.getByRole("button", { name: "Create Word" }).click();
  await expect(page.getByRole("heading", { name: "Undefined placeholders" })).toBeVisible();
  await expect(page.getByText("{{qs.overview.intentionally_missing}}", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Continue with empty fields" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/a4_plan.*\.docx$/);
  await expect(page.getByText(/was created/)).toBeVisible();
});

test("catalog content is manageable and primary pages meet critical accessibility checks", async ({ page }) => {
  await useEnglishInterface(page);
  await page.getByRole("link", { name: "Block catalog" }).click();
  await page.getByRole("button", { name: "Add block" }).click();
  await page.getByLabel("Code").fill("ORG-E2E-001");
  const germanContent = page.getByRole("group", { name: "Deutsch" });
  const englishContent = page.getByRole("group", { name: "English" });
  await germanContent.getByLabel("Title").fill("Testbaustein");
  await englishContent.getByLabel("Title").fill("Test block");
  await germanContent.getByLabel("Short description for the A0 plan").fill("Kurze Beschreibung");
  await englishContent.getByLabel("Short description for the A0 plan").fill("Short description");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test block" })).toBeVisible();
  const customCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Test block" }) });
  await customCard.getByRole("button", { name: /More actions/ }).click();
  await customCard.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByRole("group", { name: "English" }).getByLabel("Title").fill("Edited test block");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edited test block" })).toBeVisible();
  const editedCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Edited test block" }) });
  await editedCard.getByRole("button", { name: /More actions/ }).click();
  await editedCard.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edited test block" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show archived" }).click();
  const archivedCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Edited test block" }) });
  await archivedCard.getByRole("button", { name: /More actions/ }).click();
  await archivedCard.getByRole("menuitem", { name: "Restore" }).click();
  await expect(page.getByRole("heading", { name: "Edited test block" })).toBeVisible();

  await expect(page.locator("body")).not.toContainText("Included starter content and regulatory references");

  for (const route of ["/", "/projects/new", "/templates", "/settings", "/projects/project-logistics-center", "/catalog", "/projects/project-logistics-center/plan"]) {
    await page.goto(route);
    const result = await new AxeBuilder({ page }).analyze();
    const serious = result.violations.filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""));
    expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
  }
});

test("primary layouts remain usable at supported desktop widths", async ({ page }) => {
  await useEnglishInterface(page);
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1180, height: 820 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/projects/project-logistics-center");
    await expect(page.getByRole("navigation", { name: "Project navigation" })).toBeVisible();
    await expect(page.locator(".project-workspace")).toHaveCSS("min-width", "0px");
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(viewport.width + 1);
  }

  await page.goto("/");
  const projectRowsText = (await page.locator(".project-row").allTextContents()).join(" ");
  expect(projectRowsText).not.toMatch(/completeness|building blocks/i);

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1728, height: 1117 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/projects/new");
    const picker = page.locator(".project-template-picker");
    await expect(picker).toBeVisible();
    for (const row of await picker.locator(".project-template-list > label").all()) {
      const rowBox = await row.boundingBox();
      const pickerBox = await picker.boundingBox();
      expect(rowBox).not.toBeNull(); expect(pickerBox).not.toBeNull();
      expect((rowBox?.x ?? 0) + (rowBox?.width ?? 0)).toBeLessThanOrEqual((pickerBox?.x ?? 0) + (pickerBox?.width ?? 0) + 1);
    }
    const footer = page.locator(".form-footer");
    expect(await footer.evaluate((element) => getComputedStyle(element).paddingRight)).not.toBe("0px");
    expect(await footer.evaluate((element) => getComputedStyle(element).paddingBottom)).not.toBe("0px");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
  }

  await page.goto("/settings");
  await page.getByRole("button", { name: /Deutsch/ }).click();
  for (const button of await page.locator(".button:visible").all()) {
    expect(await button.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  }
});

test("Templates is separate from Settings and retains complete template management", async ({ page }) => {
  await useEnglishInterface(page);
  await expect(page.getByText("Overview templates")).toHaveCount(0);
  await expect(page.getByText("Word templates")).toHaveCount(0);
  await page.getByRole("link", { name: "Templates" }).click();
  await expect(page.getByRole("heading", { name: "Templates", exact: true })).toBeVisible();
  await expect(page.getByText("Overview templates")).toBeVisible();
  await expect(page.getByText("Word templates")).toBeVisible();
  await expect(page.getByText("Placeholder reference")).toBeVisible();
  await page.getByRole("button", { name: "Add template" }).click();
  await page.getByLabel("Template name").fill("E2E project details");
  await page.getByRole("button", { name: "Add entry" }).click();
  await page.getByPlaceholder("Label").fill("Permit number");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("E2E project details")).toBeVisible();
  await page.reload();
  await expect(page.getByText("E2E project details")).toBeVisible();
});

test("A0 canvas fits, zooms deeply, edits structural content, and navigates validation", async ({ page, browserName }) => {
  await useEnglishInterface(page);
  await page.goto("/projects/project-logistics-center/plan");
  await expect(page.locator(".wysiwyg-page")).toBeVisible();
  await expect(page.locator(".editor-inspector")).toHaveCount(0);

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("button", { name: "Fit plan" }).click();
    const shellBox = await page.locator(".editor-canvas-shell").boundingBox();
    const pageBox = await page.locator(".wysiwyg-page").boundingBox();
    expect(shellBox).not.toBeNull(); expect(pageBox).not.toBeNull();
    expect(pageBox!.x).toBeGreaterThanOrEqual(shellBox!.x - 1);
    expect(pageBox!.y).toBeGreaterThanOrEqual(shellBox!.y - 1);
    expect(pageBox!.x + pageBox!.width).toBeLessThanOrEqual(shellBox!.x + shellBox!.width + 1);
    expect(pageBox!.y + pageBox!.height).toBeLessThanOrEqual(shellBox!.y + shellBox!.height + 1);
    expect(pageBox!.x + pageBox!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    const publishButtonBox = await page.getByRole("button", { name: "Publish revision" }).boundingBox();
    expect(publishButtonBox).not.toBeNull();
    expect(publishButtonBox!.x + publishButtonBox!.width).toBeLessThanOrEqual(viewport.width + 1);
  }

  const zoomBadge = page.locator(".editor-toolbar .badge").filter({ hasText: "%" });
  await page.locator(".editor-canvas-shell").hover();
  await page.keyboard.down(browserName === "webkit" ? "Meta" : "Control");
  await page.mouse.wheel(0, -1_800);
  await page.keyboard.up(browserName === "webkit" ? "Meta" : "Control");
  await expect.poll(async () => Number((await zoomBadge.textContent())?.replace("%", "") ?? 0)).toBeGreaterThan(115);
  await page.keyboard.press(browserName === "webkit" ? "Meta++" : "Control++");
  await expect.poll(async () => Number((await zoomBadge.textContent())?.replace("%", "") ?? 0)).toBeGreaterThan(125);

  await page.getByRole("button", { name: "Fit plan" }).click();
  await page.locator(".plan-header-brand").dblclick({ force: true });
  await page.getByLabel("Brand label").fill("QS Safety");
  await page.getByLabel("Brand label").press("Enter");
  await expect(page.locator(".plan-header-brand")).toHaveText("QS Safety");
  await page.keyboard.press(browserName === "webkit" ? "Meta+z" : "Control+z");
  await expect(page.locator(".plan-header-brand")).toHaveText("QUICKSiGe");
  await page.keyboard.press(browserName === "webkit" ? "Meta+Shift+z" : "Control+y");
  await expect(page.locator(".plan-header-brand")).toHaveText("QS Safety");

  const firstSectionTitle = page.locator('.canvas-section [data-inline-field="sectionTitle"]').first();
  await firstSectionTitle.dblclick({ force: true });
  await page.getByLabel("Section heading").fill("Custom coordination");
  await page.getByLabel("Section heading").press("Enter");
  await expect(firstSectionTitle).toHaveText("Custom coordination");
  await expect.poll(() => page.evaluate(() => {
    const database = JSON.parse(window.localStorage.getItem("quicksige.database.v3") ?? "{}") as { plans?: Array<{ projectId: string; sections: Array<{ titleOverrides?: Record<string, string> }> }> };
    return database.plans?.find((candidate) => candidate.projectId === "project-logistics-center")?.sections[0]?.titleOverrides?.de;
  })).toBe("Custom coordination");
  await page.reload();
  await expect(page.locator(".plan-header-brand")).toHaveText("QS Safety");
  await expect(page.locator('.canvas-section [data-inline-field="sectionTitle"]').first()).toHaveText("Custom coordination");

  await page.getByRole("button", { name: "Validation" }).click();
  const firstTargetIssue = page.locator(".validation-popover .validation-item:not([disabled])").first();
  await expect(firstTargetIssue).toBeVisible();
  await firstTargetIssue.click();
  await expect(page.locator(".canvas-element.is-validation-focus")).toHaveCount(1);
  await expect(page.locator(".canvas-element.is-validation-focus")).toHaveAttribute("data-element-id", /.+/);

  await page.getByRole("button", { name: "Publish revision" }).click();
  await page.getByLabel("Change summary").fill("Structural canvas edits");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText(/Revision B was published/)).toBeVisible();
  const revisionContent = await page.evaluate(() => {
    const database = JSON.parse(window.localStorage.getItem("quicksige.database.v3") ?? "{}") as {
      revisions?: Array<{ changeSummary: string; snapshot: { plan: { sections: Array<{ titleOverrides?: Record<string, string> }>; layout: { elements: Array<{ kind: string; brandText?: Record<string, string> }> } } } }>;
    };
    const revision = database.revisions?.find((candidate) => candidate.changeSummary === "Structural canvas edits");
    return {
      brand: revision?.snapshot.plan.layout.elements.find((element) => element.kind === "header")?.brandText?.de,
      sectionTitle: revision?.snapshot.plan.sections[0]?.titleOverrides?.de,
    };
  });
  expect(revisionContent).toEqual({ brand: "QS Safety", sectionTitle: "Custom coordination" });
});

test("contextual toolbar covers every seeded canvas element family and drag selection stays synchronized", async ({ page }) => {
  await useEnglishInterface(page);
  await page.goto("/projects/project-logistics-center/plan");
  await page.getByRole("button", { name: "Fit plan" }).click();
  await page.getByRole("button", { name: "Annotations" }).click();
  await page.getByRole("button", { name: "Add: Text box" }).click();
  await expect(page.locator(".canvas-text")).toHaveCount(1);
  for (const selector of [
    ".canvas-plan-header",
    ".canvas-section",
    ".canvas-block",
    '[data-element-id="layout-demo-image"]',
    '[data-element-id="layout-demo-pdf"]',
    ".canvas-document",
    ".canvas-text",
    ".canvas-title-block",
  ]) {
    await page.locator(selector).first().click({ force: true });
    await expect(page.getByRole("button", { name: "Selected element options" })).toBeVisible();
    await page.getByRole("button", { name: "Selected element options" }).click();
    await expect(page.getByRole("dialog", { name: "Selected element options" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Selected element options" })).toBeFocused();
  }

  const block = page.locator(".canvas-block").first();
  await block.click({ force: true });
  const before = await block.boundingBox();
  expect(before).not.toBeNull();
  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
  await page.mouse.down();
  await page.mouse.move(before!.x + before!.width / 2 + 70, before!.y + before!.height / 2 + 45, { steps: 8 });
  await page.mouse.up();
  const after = await block.boundingBox();
  const controls = await page.locator(".moveable-control-box .moveable-line").evaluateAll((lines) => {
    const rectangles = lines.map((line) => line.getBoundingClientRect()).filter((rectangle) => rectangle.width > 0 || rectangle.height > 0);
    if (!rectangles.length) return null;
    const left = Math.min(...rectangles.map((rectangle) => rectangle.left));
    const top = Math.min(...rectangles.map((rectangle) => rectangle.top));
    const right = Math.max(...rectangles.map((rectangle) => rectangle.right));
    const bottom = Math.max(...rectangles.map((rectangle) => rectangle.bottom));
    return { x: left, y: top, width: right - left, height: bottom - top };
  });
  expect(after).not.toBeNull(); expect(controls).not.toBeNull();
  expect(Math.abs((controls!.x + controls!.width / 2) - (after!.x + after!.width / 2))).toBeLessThan(8);
  expect(Math.abs((controls!.y + controls!.height / 2) - (after!.y + after!.height / 2))).toBeLessThan(8);
});
