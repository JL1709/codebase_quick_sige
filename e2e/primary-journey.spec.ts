import AxeBuilder from "@axe-core/playwright";
import { Document, Packer, Paragraph } from "docx";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function useEnglishInterface(page: Page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: /English/ }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

async function dragCategoryToEdge(page: Page, categoryBrowser: Locator, draggedCategoryId: string, targetCategoryId: string, edge: "before" | "after") {
  const dragHandle = categoryBrowser.locator(`[data-category-id="${draggedCategoryId}"] .category-drag-handle`);
  const targetRow = categoryBrowser.locator(`[data-category-id="${targetCategoryId}"]`);
  const dragHandleBox = await dragHandle.boundingBox();
  const targetRowBox = await targetRow.boundingBox();
  expect(dragHandleBox).not.toBeNull(); expect(targetRowBox).not.toBeNull();
  const dragStartX = dragHandleBox!.x + dragHandleBox!.width / 2;
  const dragStartY = dragHandleBox!.y + dragHandleBox!.height / 2;
  await page.mouse.move(dragStartX, dragStartY);
  await page.mouse.down();
  await page.mouse.move(dragStartX + 10, dragStartY, { steps: 3 });
  const targetY = targetRowBox!.y + targetRowBox!.height * (edge === "before" ? 0.25 : 0.75);
  await page.mouse.move(targetRowBox!.x + targetRowBox!.width / 2, targetY, { steps: 15 });
  await expect(targetRow).toHaveClass(new RegExp(`is-drop-${edge}`));
  await page.mouse.up();
}

async function dragTemplateEntryInside(page: Page, entryLabel: string, groupLabel: string) {
  const sourceRow = page.locator(".template-builder-row").filter({ has: page.locator(`input[value="${entryLabel}"]`) });
  const targetRow = page.locator(".template-builder-row").filter({ has: page.locator(`input[value="${groupLabel}"]`) });
  const sourceBox = await sourceRow.locator(".template-drag-handle").boundingBox();
  const targetBox = await targetRow.boundingBox();
  expect(sourceBox).not.toBeNull(); expect(targetBox).not.toBeNull();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox!.x + sourceBox!.width / 2 + 10, sourceBox!.y + sourceBox!.height / 2, { steps: 3 });
  await page.mouse.move(targetBox!.x + targetBox!.width / 2, targetBox!.y + targetBox!.height / 2, { steps: 12 });
  await expect(targetRow).toHaveClass(/drop-inside-active/);
  await page.mouse.up();
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
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Projects" }).click();
  await expect(page.getByRole("heading", { name: /Good morning/ })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/local prototype|\bmvp\b|multilingual catalog/i);

  const dashboardProject = page.getByRole("article").filter({ hasText: "Logistikzentrum West" });
  const projectStatus = dashboardProject.getByLabel("Project status: Logistikzentrum West");
  await projectStatus.selectOption("draft");
  await expect(projectStatus).toHaveValue("draft");
  await dashboardProject.getByRole("link", { name: "Open" }).click();
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

  const generalInformation = page.locator(".overview-template-section").filter({ has: page.getByRole("heading", { name: "Allgemein" }) });
  await expect(page.getByText(/^Record \d+$/)).toHaveCount(0);
  await generalInformation.getByRole("button", { name: "Edit", exact: true }).click();
  await generalInformation.getByRole("textbox", { name: "Bauherr", exact: true }).fill("Westpark Projektgesellschaft mbH");
  await generalInformation.getByRole("button", { name: "Save", exact: true }).click();
  await expect(generalInformation.getByText("Westpark Projektgesellschaft mbH", { exact: true })).toBeVisible();

  const logisticsInformation = page.locator(".overview-template-section").filter({ has: page.getByRole("heading", { name: "Baustellenlogistik" }) });
  await logisticsInformation.getByRole("button", { name: "Edit", exact: true }).click();
  const topLevelRows = logisticsInformation.locator(".project-overview-entry-tree > .project-overview-builder-node");
  await expect(topLevelRows.nth(0).locator(".overview-entry-label-input")).toHaveValue("Anlieferzeitfenster");
  await expect(topLevelRows.nth(1).locator(".overview-entry-label-input")).toHaveValue("Wartebereich");
  const sourceHandle = topLevelRows.nth(1).getByRole("button", { name: "Move entry" });
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await topLevelRows.nth(0).locator(".project-overview-builder-row").boundingBox();
  expect(sourceBox).not.toBeNull(); expect(targetBox).not.toBeNull();
  await page.mouse.move((sourceBox?.x ?? 0) + (sourceBox?.width ?? 0) / 2, (sourceBox?.y ?? 0) + (sourceBox?.height ?? 0) / 2);
  await page.mouse.down();
  await page.mouse.move((sourceBox?.x ?? 0) + (sourceBox?.width ?? 0) / 2 + 8, (sourceBox?.y ?? 0) + (sourceBox?.height ?? 0) / 2, { steps: 4 });
  await page.mouse.move((targetBox?.x ?? 0) + 100, targetBox?.y ?? 0, { steps: 10 });
  await page.mouse.up();
  await expect(topLevelRows.nth(0).locator(".overview-entry-label-input")).toHaveValue("Wartebereich");
  const topLevelAddEntry = logisticsInformation.locator(".panel-body > .project-overview-editor > .project-overview-add-entry");
  await topLevelAddEntry.getByRole("button", { name: "Add entry" }).click();
  await logisticsInformation.locator(".overview-entry-label-input").last().fill("Ladehinweis");
  await logisticsInformation.getByRole("textbox", { name: "Ladehinweis", exact: true }).fill("Nur nach Anmeldung");
  await logisticsInformation.getByRole("button", { name: "Save", exact: true }).click();
  await expect(logisticsInformation.getByText("Nur nach Anmeldung", { exact: true })).toBeVisible();
  await expect(logisticsInformation.locator(".panel-body > .overview-template-values > .overview-template-value > label").first()).toHaveText("Wartebereich");
  await logisticsInformation.getByRole("button", { name: "Edit", exact: true }).click();
  await logisticsInformation.getByRole("button", { name: "Delete: Ladehinweis", exact: true }).click();
  await logisticsInformation.getByRole("button", { name: "Save", exact: true }).click();
  await expect(logisticsInformation.getByText("Nur nach Anmeldung", { exact: true })).toHaveCount(0);

  const emergencyInformation = page.locator(".overview-template-section").filter({ has: page.getByRole("heading", { name: "Notfallkontakte" }) });
  await emergencyInformation.getByRole("button", { name: "Edit", exact: true }).click();
  const records = emergencyInformation.locator(".project-overview-record");
  await expect(records).toHaveCount(3);
  await expect(records.nth(0).getByRole("textbox", { name: "Bezeichnung" })).toHaveValue("Feuerwehr / Rettungsdienst");
  await expect(records.nth(1).getByRole("textbox", { name: "Bezeichnung" })).toHaveValue("Polizei");
  await expect(records.getByRole("button", { name: "Move entry" })).toHaveCount(3);
  await emergencyInformation.getByRole("button", { name: "Save", exact: true }).click();

  await navigation.getByRole("link", { name: "Safety plan", exact: true }).click();
  await expect.poll(() => page.locator(".canvas-block").count()).toBeGreaterThan(0);
  await expect(page.locator(".canvas-asset")).toHaveCount(2);
  await expect(page.locator(".canvas-document")).toHaveCount(1);
  await expect(page.getByText("All changes saved", { exact: true })).toHaveCount(0);
  await page.locator('[data-element-id="layout-demo-pdf"]').click({ force: true });
  await expect(page.getByRole("button", { name: "Selected element options" })).toHaveCount(0);
  await page.getByRole("button", { name: /block library/i }).click();
  await expect(page.locator(".editor-sidebar")).toHaveCount(0);
  await page.getByRole("button", { name: /block library/i }).click();
  await expect(page.locator(".editor-sidebar")).toBeVisible();
  const blockCountBefore = await page.locator(".canvas-block").count();
  const libraryItem = page.locator(".editor-catalog-card:not(.is-added)").first();
  const libraryDragHandle = libraryItem.locator(".library-drag-handle");
  await libraryDragHandle.scrollIntoViewIfNeeded();
  const libraryBox = await libraryDragHandle.boundingBox();
  const canvasBox = await page.locator(".wysiwyg-page").boundingBox();
  expect(libraryBox).not.toBeNull(); expect(canvasBox).not.toBeNull();
  await page.mouse.move((libraryBox?.x ?? 0) + (libraryBox?.width ?? 0) / 2, (libraryBox?.y ?? 0) + (libraryBox?.height ?? 0) / 2);
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
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Projects" }).click();
  await expect(page.getByRole("article").filter({ hasText: "Logistikzentrum West" }).getByLabel("Project status: Logistikzentrum West")).toHaveValue("draft");
});

