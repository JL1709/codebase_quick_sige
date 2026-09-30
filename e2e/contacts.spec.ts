import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function importCsvContacts(page: import("@playwright/test").Page, csv: string) {
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "contacts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /Import \d+ contacts/ }).click();
  await expect(page.getByRole("heading", { name: "Import complete" })).toBeVisible();
  await page.locator(".contact-import-modal .modal-footer").getByRole("button", { name: "Close" }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.goto("/settings");
  await page.getByRole("button", { name: /English/ }).click();
  await page.goto("/contacts");
});

test("creates, imports, exports, and assigns canonical contacts", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Contacts", exact: true })).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((violation) => violation.impact === "critical" || violation.impact === "serious")).toEqual([]);
  await page.getByRole("button", { name: "New contact" }).click();
  await page.getByLabel("First name").fill("Grace");
  await page.getByLabel("Last name").fill("Hopper");
  await page.getByRole("textbox", { name: "Email addresses", exact: true }).fill("grace@example.com");
  await page.getByLabel("Company name").fill("Navy Computing");
  await page.getByLabel("Job title").fill("Engineer");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Grace Hopper", { exact: true }).first()).toBeVisible();
  await page.locator(".contacts-table-row").filter({ hasText: "Grace Hopper" }).getByRole("button", { name: /Grace Hopper/ }).click();
  await expect(page).toHaveURL(/\/contacts\/people\/contact-/);
  await page.goBack();
  await expect(page).toHaveURL(/\/contacts$/);

  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "contacts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("First Name,Last Name,Email,Company\nKatherine,Johnson,katherine@example.com,NASA"),
  });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Katherine Johnson", { exact: true })).toBeVisible();
  const importModal = page.getByRole("dialog", { name: "Import contacts" });
  await importModal.getByRole("combobox", { name: "Project", exact: true }).selectOption({ label: "Logistikzentrum West" });
  await importModal.getByRole("group", { name: "Project roles" }).getByLabel("Architect").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Confirm import" })).toBeVisible();
  await page.getByRole("button", { name: "Import 1 contacts" }).click();
  await expect(page.getByRole("heading", { name: "Import complete" })).toBeVisible();
  await page.locator(".contact-import-modal .modal-footer").getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("Katherine Johnson", { exact: true }).first()).toBeVisible();

  const graceRow = page.locator(".contacts-table-row").filter({ hasText: "Grace Hopper" });
  await graceRow.getByRole("checkbox").check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "CSV" }).first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^quicksige-contacts-.*\.csv$/);
  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "JSON" }).first().click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toMatch(/^quicksige-contacts-data-.*\.json$/);
  await page.locator(".contacts-bulk-bar").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("heading", { name: "Review impact" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Projects" }).click();
  await page.getByRole("article").filter({ hasText: "Logistikzentrum West" }).getByRole("link", { name: "Open" }).click();
  const importedAssignment = page.locator(".project-contact-list article").filter({ hasText: "Katherine Johnson" });
  await expect(importedAssignment).toContainText("Contractor");
  await expect(importedAssignment).toContainText("Architect");
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByLabel("Search").fill("Grace Hopper");
  await page.getByLabel("Person").selectOption({ index: 0 });
  await page.getByLabel("Project role").selectOption("architect");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".project-contact-list").getByText("Grace Hopper", { exact: true })).toBeVisible();
  await expect(page.locator(".project-contact-list article").filter({ hasText: "Grace Hopper" }).getByText("Architect", { exact: true })).toBeVisible();
});