test("project creation applies templates and guided assessment creates a plan", async ({ page }) => {
  await useEnglishInterface(page);
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Projects" }).click();
  await page.getByRole("link", { name: "New project" }).click();
  await expect(page.getByLabel("Project number")).toHaveCount(0);
  await expect(page.getByLabel("Address")).toHaveCount(0);
  await expect(page.getByLabel("Construction project type")).toHaveCount(0);
  await page.getByLabel("Project name").fill("Minimal project");
  const additionalInformation = page.locator(".project-additional-fields");
  await additionalInformation.getByRole("button", { name: "Add entry" }).click();
  await additionalInformation.getByPlaceholder("Label").fill("Internal reference");
  await additionalInformation.getByLabel("Value (optional)").fill("MP-01");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Minimal project", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Internal reference", { exact: true })).toBeVisible();
  await expect(page.getByText("MP-01", { exact: true })).toBeVisible();

  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Single-template project");
  const generalTemplate = page.locator(".project-template-card").filter({ hasText: "General" });
  await generalTemplate.getByRole("button", { name: "Preview" }).click();
  await expect(generalTemplate.getByText("Client", { exact: true })).toBeVisible();
  await generalTemplate.getByRole("button", { name: "Include" }).click();
  const includedGeneral = page.locator(".project-included-section").filter({ has: page.getByRole("heading", { name: "General" }) });
  await includedGeneral.getByLabel("Client").fill("Template Client GmbH");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("Single-template project", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Client", { exact: true })).toBeVisible();
  await expect(page.getByText("Template Client GmbH", { exact: true })).toBeVisible();
  await expect(page.getByText("Fire brigade / emergency services", { exact: true })).toHaveCount(0);

  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("North Campus Extension");
  const projectInformationTemplate = page.locator(".project-template-card").filter({ hasText: "General" });
  const emergencyServicesTemplate = page.locator(".project-template-card").filter({ hasText: "Emergency contacts" });
  await projectInformationTemplate.getByRole("button", { name: "Include" }).click();
  await emergencyServicesTemplate.getByRole("button", { name: "Include" }).click();
  await expect(projectInformationTemplate.getByRole("button", { name: "Included" })).toBeDisabled();
  await expect(emergencyServicesTemplate.getByRole("button", { name: "Included" })).toBeDisabled();
  await page.locator(".project-included-section").filter({ has: page.getByRole("heading", { name: "General" }) }).getByLabel("Client").fill("North Campus GmbH");
  await page.getByRole("button", { name: "Create project" }).click();

  await expect(page.getByText("Client", { exact: true })).toBeVisible();
  await expect(page.getByText("Fire brigade / emergency services", { exact: true })).toBeVisible();

  await page.getByRole("navigation", { name: "Project navigation" }).getByRole("link", { name: "Project assessment" }).click();
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Review recommendations" }).click();
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.locator(".wysiwyg-page")).toBeVisible();
  await expect.poll(() => page.locator(".canvas-block").count()).toBeGreaterThan(0);

  await page.getByRole("navigation", { name: "Project navigation" }).getByRole("link", { name: "Documents" }).click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X0YV5wAAAABJRU5ErkJggg==", "base64");
  await page.getByRole("button", { name: "Upload file" }).first().click();
  const uploadDialog = page.getByRole("dialog", { name: "Upload project file" });
  await uploadDialog.getByLabel("File").setInputFiles({ name: "north-campus.png", mimeType: "image/png", buffer: png });
  await uploadDialog.getByRole("button", { name: "Upload file" }).click();
  await expect(page.getByText(/north-campus\.png was added/)).toBeVisible();
  const deletionState = await page.evaluate(() => {
    const stored = JSON.parse(window.localStorage.getItem("quicksige.database.v3") ?? "{}") as { projects: Array<{ id: string; name: string; assets: Array<{ blobId?: string }> }> };
    const project = stored.projects.find((candidate) => candidate.name === "North Campus Extension");
    return { projectId: project?.id ?? "", blobId: project?.assets[0]?.blobId ?? "" };
  });
  expect(deletionState.projectId).not.toBe("");
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Projects" }).click();
  const projectRow = page.getByRole("article").filter({ hasText: "North Campus Extension" });
  await projectRow.getByRole("button", { name: /Delete: North Campus Extension/ }).click();
  await expect(page.getByRole("heading", { name: "Delete project" })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("North Campus Extension", { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate((projectId) => {
    const stored = JSON.parse(window.localStorage.getItem("quicksige.database.v3") ?? "{}") as { projects: Array<{ id: string }>; plans: Array<{ projectId: string }> };
    return stored.projects.some((project) => project.id === projectId) || stored.plans.some((plan) => plan.projectId === projectId);
  }, deletionState.projectId)).toBe(false);
  await expect.poll(() => page.evaluate(async (blobId) => {
    if (!blobId) return false;
    return new Promise<boolean>((resolve) => {
      const request = indexedDB.open("quicksige-files");
      request.onsuccess = () => {
        const valueRequest = request.result.transaction("blobs", "readonly").objectStore("blobs").get(blobId);
        valueRequest.onsuccess = () => resolve(Boolean(valueRequest.result));
        valueRequest.onerror = () => resolve(true);
      };
      request.onerror = () => resolve(true);
    });
  }, deletionState.blobId)).toBe(false);
});

test("custom Word template reports missing data and generates with explicit consent", async ({ page }) => {
  await useEnglishInterface(page);
  await page.getByRole("link", { name: "Templates" }).click();
  const wordTemplates = page.locator("section.settings-section").filter({ has: page.getByRole("heading", { name: "Word templates" }) });
  await expect(wordTemplates.getByRole("article")).toHaveCount(1);
  await expect(wordTemplates.getByText("A4 safety plan", { exact: true })).toBeVisible();
  await expect(wordTemplates.getByText("Site principles", { exact: true })).toHaveCount(0);
  await expect(wordTemplates.getByText(/QuickSiGe Standard · English · Standard/).first()).toBeVisible();
  await expect(wordTemplates.getByRole("button", { name: "Duplicate" })).toHaveCount(0);
  await expect(wordTemplates.getByRole("button", { name: "Show archived" })).toHaveCount(0);
  const customTemplate = new Document({ sections: [{ children: [new Paragraph("Project: {{qs.project.name}}"), new Paragraph("Missing: {{qs.overview.intentionally_missing}}"), new Paragraph("{{PAGEBREAK}}"), new Paragraph("Second page")] }] });
  const templateBuffer = await Packer.toBuffer(customTemplate);

  await page.getByRole("button", { name: "Add Word template" }).click();
  await expect(page.getByLabel("Document type")).toHaveCount(0);
  await page.getByLabel("Name").fill("Missing field template");
  await page.getByLabel("DOCX file").setInputFiles({ name: "missing-template.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: templateBuffer });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const stored = window.localStorage.getItem("quicksige.database.v3");
    return stored ? (JSON.parse(stored) as { documentTemplates: Array<{ name: string }> }).documentTemplates.map((template) => template.name) : [];
  })).toContain("Missing field template");
  await expect(page.getByText("Missing field template")).toBeVisible();

  await page.evaluate(() => {
    const storageKey = "quicksige.database.v3";
    const stored = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as {
      documentTemplates: Array<{ id: string; name: string }>;
      documentConfigurations: Array<{ id: string; projectId: string; documentType: string; templateId: string }>;
    };
    const templateId = stored.documentTemplates.find((template) => template.name === "Missing field template")?.id;
    if (!templateId) throw new Error("Missing field template was not saved");
    stored.documentConfigurations.push({
      id: "e2e-custom-a4-configuration",
      projectId: "project-riverside-renovation",
      documentType: "a4_plan",
      templateId,
    });
    window.localStorage.setItem(storageKey, JSON.stringify(stored));
  });
  await page.goto("/projects/project-riverside-renovation/plan");
  await page.getByRole("button", { name: "Word documents" }).click();
  await expect(page.getByRole("heading", { name: "Undefined placeholders" })).toBeVisible();
  await expect(page.getByText("{{qs.overview.intentionally_missing}}", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Continue with empty fields" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/a4-plan.*\.docx$/);
  await expect(page.getByText(/was created/)).toBeVisible();
});

test("Word documents action creates and downloads the A4 plan without leaving the safety plan", async ({ page }) => {
  await useEnglishInterface(page);
  await page.goto("/projects/project-logistics-center/plan");
  await expect.poll(() => page.locator(".canvas-block").count()).toBeGreaterThan(0);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Word documents" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^qs-2026-014-a4-plan-\d{4}-\d{2}-\d{2}\.docx$/);
  await expect(page).toHaveURL(/\/projects\/project-logistics-center\/plan$/);
  await expect(page.locator(".editor-word-message")).toContainText("was created");
  await expect.poll(() => page.evaluate(() => {
    const stored = window.localStorage.getItem("quicksige.database.v3");
    if (!stored) return [];
    return (JSON.parse(stored) as { generatedDocuments: Array<{ projectId: string; documentType: string }> })
      .generatedDocuments
      .filter((document) => document.projectId === "project-logistics-center")
      .map((document) => document.documentType);
  })).toContain("a4_plan");
});

test("project documents is a simple folder-based file library", async ({ page }) => {
  await useEnglishInterface(page);
  await page.goto("/projects/project-logistics-center/documents");

  await expect(page.getByRole("heading", { name: "Project documents" })).toBeVisible();
  await expect(page.getByText("Site principles", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Emergency plan", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Generated documents", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Add folder" }).click();
  const addFolderDialog = page.getByRole("dialog", { name: "Add folder" });
  await addFolderDialog.getByLabel("Folder name").fill("Permits");
  await addFolderDialog.getByRole("button", { name: "Save" }).click();
  const allFilesCount = page.getByRole("button", { name: /^All files/ }).locator("small");
  const permitsFolderButton = page.getByRole("button", { name: /^Permits/ });
  const permitsCount = permitsFolderButton.locator("small");
  const allFilesCountBox = await allFilesCount.boundingBox();
  const permitsCountBox = await permitsCount.boundingBox();
  expect(allFilesCountBox).not.toBeNull();
  expect(permitsCountBox).not.toBeNull();
  expect(Math.abs((allFilesCountBox!.x + allFilesCountBox!.width) - (permitsCountBox!.x + permitsCountBox!.width))).toBeLessThanOrEqual(1);
  await permitsFolderButton.hover();
  await expect(permitsCount).toHaveCSS("opacity", "0");
  await expect(page.getByRole("button", { name: "Edit: Permits" })).toBeVisible();
  await permitsFolderButton.click();

  const documentBuffer = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Permit register")] }] }));
  await page.locator(".overview-heading").getByRole("button", { name: "Upload file" }).click();
  const uploadDialog = page.getByRole("dialog", { name: "Upload project file" });
  await uploadDialog.getByLabel("File").setInputFiles({
    name: "permit-register.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: documentBuffer,
  });
  await uploadDialog.getByLabel("Folder").selectOption({ label: "Permits" });
  await uploadDialog.getByRole("button", { name: "Upload file" }).click();

  const uploadedFile = page.getByRole("article").filter({ hasText: "permit-register.docx" });
  await expect(uploadedFile).toContainText("Permits");
  const downloadPromise = page.waitForEvent("download");
  await uploadedFile.getByRole("button", { name: "Download" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe("permit-register.docx");

  await uploadedFile.getByRole("button", { name: "Edit: permit-register.docx" }).click();
  const editFileDialog = page.getByRole("dialog", { name: "Edit file" });
  await editFileDialog.getByLabel("File name").fill("updated-permit-register.docx");
  await editFileDialog.getByLabel("Folder").selectOption({ label: "Unsorted" });
  await editFileDialog.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: /^Unsorted/ }).click();

  const renamedFile = page.getByRole("article").filter({ hasText: "updated-permit-register.docx" });
  await expect(renamedFile).toBeVisible();
  await renamedFile.getByRole("button", { name: "Delete: updated-permit-register.docx" }).click();
  const deleteFileDialog = page.getByRole("dialog", { name: "Delete file" });
  await deleteFileDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(renamedFile).toHaveCount(0);

  const permitsFolderRow = page.locator(".document-folder-row").filter({ hasText: "Permits" });
  await permitsFolderRow.hover();
  await permitsFolderRow.getByRole("button", { name: "Delete: Permits" }).click();
  const deleteFolderDialog = page.getByRole("dialog", { name: "Delete folder" });
  await deleteFolderDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Permits/ })).toHaveCount(0);
});