test("keeps Contacts and project assignments read-only for viewers", async ({ page }) => {
  await page.evaluate(() => {
    const storageKey = "quicksige.database.v3";
    const database = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    database.user.role = "viewer";
    window.localStorage.setItem(storageKey, JSON.stringify(database));
  });
  await page.reload();

  await expect(page.getByRole("button", { name: "New contact" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Import", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "CSV" }).last()).toBeDisabled();

  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Projects" }).click();
  await page.getByRole("article").filter({ hasText: "Logistikzentrum West" }).getByRole("link", { name: "Open" }).click();
  await expect(page.getByRole("button", { name: "Add contact" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "New contact" })).toBeDisabled();
});

test("persists workspace preferences and completes bulk tagging and reviewed merge", async ({ page }) => {
  await importCsvContacts(page, [
    "First Name,Last Name,Email,Notes",
    "Grace,Hopper,grace@example.com,Surviving note",
    "Katherine,Johnson,katherine@example.com,Merged note",
  ].join("\n"));

  await page.locator(".contacts-toolbar > select").filter({ has: page.locator('option[value="csv"]') }).selectOption("csv");
  await page.locator(".contacts-column-picker").getByText("Columns").click();
  await page.getByLabel("Updated", { exact: true }).check();
  await page.reload();
  await expect(page.locator(".contacts-toolbar > select").filter({ has: page.locator('option[value="csv"]') })).toHaveValue("csv");
  await expect(page.getByLabel("Updated", { exact: true })).toBeChecked();
  await expect(page.locator(".contacts-table-head").getByText("Updated", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /Companies/ }).click();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Projects" }).click();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByRole("tab", { name: /Companies/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /People/ }).click();

  await page.getByLabel("Select Grace Hopper").check();
  await page.getByLabel("Select Katherine Johnson").check();
  await page.getByRole("button", { name: "Add tag" }).click();
  await page.getByLabel("Tag", { exact: true }).fill("Engineering");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".contacts-table-row").filter({ hasText: "Grace Hopper" })).toContainText("Engineering");
  await expect(page.locator(".contacts-table-row").filter({ hasText: "Katherine Johnson" })).toContainText("Engineering");

  await page.getByRole("button", { name: "Review duplicates" }).click();
  const firstNameChoices = page.getByRole("group", { name: "First name" });
  await firstNameChoices.getByText("Katherine Johnson", { exact: true }).click();
  await page.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(page.getByText("Katherine Johnson", { exact: true })).toHaveCount(0);
  await page.locator(".contacts-table-row").filter({ hasText: "Katherine Hopper" }).getByRole("button", { name: /Katherine Hopper/ }).click();
  await page.locator(".contact-preview-actions").getByRole("button", { name: "Edit" }).click();
  await expect(page.getByLabel("First name")).toHaveValue("Katherine");
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByLabel("Status").selectOption("archived");
  await expect(page.getByText("Katherine Johnson", { exact: true }).first()).toBeVisible();
});

test("creates, edits, archives, and restores a company after reviewing its impact", async ({ page }) => {
  await page.getByRole("tab", { name: /Companies/ }).click();
  await page.getByRole("button", { name: "New company" }).click();
  await page.getByLabel("Company name").fill("Zeta Safety GmbH");
  await page.getByLabel("Website").fill("https://zeta.example");
  await page.getByLabel("Email", { exact: true }).fill("office@zeta.example");
  await page.getByRole("button", { name: "Save" }).click();

  let companyCard = page.locator(".company-grid article").filter({ hasText: "Zeta Safety GmbH" });
  await expect(companyCard).toBeVisible();
  await companyCard.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Phone", { exact: true }).fill("+49 30 123456");
  await page.getByRole("button", { name: "Save" }).click();
  companyCard = page.locator(".company-grid article").filter({ hasText: "Zeta Safety GmbH" });
  await expect(companyCard).toContainText("office@zeta.example");

  await companyCard.getByRole("checkbox", { name: "Select company Zeta Safety GmbH" }).check();
  await page.locator(".contacts-bulk-bar").getByRole("button", { name: "Archive" }).click();
  await expect(page.getByRole("heading", { name: "Review impact" })).toBeVisible();
  await page.getByRole("button", { name: "Change status" }).click();
  await page.getByLabel("Status").selectOption("archived");
  companyCard = page.locator(".company-grid article").filter({ hasText: "Zeta Safety GmbH" });
  await expect(companyCard).toBeVisible();
  await companyCard.getByRole("button", { name: "Restore" }).click();
  await page.getByRole("button", { name: "Change status" }).click();
  await page.getByLabel("Status").selectOption("active");
  await expect(page.locator(".company-grid article").filter({ hasText: "Zeta Safety GmbH" })).toBeVisible();
});

test("bounds the Contacts index to 100 rendered rows with a 10,000-contact workspace", async ({ page }) => {
  await page.evaluate(() => {
    const storageKey = "quicksige.database.v3";
    const database = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    database.contacts = Array.from({ length: 10_000 }, (_, index) => ({
      id: `load-contact-${index}`,
      organizationId: database.organization.id,
      prefix: "",
      givenName: "Load",
      familyName: `Person ${String(index).padStart(5, "0")}`,
      suffix: "",
      displayName: "",
      emails: [],
      phones: [],
      addresses: [],
      notes: "",
      tags: [],
      lifecycle: "active",
      source: "manual",
      createdAt: "2026-09-29T00:00:00.000Z",
      updatedAt: "2026-09-29T00:00:00.000Z",
    }));
    database.projects = [];
    database.companies = [];
    database.contactAffiliations = [];
    database.projectContactAssignments = [];
    database.externalContactIdentities = [];
    database.contactImportBatches = [];
    database.assessmentRuns = [];
    database.blocks = [];
    database.categories = [];
    database.plans = [];
    database.revisions = [];
    database.overviewTemplates = [];
    database.documentTemplates = [];
    database.documentConfigurations = [];
    database.generatedDocuments = [];
    database.auditEvents = [];
    window.localStorage.setItem(storageKey, JSON.stringify(database));
  });
  await page.reload();

  await expect(page.locator(".contacts-table-row")).toHaveCount(100);
  await expect(page.getByRole("button", { name: "Show more (9900 remaining)" })).toBeVisible();
  await page.getByRole("button", { name: "Show more (9900 remaining)" }).click();
  await expect(page.locator(".contacts-table-row")).toHaveCount(200);
});

test("keeps long German contact content usable across supported viewport classes", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /Deutsch/ }).click();
  await page.goto("/contacts");
  await page.evaluate(() => {
    const storageKey = "quicksige.database.v3";
    const database = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    database.contacts[0].displayName = "Dr. Maximilian Alexander von Beispielhausen-Schöneberg";
    database.contacts[0].tags = ["Brandschutzkoordination und Ausführungsplanung"];
    database.companies[0].name = "Planungsgesellschaft für nachhaltige Infrastruktur und Gebäudetechnik mbH";
    window.localStorage.setItem(storageKey, JSON.stringify(database));
  });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Kontakte", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Kontakt anlegen" })).toBeVisible();
    const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(documentWidth).toBeLessThanOrEqual(viewport.width + 1);
  }
});