test("catalog content is manageable and primary pages meet critical accessibility checks", async ({ page }) => {
  await useEnglishInterface(page);
  await page.getByRole("link", { name: "Block catalog" }).click();
  await expect(page.locator(".catalog-card")).toHaveCount(23);
  await expect(page.getByRole("button", { name: "Export review list" })).toHaveCount(0);
  await expect(page.locator(".catalog-block-preview-image img")).toHaveCount(23);
  await expect(page.locator("body")).not.toContainText(/\d+ assignments/);
  const portableDistributionCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Portable electrical distribution board" }) });
  await expect(portableDistributionCard.locator(".catalog-category-trail li")).toHaveCount(5);
  await expect(portableDistributionCard.locator(".catalog-block-preview-references")).toContainText("DGUV Information 203-070");
  const catalogImageBox = await portableDistributionCard.locator(".catalog-block-preview-image").boundingBox();
  const catalogDescriptionBox = await portableDistributionCard.locator(".catalog-block-preview-content > p").boundingBox();
  expect(catalogImageBox).not.toBeNull(); expect(catalogDescriptionBox).not.toBeNull();
  expect(Math.abs(catalogImageBox!.width - catalogDescriptionBox!.width)).toBeLessThanOrEqual(1);
  const firstAidCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Organize first aid" }) });
  const siteSecurityCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Site security" }) });
  const temporaryPowerCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Temporary construction power" }) });
  await expect(firstAidCard.locator("h3")).toHaveCSS("background-color", await siteSecurityCard.locator("h3").evaluate((element) => getComputedStyle(element).backgroundColor));
  await expect(temporaryPowerCard.locator("h3")).not.toHaveCSS("background-color", await firstAidCard.locator("h3").evaluate((element) => getComputedStyle(element).backgroundColor));
  await expect(portableDistributionCard.locator("h3")).not.toHaveCSS("background-color", await firstAidCard.locator("h3").evaluate((element) => getComputedStyle(element).backgroundColor));
  const categoryBrowser = page.locator(".category-browser");
  await categoryBrowser.getByRole("button", { name: "Edit: Site setup", exact: true }).click();
  const categoryDialog = page.getByRole("dialog");
  await expect(categoryDialog.getByLabel("Category name")).toHaveValue("Site setup");
  await expect(categoryDialog.locator('input[type="number"]')).toHaveCount(0);
  await expect(categoryDialog.getByLabel("Description", { exact: true })).toHaveCount(0);
  await expect(categoryDialog.getByText("Deutsch", { exact: true })).toHaveCount(0);
  await expect(categoryDialog.getByText("English", { exact: true })).toHaveCount(0);
  await expect(categoryDialog.getByLabel("Color", { exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const stored = window.localStorage.getItem("quicksige.database.v3");
    if (!stored) return "";
    const category = (JSON.parse(stored) as { categories: Array<{ id: string; translations: { de: { name: string } } }> }).categories.find((candidate) => candidate.id === "site-setup");
    return category?.translations.de.name ?? "";
  })).toBe("Baustelleneinrichtung");
  await categoryBrowser.getByRole("button", { name: "Edit: Access and emergency organization", exact: true }).click();
  await expect(categoryDialog.getByLabel("Color", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => page.evaluate(() => {
    const stored = window.localStorage.getItem("quicksige.database.v3");
    if (!stored) return true;
    const category = (JSON.parse(stored) as { categories: Array<{ id: string; color?: string }> }).categories.find((candidate) => candidate.id === "site-access-emergency");
    return category ? Object.hasOwn(category, "color") : true;
  })).toBe(false);
  const siteSetupDragHandle = categoryBrowser.getByRole("button", { name: "Reorder category: Site setup" });
  await expect(siteSetupDragHandle).toBeVisible();
  await dragCategoryToEdge(page, categoryBrowser, "site-setup", "preparation", "before");
  await expect(categoryBrowser.locator('[data-parent-id="root"]').first()).toHaveAttribute("data-category-id", "site-setup");
  await dragCategoryToEdge(page, categoryBrowser, "site-access-emergency", "site-utilities", "after");
  await expect.poll(() => categoryBrowser.locator('[data-parent-id="site-setup"]').evaluateAll((rows) => rows.map((row) => row.getAttribute("data-category-id")))).toEqual([
    "site-utilities", "site-access-emergency", "imported-site-security",
  ]);
  await dragCategoryToEdge(page, categoryBrowser, "imported-site-security", "site-utilities", "after");
  await expect.poll(() => categoryBrowser.locator('[data-parent-id="site-setup"]').evaluateAll((rows) => rows.map((row) => row.getAttribute("data-category-id")))).toEqual([
    "site-utilities", "imported-site-security", "site-access-emergency",
  ]);
  // Start the independent editor checks with a fresh pointer sensor and verify the reorder persisted.
  await page.reload();
  await expect.poll(() => categoryBrowser.locator('[data-parent-id="site-setup"]').evaluateAll((rows) => rows.map((row) => row.getAttribute("data-category-id")))).toEqual([
    "site-utilities", "imported-site-security", "site-access-emergency",
  ]);
  await expect(page.locator(".catalog-card h3").first()).toHaveText("Temporary construction power");
  await expect(portableDistributionCard.getByRole("button", { name: /Edit:/ })).toBeVisible();
  await expect(portableDistributionCard.getByRole("button", { name: /More actions/ })).toHaveCount(0);
  await portableDistributionCard.getByRole("button", { name: /Edit:/ }).click();
  const blockDialog = page.getByRole("dialog");
  await expect(blockDialog.getByRole("heading", { name: "Edit block" })).toBeVisible();
  await expect(blockDialog.getByText("Provenance and professional review", { exact: true })).toHaveCount(0);
  await expect(blockDialog.getByLabel("Provenance", { exact: true })).toHaveCount(0);
  await expect(blockDialog.getByLabel("Source reference", { exact: true })).toHaveCount(0);
  await expect(blockDialog.getByLabel("Professionally reviewed on", { exact: true })).toHaveCount(0);
  expect(await blockDialog.getByLabel("Regulatory references").evaluate((input) => input.closest(".field")?.nextElementSibling?.querySelector("span")?.textContent)).toBe("Search terms");
  await expect(page.locator(".block-image-dropzone img")).toBeVisible();
  await expect(page.locator(".block-image-dropzone img")).toHaveCSS("object-fit", "contain");
  const imageDropzoneBox = await page.locator(".block-image-dropzone").boundingBox();
  const editorImageBox = await page.locator(".block-image-dropzone img").boundingBox();
  expect(Math.abs((imageDropzoneBox?.width ?? 0) - (editorImageBox?.width ?? 1))).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "Replace image" })).toBeVisible();
  await expect(page.getByLabel("Choose image file")).toBeHidden();
  expect(await page.getByLabel("Title", { exact: true }).evaluate((input) => input.closest(".field")?.nextElementSibling?.classList.contains("block-image-editor"))).toBe(true);
  await expect(page.locator('.category-placement-tree [data-category-id="preparation"]')).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator('.category-placement-tree [data-category-id="site-setup"]')).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator('.category-placement-tree input[type="checkbox"]:checked')).toHaveCount(5);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Add block" }).click();
  await expect(page.getByRole("dialog").getByLabel("Short code")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "Deutsch" })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "English" })).toHaveCount(0);
  await expect(page.getByLabel("Color", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Primary category", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Search terms", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("Localized search terms", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tree", { name: "Catalog placement" })).toBeVisible();
  await page.getByLabel("Title", { exact: true }).fill("Test block");
  await page.getByLabel("Short description for the A0 plan").fill("Short description");
  await page.getByLabel("Search terms", { exact: true }).fill("exclusive catalog phrase");
  await page.getByRole("tree", { name: "Catalog placement" }).getByRole("button", { name: "Site setup", exact: true }).click();
  await page.getByRole("checkbox", { name: "Access and emergency organization" }).check();
  await expect(page.getByRole("checkbox", { name: "Site setup" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Access and emergency organization" })).toBeChecked();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Test block" })).toBeVisible();
  const catalogSearch = page.getByLabel("Title, description, search term, or regulation");
  await catalogSearch.fill("exclusive catalog phrase");
  await expect(page.getByRole("heading", { name: "Test block" })).toBeVisible();
  await catalogSearch.clear();
  const customCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Test block" }) });
  await expect(customCard.locator(".catalog-category-trail li")).toHaveCount(2);
  const noReferences = customCard.locator(".catalog-block-preview-references");
  await expect(noReferences).toHaveText("No references");
  expect((await noReferences.boundingBox())!.height).toBeLessThan(40);
  const editAction = customCard.getByRole("button", { name: /Edit:/ });
  await editAction.hover();
  await expect(editAction).toHaveCSS("background-color", "rgb(233, 239, 236)");
  await editAction.click();
  await page.getByLabel("Title", { exact: true }).fill("Edited test block");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edited test block" })).toBeVisible();
  const editedCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Edited test block" }) });
  await editedCard.getByRole("button", { name: /Edit:/ }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edited test block" })).toHaveCount(0);
  await page.getByRole("button", { name: "Show archived" }).click();
  const archivedCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Edited test block" }) });
  await archivedCard.getByRole("button", { name: /Edit:/ }).click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
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
    const picker = page.locator(".project-template-browser");
    await expect(picker).toBeVisible();
    for (const row of await picker.locator(".project-template-card").all()) {
      const rowBox = await row.boundingBox();
      const pickerBox = await picker.boundingBox();
      expect(rowBox).not.toBeNull(); expect(pickerBox).not.toBeNull();
      expect((rowBox?.x ?? 0) + (rowBox?.width ?? 0)).toBeLessThanOrEqual((pickerBox?.x ?? 0) + (pickerBox?.width ?? 0) + 1);
    }
    const footer = page.locator(".project-composer-footer");
    await expect(footer).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(footer).toHaveCSS("box-shadow", "none");
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
  await expect(page.getByText("Enter a template name.")).toBeVisible();
  await page.getByRole("button", { name: "Explain field types" }).click();
  const fieldTypeHelp = page.getByRole("dialog").filter({ hasText: "Understanding field types" });
  await expect(fieldTypeHelp.getByText("Address", { exact: true })).toBeVisible();
  await expect(fieldTypeHelp.getByText("Project participants", { exact: true })).toBeVisible();
  await expect(fieldTypeHelp.getByText("+ Add another participant", { exact: true })).toBeVisible();
  await fieldTypeHelp.locator(".modal-footer").getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Template name").fill("E2E project details");
  await page.getByRole("button", { name: "Add entry" }).click();
  await expect(page.getByText("Enter a label.")).toBeVisible();
  await page.getByPlaceholder("Label").first().fill("Permit number");
  await page.getByRole("button", { name: "Add entry" }).click();
  await page.getByPlaceholder("Label").last().fill("Permit number");
  await expect(page.getByText("This label is already used in this template.")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByPlaceholder("Label").last().fill("Site owner");
  await expect(page.getByText("This label is already used in this template.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(page.getByText("Template type")).toHaveCount(0);
  await expect(page.locator(".form-error")).toHaveCount(0);
  const firstEntryMenu = page.locator(".template-entry-menu").first();
  await firstEntryMenu.locator("summary").click();
  await expect(firstEntryMenu.getByText("{{qs.overview.e2e_project_details.permit_number}}", { exact: true })).toBeVisible();
  await page.getByLabel("Template name").click();
  await expect(firstEntryMenu.locator(".template-entry-menu-popover")).not.toBeVisible();
  await firstEntryMenu.locator("summary").click();
  await expect(firstEntryMenu.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("E2E project details")).toBeVisible();
  await page.reload();
  await expect(page.getByText("E2E project details")).toBeVisible();
  const templateRow = page.locator(".template-row").filter({ hasText: "E2E project details" });
  await expect(templateRow.getByRole("button", { name: /^delete:/i })).toHaveCount(1);
  await expect(templateRow.getByRole("button", { name: /Duplicate/ })).toHaveCount(0);
  await templateRow.getByRole("button", { name: /^delete:/i }).click();
  await expect(page.getByRole("heading", { name: "Delete template" })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("E2E project details")).toHaveCount(0);
});

test("overview template builder supports hierarchy, drag placement, dates, and project values", async ({ page }) => {
  await useEnglishInterface(page);
  await page.getByRole("link", { name: "Templates" }).click();
  await page.getByRole("button", { name: "Add template" }).click();
  await page.getByLabel("Template name").fill("Site handover");
  await page.getByRole("button", { name: "Add entry" }).click();
  await page.getByPlaceholder("Label").fill("Permit number");
  await page.locator(".template-add-entry select").selectOption("group");
  await page.getByRole("button", { name: "Add entry" }).click();
  await page.getByPlaceholder("Label").last().fill("Handover details");
  await page.locator(".template-builder-row").filter({ has: page.locator('input[value="Handover details"]') }).getByRole("button", { name: "Add nested field" }).click();
  await page.getByPlaceholder("Label").last().fill("Inspector");
  await page.locator(".template-add-entry select").selectOption("date");
  await page.getByRole("button", { name: "Add entry" }).click();
  await page.getByPlaceholder("Label").last().fill("Handover date");
  await page.getByLabel("Default value (optional)").last().fill("2026-09-27");

  page.once("dialog", (dialog) => dialog.accept());
  await dragTemplateEntryInside(page, "Permit number", "Handover details");
  const nestedPermitRow = page.locator(".template-builder-children .template-builder-row").filter({ has: page.locator('input[value="Permit number"]') });
  await expect(nestedPermitRow).toBeVisible();
  await nestedPermitRow.locator(".template-entry-menu summary").click();
  await expect(page.getByText("{{qs.overview.site_handover.handover_details.permit_number}}", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Template-driven project");
  const handoverTemplate = page.locator(".project-template-card").filter({ hasText: "Site handover" });
  await handoverTemplate.getByRole("button", { name: "Preview" }).click();
  await expect(handoverTemplate.getByText("Handover details", { exact: true })).toBeVisible();
  await handoverTemplate.getByRole("button", { name: "Include" }).click();
  const includedHandover = page.locator(".project-included-section").filter({ has: page.getByRole("heading", { name: "Site handover" }) });
  await includedHandover.getByLabel("Permit number").fill("B-2042");
  await page.getByRole("button", { name: "Create project" }).click();
  const overviewSection = page.locator(".overview-template-section").filter({ hasText: "Site handover" });
  await expect(overviewSection.getByText("Inspector", { exact: true })).toBeVisible();
  await expect(overviewSection.getByText("27/09/2026", { exact: true })).toBeVisible();
  await expect(overviewSection.getByText("B-2042", { exact: true })).toBeVisible();
});

test("A0 canvas fits, zooms deeply, edits structural content, and navigates validation", async ({ page, browserName }) => {
  await useEnglishInterface(page);
  await page.goto("/projects/project-logistics-center/plan");
  await expect(page.locator(".wysiwyg-page")).toBeVisible();
  await expect(page.locator(".editor-inspector")).toHaveCount(0);
  const firstCanvasBlock = page.locator(".canvas-block").filter({ has: page.locator(".canvas-block-image") }).first();
  const canvasImageBox = await firstCanvasBlock.locator(".canvas-block-image").boundingBox();
  const canvasDescriptionBox = await firstCanvasBlock.locator('[data-inline-field="blockDescription"]').boundingBox();
  expect(canvasImageBox).not.toBeNull(); expect(canvasDescriptionBox).not.toBeNull();
  expect(Math.abs(canvasImageBox!.width - canvasDescriptionBox!.width)).toBeLessThanOrEqual(1);

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
  const fittedZoom = Number((await zoomBadge.textContent())?.replace("%", "") ?? 0);
  await page.locator(".editor-canvas-shell").hover();
  await page.keyboard.down(browserName === "webkit" ? "Meta" : "Control");
  await page.mouse.wheel(0, -1_800);
  await page.keyboard.up(browserName === "webkit" ? "Meta" : "Control");
  await expect.poll(async () => Number((await zoomBadge.textContent())?.replace("%", "") ?? 0)).toBeGreaterThan(fittedZoom * 2);
  const wheelZoom = Number((await zoomBadge.textContent())?.replace("%", "") ?? 0);
  await page.keyboard.press(browserName === "webkit" ? "Meta++" : "Control++");
  await expect.poll(async () => Number((await zoomBadge.textContent())?.replace("%", "") ?? 0)).toBeGreaterThan(wheelZoom);

  await page.getByRole("button", { name: "Fit plan" }).click();
  const firstSectionTitle = page.locator('.canvas-section [data-inline-field="sectionTitle"]').first();
  const originalSectionTitle = await firstSectionTitle.textContent();
  await firstSectionTitle.dblclick({ force: true });
  await page.getByLabel("Section heading").fill("Custom coordination");
  await page.getByLabel("Section heading").press("Enter");
  await expect(firstSectionTitle).toHaveText("Custom coordination");
  await page.keyboard.press(browserName === "webkit" ? "Meta+z" : "Control+z");
  await expect(firstSectionTitle).toHaveText(originalSectionTitle ?? "");
  await page.keyboard.press(browserName === "webkit" ? "Meta+Shift+z" : "Control+y");
  await expect(firstSectionTitle).toHaveText("Custom coordination");
  const editedSectionElementId = await firstSectionTitle.locator("xpath=ancestor::*[@data-element-id][1]").getAttribute("data-element-id");
  await expect.poll(() => page.evaluate((elementId) => {
    const database = JSON.parse(window.localStorage.getItem("quicksige.database.v3") ?? "{}") as {
      plans?: Array<{
        projectId: string;
        sections: Array<{ id: string; titleOverrides?: Record<string, string> }>;
        layout: { elements: Array<{ id: string; kind: string; sectionId?: string }> };
      }>;
    };
    const storedPlan = database.plans?.find((candidate) => candidate.projectId === "project-logistics-center");
    const sectionId = storedPlan?.layout.elements.find((element) => element.id === elementId && element.kind === "section")?.sectionId;
    return storedPlan?.sections.find((section) => section.id === sectionId)?.titleOverrides?.en;
  }, editedSectionElementId)).toBe("Custom coordination");
  await page.reload();
  await expect(page.locator(".canvas-plan-header")).toHaveCount(0);
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
  const revisionContent = await page.evaluate((elementId) => {
    const database = JSON.parse(window.localStorage.getItem("quicksige.database.v3") ?? "{}") as {
      revisions?: Array<{
        changeSummary: string;
        snapshot: {
          plan: {
            sections: Array<{ id: string; titleOverrides?: Record<string, string> }>;
            layout: { elements: Array<{ id: string; kind: string; sectionId?: string }> };
          };
        };
      }>;
    };
    const revision = database.revisions?.find((candidate) => candidate.changeSummary === "Structural canvas edits");
    const revisionPlan = revision?.snapshot.plan;
    const sectionId = revisionPlan?.layout.elements.find((element) => element.id === elementId && element.kind === "section")?.sectionId;
    return revisionPlan?.sections.find((section) => section.id === sectionId)?.titleOverrides?.en;
  }, editedSectionElementId);
  expect(revisionContent).toBe("Custom coordination");
});

test("block fitting preserves free elements and canvas selection follows desktop conventions", async ({ page }) => {
  await useEnglishInterface(page);
  await page.goto("/projects/project-logistics-center/plan");
  await expect(page.locator(".canvas-plan-header")).toHaveCount(0);
  await expect(page.locator(".canvas-block-area")).toBeVisible();

  const originalAssetGeometry = await page.evaluate(() => {
    const database = JSON.parse(window.localStorage.getItem("quicksige.database.v3") ?? "{}") as { plans?: Array<{ projectId: string; layout: { elements: Array<{ id: string; kind: string; x: number; y: number; width: number; height: number }> } }> };
    const plan = database.plans?.find((candidate) => candidate.projectId === "project-logistics-center");
    return plan?.layout.elements.filter((element) => ["image", "pdf_page", "document"].includes(element.kind)).map(({ id, x, y, width, height }) => ({ id, x, y, width, height }));
  });

  for (const option of ["Vertical", "Horizontal", "Best space usage"]) {
    await page.getByLabel("Block arrangement").selectOption({ label: option });
    await page.getByRole("button", { name: "Fit blocks" }).click();
    await expect.poll(() => page.evaluate(() => {
      const database = JSON.parse(window.localStorage.getItem("quicksige.database.v3") ?? "{}") as { plans?: Array<{ projectId: string; layout: { elements: Array<{ kind: string; x: number; y: number; width: number; height: number; layoutMode?: string }> } }> };
      const elements = database.plans?.find((candidate) => candidate.projectId === "project-logistics-center")?.layout.elements ?? [];
      const area = elements.find((element) => element.kind === "block_area");
      const blocks = elements.filter((element) => element.kind === "block");
      return Boolean(area && blocks.length && new Set(blocks.map((block) => `${block.width}x${block.height}`)).size === 1 && blocks.every((block) => block.x >= area.x && block.y >= area.y && block.x + block.width <= area.x + area.width && block.y + block.height <= area.y + area.height));
    })).toBe(true);
  }

  const assetGeometryAfterFit = await page.evaluate(() => {
    const database = JSON.parse(window.localStorage.getItem("quicksige.database.v3") ?? "{}") as { plans?: Array<{ projectId: string; layout: { elements: Array<{ id: string; kind: string; x: number; y: number; width: number; height: number }> } }> };
    const plan = database.plans?.find((candidate) => candidate.projectId === "project-logistics-center");
    return plan?.layout.elements.filter((element) => ["image", "pdf_page", "document"].includes(element.kind)).map(({ id, x, y, width, height }) => ({ id, x, y, width, height }));
  });
  expect(assetGeometryAfterFit).toEqual(originalAssetGeometry);

  const firstBlock = page.locator(".canvas-block").first();
  await firstBlock.click({ force: true });
  await expect(firstBlock).toHaveClass(/is-selected/);
  await page.keyboard.press("Escape");
  await expect(firstBlock).not.toHaveClass(/is-selected/);

  await page.evaluate(() => {
    const storageKey = "quicksige.database.v3";
    const database = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}") as { plans?: Array<{ projectId: string; layout: { elements: unknown[] } }> };
    const plan = database.plans?.find((candidate) => candidate.projectId === "project-logistics-center");
    plan?.layout.elements.push({ id: "legacy-header", kind: "header", x: 180, y: 180, width: 11_530, height: 520, zIndex: 1_900, locked: false });
    window.localStorage.setItem(storageKey, JSON.stringify(database));
  });
  await page.reload();
  const legacyHeader = page.locator('[data-element-id="legacy-header"]');
  await expect(legacyHeader).toBeVisible();
  await legacyHeader.click({ force: true });
  await page.getByRole("button", { name: "Remove from plan" }).click();
  await expect(legacyHeader).toHaveCount(0);
  await page.getByRole("button", { name: /Undo/ }).click();
  await expect(legacyHeader).toBeVisible();
  await legacyHeader.click({ force: true });
  await page.keyboard.press("Delete");
  await expect(legacyHeader).toHaveCount(0);
});

test("plan library reflects settings language, catalog membership, placement, and category color", async ({ page }) => {
  await useEnglishInterface(page);
  await page.goto("/projects/project-logistics-center/plan");

  await expect(page.getByLabel("Document language")).toHaveCount(0);
  const siteSetupSection = page.locator('[data-category-id="site-setup"]');
  const accessSection = page.locator('[data-category-id="site-access-emergency"]');
  const siteAccessBlock = page.locator('[data-block-id="block-site-access"]');
  await expect(siteSetupSection).toBeVisible();
  await expect(accessSection).toBeVisible();
  const [siteSetupBounds, accessBounds] = await Promise.all([siteSetupSection.boundingBox(), accessSection.boundingBox()]);
  expect(siteSetupBounds).not.toBeNull();
  expect(accessBounds).not.toBeNull();
  expect(accessBounds!.x).toBeGreaterThan(siteSetupBounds!.x);
  expect(accessBounds!.y).toBeGreaterThan(siteSetupBounds!.y);
  expect(accessBounds!.x + accessBounds!.width).toBeLessThan(siteSetupBounds!.x + siteSetupBounds!.width);
  expect(accessBounds!.y + accessBounds!.height).toBeLessThan(siteSetupBounds!.y + siteSetupBounds!.height);
  const [rootColor, accessColor, blockColor] = await Promise.all([
    siteSetupSection.locator(":scope > div").evaluate((element) => getComputedStyle(element).backgroundColor),
    accessSection.locator(":scope > div").evaluate((element) => getComputedStyle(element).backgroundColor),
    siteAccessBlock.locator(".canvas-block-title").evaluate((element) => getComputedStyle(element).backgroundColor),
  ]);
  expect(accessColor).not.toBe(rootColor);
  expect(blockColor).toBe(accessColor);
  await page.getByRole("button", { name: /Access and emergency organization/ }).click();
  await expect(page.locator(".library-category-header").filter({ hasText: "Access and emergency organization" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Included: Organize first aid" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Add: Digital delivery check-in" })).toBeEnabled();
  const firstAidLibraryItem = page.locator(".editor-catalog-card").filter({ hasText: "Organize first aid" });
  await expect(firstAidLibraryItem.locator(".library-drag-icon")).toHaveCount(0);
  await expect(firstAidLibraryItem.locator(".library-drag-copy > span")).toHaveCount(0);
  await expect(firstAidLibraryItem).not.toContainText(/\d+×/);
  const includedIndicator = firstAidLibraryItem.getByRole("button", { name: "Included: Organize first aid" });
  const includedIndicatorBox = await includedIndicator.boundingBox();
  expect(includedIndicatorBox?.width).toBeLessThanOrEqual(24);
  expect(includedIndicatorBox?.height).toBeLessThanOrEqual(24);
  await expect(includedIndicator).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(firstAidLibraryItem).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const addIndicator = page.getByRole("button", { name: "Add: Digital delivery check-in" });
  const addIndicatorCenterOffset = await addIndicator.evaluate((button) => {
    const icon = button.querySelector("svg");
    if (!icon) throw new Error("Add indicator icon is missing");
    const buttonBounds = button.getBoundingClientRect();
    const iconBounds = icon.getBoundingClientRect();
    return {
      x: Math.abs(buttonBounds.x + buttonBounds.width / 2 - (iconBounds.x + iconBounds.width / 2)),
      y: Math.abs(buttonBounds.y + buttonBounds.height / 2 - (iconBounds.y + iconBounds.height / 2)),
    };
  });
  const maximumCenterOffsetPixels = 0.5;
  expect(addIndicatorCenterOffset.x).toBeLessThanOrEqual(maximumCenterOffsetPixels);
  expect(addIndicatorCenterOffset.y).toBeLessThanOrEqual(maximumCenterOffsetPixels);
  await expect(page.locator(".canvas-block").filter({ hasText: "Organize first aid" })).toHaveCount(1);

  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Block catalog" }).click();
  const firstAidCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Organize first aid" }) });
  await firstAidCard.getByRole("button", { name: "Edit: Organize first aid" }).click();
  await page.getByRole("tree", { name: "Catalog placement" }).getByRole("checkbox", { name: "Earthworks" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const catalogColor = await firstAidCard.locator("h3").evaluate((element) => getComputedStyle(element).backgroundColor);

  await page.goto("/projects/project-logistics-center/plan");
  await page.getByRole("button", { name: "Fit blocks" }).click();
  const reconciledPlanState = await page.evaluate(() => {
    const database = JSON.parse(window.localStorage.getItem("quicksige.database.v3") ?? "{}") as {
      plans?: Array<{
        projectId: string;
        sections: Array<{ id: string; categoryId: string; items: Array<{ id: string; blockId: string }> }>;
        layout: { elements: Array<{ kind: string; itemId?: string; sectionId?: string }> };
      }>;
    };
    const plan = database.plans?.find((candidate) => candidate.projectId === "project-logistics-center");
    const section = plan?.sections.find((candidate) => candidate.items.some((item) => item.blockId === "block-first-aid"));
    const item = section?.items.find((candidate) => candidate.blockId === "block-first-aid");
    const element = plan?.layout.elements.find((candidate) => candidate.kind === "block" && candidate.itemId === item?.id);
    return { categoryId: section?.categoryId, sectionId: section?.id, elementSectionId: element?.sectionId };
  });
  expect(reconciledPlanState.categoryId).toBe("earthworks");
  expect(reconciledPlanState.elementSectionId).toBe(reconciledPlanState.sectionId);
  await expect(page.locator(".canvas-block").filter({ hasText: "Organize first aid" }).locator(".canvas-block-title"))
    .toHaveCSS("background-color", catalogColor);
});

test("single-axis resize handles preserve perpendicular dimensions", async ({ page }) => {
  await useEnglishInterface(page);
  await page.setViewportSize({ width: 1_920, height: 1_400 });
  await page.goto("/projects/project-logistics-center/plan");
  await page.getByRole("button", { name: "Fit plan" }).click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(async () => Number((await page.locator(".editor-toolbar .badge").filter({ hasText: "%" }).textContent())?.replace("%", "") ?? 0)).toBeGreaterThan(115);
  await page.locator(".editor-canvas-shell").evaluate((shell) => shell.scrollTo({ left: 0, top: 0 }));

  const readGeometry = (elementId: string) => page.evaluate((id) => {
    const database = JSON.parse(window.localStorage.getItem("quicksige.database.v3") ?? "{}") as { plans?: Array<{ projectId: string; layout: { elements: Array<{ id: string; x: number; y: number; width: number; height: number }> } }> };
    return database.plans?.find((candidate) => candidate.projectId === "project-logistics-center")?.layout.elements.find((element) => element.id === id);
  }, elementId);

  for (const [selector, selectTarget] of [
    [".canvas-block-area", () => page.getByRole("button", { name: "Edit block area" }).click()],
    [".canvas-section", () => page.locator(".canvas-section > div").first().click({ force: true })],
    [".canvas-block", () => page.locator(".canvas-block-title").first().click({ force: true })],
  ] as const) {
    const target = page.locator(selector).first();
    const elementId = await target.getAttribute("data-element-id");
    expect(elementId).toBeTruthy();
    await selectTarget();
    await expect(target).toHaveClass(/is-selected/);
    const beforeCornerBox = await target.boundingBox();
    expect(beforeCornerBox).not.toBeNull();
    const southEastHandle = page.locator(".moveable-control.moveable-se");
    await expect(southEastHandle).toBeVisible();
    const southEastBox = await southEastHandle.boundingBox();
    expect(southEastBox).not.toBeNull();
    await page.mouse.move(southEastBox!.x + southEastBox!.width / 2, southEastBox!.y + southEastBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(southEastBox!.x + southEastBox!.width / 2 - 17, southEastBox!.y + southEastBox!.height / 2 - 17, { steps: 6 });
    const cornerPreviewBox = await target.boundingBox();
    await page.mouse.up();
    const afterCornerBox = await target.boundingBox();
    expect(cornerPreviewBox).not.toBeNull();
    expect(afterCornerBox).not.toBeNull();
    expect(afterCornerBox?.width).toBeLessThan(beforeCornerBox?.width ?? 0);
    expect(afterCornerBox?.height).toBeLessThan(beforeCornerBox?.height ?? 0);
    expect(Math.abs((afterCornerBox?.width ?? 0) - (cornerPreviewBox?.width ?? 0))).toBeLessThan(0.1);
    expect(Math.abs((afterCornerBox?.height ?? 0) - (cornerPreviewBox?.height ?? 0))).toBeLessThan(0.1);

    await selectTarget();
    await expect(target).toHaveClass(/is-selected/);
    const beforeHorizontal = await readGeometry(elementId as string);
    const beforeHorizontalBox = await target.boundingBox();
    expect(beforeHorizontalBox).not.toBeNull();
    const eastHandle = page.locator(".moveable-control.moveable-e");
    await expect(eastHandle).toBeVisible();
    const eastBox = await eastHandle.boundingBox();
    expect(eastBox).not.toBeNull();
    await page.mouse.move(eastBox!.x + eastBox!.width / 2, eastBox!.y + eastBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(eastBox!.x + eastBox!.width / 2 + 40, eastBox!.y + eastBox!.height / 2, { steps: 6 });
    const horizontalPreviewBox = await target.boundingBox();
    await page.mouse.up();
    const afterHorizontal = await readGeometry(elementId as string);
    const afterHorizontalBox = await target.boundingBox();
    expect(horizontalPreviewBox).not.toBeNull();
    expect(afterHorizontalBox).not.toBeNull();
    expect(afterHorizontal?.width).toBeGreaterThan(beforeHorizontal?.width ?? 0);
    expect(afterHorizontal?.width).toBeLessThan((beforeHorizontal?.width ?? 0) + 1_500);
    expect(afterHorizontal?.height).toBeCloseTo(beforeHorizontal?.height ?? 0, 2);
    expect(afterHorizontalBox?.width).toBeGreaterThan(beforeHorizontalBox?.width ?? 0);
    expect(afterHorizontalBox?.height).toBeCloseTo(beforeHorizontalBox?.height ?? 0, 1);
    expect(Math.abs((afterHorizontalBox?.width ?? 0) - (horizontalPreviewBox?.width ?? 0))).toBeLessThan(0.1);
    expect(Math.abs((afterHorizontalBox?.height ?? 0) - (horizontalPreviewBox?.height ?? 0))).toBeLessThan(0.1);

    await selectTarget();
    await expect(target).toHaveClass(/is-selected/);
    const beforeVertical = await readGeometry(elementId as string);
    const beforeVerticalBox = await target.boundingBox();
    expect(beforeVerticalBox).not.toBeNull();
    const southHandle = page.locator(".moveable-control.moveable-s");
    await expect(southHandle).toBeVisible();
    const southBox = await southHandle.boundingBox();
    expect(southBox).not.toBeNull();
    await page.mouse.move(southBox!.x + southBox!.width / 2, southBox!.y + southBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(southBox!.x + southBox!.width / 2, southBox!.y + southBox!.height / 2 - 30, { steps: 6 });
    const verticalPreviewBox = await target.boundingBox();
    await page.mouse.up();
    const afterVertical = await readGeometry(elementId as string);
    const afterVerticalBox = await target.boundingBox();
    expect(verticalPreviewBox).not.toBeNull();
    expect(afterVerticalBox).not.toBeNull();
    expect(afterVertical?.height).toBeLessThan(beforeVertical?.height ?? 0);
    expect(afterVertical?.height).toBeGreaterThan((beforeVertical?.height ?? 0) - 1_500);
    expect(afterVertical?.width).toBeCloseTo(beforeVertical?.width ?? 0, 2);
    expect(afterVerticalBox?.height).toBeLessThan(beforeVerticalBox?.height ?? 0);
    expect(afterVerticalBox?.width).toBeCloseTo(beforeVerticalBox?.width ?? 0, 1);
    expect(Math.abs((afterVerticalBox?.width ?? 0) - (verticalPreviewBox?.width ?? 0))).toBeLessThan(0.1);
    expect(Math.abs((afterVerticalBox?.height ?? 0) - (verticalPreviewBox?.height ?? 0))).toBeLessThan(0.1);
  }
});

test("primary navigation collapses to a persistent icon rail", async ({ page }) => {
  await useEnglishInterface(page);
  await page.goto("/projects/project-logistics-center/plan");
  const appFrame = page.locator(".app-frame");
  const sidebar = page.locator(".sidebar");
  const expandedWidth = (await sidebar.boundingBox())?.width ?? 0;

  await page.getByRole("button", { name: "Collapse navigation" }).click();
  await expect(appFrame).toHaveClass(/navigation-collapsed/);
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? expandedWidth).toBeLessThan(100);
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Projects" })).toBeVisible();

  await page.reload();
  await expect(appFrame).toHaveClass(/navigation-collapsed/);
  await page.getByRole("button", { name: "Expand navigation" }).click();
  await expect(appFrame).not.toHaveClass(/navigation-collapsed/);
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(200);
});

test("responsive plan toolbar stays contained and selection keeps the canvas stationary", async ({ page }) => {
  await useEnglishInterface(page);
  for (const viewport of [
    { width: 1728, height: 1117 },
    { width: 1440, height: 900 },
    { width: 1180, height: 820 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/projects/project-logistics-center/plan");
    await expect.poll(() => page.locator(".canvas-block").count()).toBeGreaterThan(1);

    const toolbarOverflow = await page.locator(".editor-toolbar").evaluate((toolbar) => toolbar.scrollWidth - toolbar.clientWidth);
    expect(toolbarOverflow).toBeLessThanOrEqual(1);
  }

  await page.setViewportSize({ width: 1728, height: 1117 });
  await page.goto("/projects/project-logistics-center/plan");
  await expect(page.getByRole("button", { name: "A0 PDF" })).toHaveText("A0");
  await expect(page.getByRole("button", { name: "Word documents" })).toHaveText("A4");
  await expect(page.getByRole("button", { name: /Undo/ }).locator("xpath=../..")).toHaveClass(/editor-toolbar-trailing/);
  await page.getByRole("button", { name: "Fit plan" }).click();
  const blocks = page.locator(".canvas-block");
  await expect(blocks).not.toHaveCount(0);

  const readCanvasViewport = () => page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(".editor-canvas-shell");
    const stage = document.querySelector<HTMLElement>(".canvas-stage");
    if (!shell || !stage) throw new Error("Canvas viewport is unavailable");
    const shellBounds = shell.getBoundingClientRect();
    const stageBounds = stage.getBoundingClientRect();
    return {
      shellLeft: shellBounds.left,
      shellWidth: shellBounds.width,
      stageLeft: stageBounds.left,
      stageTop: stageBounds.top,
      scrollLeft: shell.scrollLeft,
      scrollTop: shell.scrollTop,
    };
  });
  const settleLayout = () => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  await blocks.nth(0).click({ force: true });
  await settleLayout();
  const firstSelection = await readCanvasViewport();
  await blocks.nth(1).click({ force: true });
  await settleLayout();
  const secondSelection = await readCanvasViewport();

  expect(secondSelection.shellLeft).toBeCloseTo(firstSelection.shellLeft, 2);
  expect(secondSelection.shellWidth).toBeCloseTo(firstSelection.shellWidth, 2);
  expect(secondSelection.stageLeft).toBeCloseTo(firstSelection.stageLeft, 2);
  expect(secondSelection.stageTop).toBeCloseTo(firstSelection.stageTop, 2);
  expect(secondSelection.scrollLeft).toBe(firstSelection.scrollLeft);
  expect(secondSelection.scrollTop).toBe(firstSelection.scrollTop);
});

test("contextual toolbar covers every seeded canvas element family and drag selection stays synchronized", async ({ page }) => {
  await useEnglishInterface(page);
  await page.goto("/projects/project-logistics-center/plan");
  await page.getByRole("button", { name: "Fit plan" }).click();
  await expect(page.getByRole("button", { name: "Project documents" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Document elements" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Annotations" })).toHaveCount(0);
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("menuitem", { name: /Text box/ }).click();
  await page.locator(".wysiwyg-page").click({ position: { x: 520, y: 350 }, force: true });
  await expect(page.locator(".canvas-text")).toHaveCount(1);
  await page.keyboard.press("Escape");
  for (const selector of [
    ".canvas-block-area",
    ".canvas-section",
    ".canvas-block",
    '[data-element-id="layout-demo-image"]',
    '[data-element-id="layout-demo-pdf"]',
    ".canvas-document",
    ".canvas-text",
    ".canvas-title-block",
  ]) {
    await page.locator(selector).first().click({ force: true });
    await expect(page.getByRole("button", { name: "Bring forward" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send backward" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^(Lock|Unlock)$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Selected element options" })).toHaveCount(0);
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

test("annotation insert tools create and format native plan elements", async ({ page }) => {
  await useEnglishInterface(page);
  await page.goto("/projects/project-logistics-center/plan");
  await page.getByRole("button", { name: "Fit plan" }).click();

  const insertAt = async (toolName: string, x: number, y: number) => {
    await page.getByRole("button", { name: "Insert", exact: true }).click();
    await page.getByRole("menuitem", { name: new RegExp(toolName) }).click();
    await page.locator(".wysiwyg-page").click({ position: { x, y }, force: true });
    if (toolName === "Text box" || toolName === "Callout") await page.keyboard.press("Escape");
  };
  const activateConnectorTool = async (toolName: "Line" | "Arrow") => {
    await page.getByRole("button", { name: "Insert", exact: true }).click();
    await page.getByRole("menuitem", { name: new RegExp(toolName) }).click();
  };
  const drawConnector = async (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const planBounds = await page.locator(".wysiwyg-page").boundingBox();
    expect(planBounds).not.toBeNull();
    await page.mouse.move(planBounds!.x + start.x, planBounds!.y + start.y);
    await page.mouse.down();
    await page.mouse.move(planBounds!.x + end.x, planBounds!.y + end.y, { steps: 10 });
    await page.mouse.up();
  };

  await insertAt("Rectangle", 400, 250);
  const rectangle = page.locator(".canvas-shape.is-rectangle");
  await expect(rectangle).toHaveCount(1);
  await page.getByRole("button", { name: "Format element" }).click();
  await page.getByLabel("Fill color").fill("#3b82f6");
  await expect(rectangle).toHaveCSS("background-color", "rgb(59, 130, 246)");
  await page.getByRole("button", { name: "Format element" }).click();

  await activateConnectorTool("Line");
  const planBounds = await page.locator(".wysiwyg-page").boundingBox();
  expect(planBounds).not.toBeNull();
  await page.mouse.move(planBounds!.x + 300, planBounds!.y + 220);
  await page.mouse.down();
  await expect(page.locator(".canvas-insert-preview")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(".canvas-shape.is-line")).toHaveCount(0);
  await drawConnector({ x: 300, y: 220 }, { x: 420, y: 320 });
  await activateConnectorTool("Arrow");
  await drawConnector({ x: 450, y: 230 }, { x: 320, y: 350 });
  await insertAt("Callout", 460, 310);
  await insertAt("Text box", 480, 330);
  const lineGraphic = page.locator(".canvas-shape.is-line svg line");
  await expect(lineGraphic).toHaveAttribute("x1", "0%");
  await expect(lineGraphic).toHaveAttribute("y1", "0%");
  await expect(lineGraphic).toHaveAttribute("x2", "100%");
  await expect(lineGraphic).toHaveAttribute("y2", "100%");
  const arrowGraphic = page.locator(".canvas-shape.is-arrow svg line");
  await expect(arrowGraphic).toHaveAttribute("x1", "100%");
  await expect(arrowGraphic).toHaveAttribute("y1", "0%");
  await expect(arrowGraphic).toHaveAttribute("x2", "0%");
  await expect(arrowGraphic).toHaveAttribute("y2", "100%");
  await expect(page.locator(".canvas-shape.is-callout")).toHaveCount(1);
  await expect(page.locator(".canvas-text")).toHaveCount(1);
});
