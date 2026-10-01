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
  await page.getByRole("button", { name: /Import \d+ contacts/ }).click();
  await expect(page.getByRole("dialog", { name: "Import contacts" })).toHaveCount(0);
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
  await expect(page.getByLabel("Display name")).toHaveCount(0);
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
  await expect(importModal.getByLabel("Project", { exact: true })).toHaveCount(0);
  await expect(importModal.getByRole("group", { name: "Project roles" })).toHaveCount(0);
  await expect(importModal.getByText("Apply to all")).toHaveCount(0);
  await importModal.getByRole("button", { name: "Import contact", exact: true }).click();
  await expect(importModal).toHaveCount(0);
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
  await page.getByRole("button", { name: "Add contact" }).click();
  let assignmentDialog = page.getByRole("dialog", { name: "Add contact" });
  await assignmentDialog.getByRole("combobox", { name: "Add person" }).fill("Katherine Johnson");
  await assignmentDialog.getByRole("option", { name: /Katherine Johnson/ }).click();
  await assignmentDialog.getByRole("button", { name: "Manage roles" }).click();
  await assignmentDialog.getByRole("checkbox", { name: "Architect", exact: true }).check();
  await assignmentDialog.getByRole("button", { name: "Done" }).click();
  await assignmentDialog.getByRole("button", { name: "Add", exact: true }).click();
  const importedAssignment = page.locator(".project-contact-list article").filter({ hasText: "Katherine Johnson" });
  await expect(importedAssignment).not.toContainText("Contractor");
  await expect(importedAssignment).toContainText("Architect");

  await page.getByRole("button", { name: "Add contact" }).click();
  assignmentDialog = page.getByRole("dialog", { name: "Add contact" });
  await assignmentDialog.getByRole("combobox", { name: "Add person" }).fill("Grace Hopper");
  await assignmentDialog.getByRole("option", { name: /Grace Hopper/ }).click();
  await expect(assignmentDialog.locator(".project-contact-picker-selection")).toContainText("Grace Hopper");
  await expect(assignmentDialog.getByRole("button", { name: "Add", exact: true })).toBeEnabled();
  await assignmentDialog.getByRole("button", { name: "Manage roles" }).click();
  await assignmentDialog.getByRole("checkbox", { name: "Architect", exact: true }).check();
  await assignmentDialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator(".project-contact-list").getByText("Grace Hopper", { exact: true })).toBeVisible();
  await expect(page.locator(".project-contact-list article").filter({ hasText: "Grace Hopper" }).getByText("Architect", { exact: true })).toBeVisible();
});

test("asks only email duplicates how to resolve the import and merges fields inline", async ({ page }) => {
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "anna.vcf",
    mimeType: "text/vcard",
    buffer: Buffer.from([
      "BEGIN:VCARD",
      "VERSION:4.0",
      "FN:Anneliese Richter",
      "N:Richter;Anneliese;;;",
      "EMAIL;TYPE=work;PREF=1:ANNA.RICHTER@example.test",
      "TEL;TYPE=work:+49 30 555 0199",
      "END:VCARD",
    ].join("\r\n")),
  });

  const importModal = page.getByRole("dialog", { name: "Import contacts" });
  await expect(importModal.getByText("A contact with the same email address already exists.")).toBeVisible();
  await expect(importModal.getByRole("button", { name: "Import contact", exact: true })).toBeDisabled();
  await importModal.getByRole("button", { name: "Merge", exact: true }).click();
  await expect(importModal.getByRole("group", { name: "Last name" })).toHaveCount(0);
  await expect(importModal.getByRole("group", { name: "Email" })).toHaveCount(0);
  await importModal.getByRole("group", { name: "First name" }).getByRole("radio", { name: /Imported Anneliese/ }).check();
  await importModal.getByRole("button", { name: "Import contact", exact: true }).click();

  await expect(importModal).toHaveCount(0);
  await expect(page.getByText("Dr. Anneliese Richter", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Confirm import" })).toHaveCount(0);
});

test("derives the visible name from title, first name, last name, and suffix", async ({ page }) => {
  const row = page.locator(".contacts-table-row").filter({ hasText: "Dr. Anna Richter" });
  await row.locator(".contact-row-open").click();
  await page.locator(".contact-preview").getByRole("button", { name: "Edit", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Edit contact" });
  await expect(dialog.getByLabel("Display name")).toHaveCount(0);
  await dialog.getByLabel("Last name").fill("Schmidt");
  await dialog.getByLabel("Suffix").fill("PhD");
  await dialog.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Dr. Anna Schmidt PhD", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Dr. Anna Richter", { exact: true })).toHaveCount(0);
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

test("confirms participant removal and can immediately re-add the first contact with a shared role", async ({ page }) => {
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Projects" }).click();
  await page.getByRole("article").filter({ hasText: "Logistikzentrum West" }).getByRole("link", { name: "Open" }).click();

  const participantsPanel = page.locator(".project-contacts-panel");
  await expect(participantsPanel.getByRole("button", { name: "Import", exact: true })).toHaveCount(0);

  let annaRow = participantsPanel.locator(".project-contact-list article").filter({ hasText: "Dr. Anna Richter" });
  await annaRow.getByRole("button", { name: "Remove from project" }).click();
  const confirmation = page.getByRole("dialog", { name: "Remove project participant?" });
  await expect(confirmation).toContainText("The contact will remain available in Contacts.");
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(annaRow).toBeVisible();

  await annaRow.getByRole("button", { name: "Remove from project" }).click();
  await confirmation.getByRole("button", { name: "Remove from project" }).click();
  await expect(annaRow).toHaveCount(0);

  await participantsPanel.getByRole("button", { name: "Add contact" }).click();
  const assignmentDialog = page.getByRole("dialog", { name: "Add contact" });
  await assignmentDialog.getByRole("combobox", { name: "Add person" }).fill("Westpark Projekt GmbH");
  await assignmentDialog.getByRole("option", { name: /Dr\. Anna Richter/ }).click();
  await expect(assignmentDialog.locator(".project-contact-picker-selection")).toContainText("Dr. Anna Richter");
  await expect(assignmentDialog.getByRole("button", { name: "Add", exact: true })).toBeEnabled();
  await assignmentDialog.getByRole("button", { name: "Manage roles" }).click();
  await assignmentDialog.getByLabel("Site manager").check();
  await assignmentDialog.getByRole("button", { name: "Done" }).click();
  await expect(assignmentDialog.getByRole("button", { name: "Add", exact: true })).toBeEnabled();
  await assignmentDialog.getByRole("button", { name: "Add", exact: true }).click();

  annaRow = participantsPanel.locator(".project-contact-list article").filter({ hasText: "Dr. Anna Richter" });
  const danielRow = participantsPanel.locator(".project-contact-list article").filter({ hasText: "Daniel König" });
  await expect(annaRow).toContainText("Site manager");
  await expect(danielRow).toContainText("Site manager");

  await participantsPanel.getByRole("button", { name: "New contact" }).click();
  await expect(page.getByText("Saved in Contacts", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.goto("/projects/new");
  const newProjectParticipants = page.locator(".project-create-contacts");
  await expect(newProjectParticipants.getByRole("button", { name: "Import", exact: true })).toHaveCount(0);
});

test("reuses organization roles and persists participant placement in the project overview", async ({ page }) => {
  await page.goto("/templates");
  const projectRoles = page.locator(".project-roles-template-section");
  await projectRoles.getByRole("button", { name: "Add role" }).click();
  await page.getByLabel("Role name").fill("Fire safety lead");
  await page.getByRole("dialog", { name: "Add role" }).getByRole("button", { name: "Save" }).click();
  await expect(projectRoles.getByText("Fire safety lead", { exact: true })).toBeVisible();
  await projectRoles.getByRole("button", { name: "Add role" }).click();
  await page.getByLabel("Role name").fill("Safety advisor");
  await page.getByRole("dialog", { name: "Add role" }).getByRole("button", { name: "Save" }).click();
  await projectRoles.getByRole("button", { name: "Move up: Safety advisor" }).click();
  await expect(projectRoles.locator(".project-role-settings-groups > div").nth(1).getByRole("article").nth(0)).toContainText("Safety advisor");

  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Projects" }).click();
  await page.getByRole("article").filter({ hasText: "Logistikzentrum West" }).getByRole("link", { name: "Open" }).click();
  await page.getByRole("button", { name: "Edit project information" }).click();
  await expect(page.getByRole("heading", { name: "Edit project" })).toBeVisible();

  const participants = page.locator(".project-contacts-panel");
  await expect(participants.getByText("Daniel König", { exact: true })).toBeVisible();
  const danielAssignment = participants.locator(".project-contact-list article").filter({ hasText: "Daniel König" });
  await expect(page.getByRole("dialog", { name: "Edit assignment" })).toHaveCount(0);
  await danielAssignment.getByRole("button", { name: "Manage roles" }).click();
  await danielAssignment.getByLabel("Fire safety lead").check();
  await danielAssignment.getByRole("button", { name: "Done" }).click();
  await expect(danielAssignment).toContainText("Fire safety lead");
  await danielAssignment.getByRole("button", { name: "Remove: Fire safety lead" }).click();
  await danielAssignment.getByRole("button", { name: "Remove: Site manager" }).click();
  await expect(danielAssignment.getByText("No role selected yet", { exact: true })).toBeVisible();

  await danielAssignment.getByRole("button", { name: "Manage roles" }).click();
  await danielAssignment.getByRole("checkbox", { name: "Fire safety lead", exact: true }).check();
  await danielAssignment.getByRole("checkbox", { name: "Fire safety lead", exact: true }).uncheck();
  await danielAssignment.getByRole("button", { name: "Done" }).click();
  await expect(danielAssignment.getByText("No role selected yet", { exact: true })).toBeVisible();

  await danielAssignment.getByRole("button", { name: "Manage roles" }).click();
  await danielAssignment.getByLabel("Fire safety lead").check();
  await danielAssignment.getByRole("button", { name: "Done" }).click();
  await expect(danielAssignment).toContainText("Fire safety lead");

  await participants.getByLabel("Section title").fill("Project participants");
  await page.getByRole("button", { name: "Move section down: Project participants" }).click();
  await page.locator(".project-composer-footer").getByRole("button", { name: "Save" }).click();

  const overviewSections = page.locator(".overview-grid > section");
  await expect(overviewSections.nth(0).getByRole("heading", { level: 2 })).toHaveText("Allgemein");
  await expect(overviewSections.nth(1).getByRole("heading", { level: 2 })).toHaveText("Project participants");
  await page.reload();
  await expect(page.locator(".overview-grid > section").nth(1).getByRole("heading", { level: 2 })).toHaveText("Project participants");
  await expect(page.locator(".project-contact-list article").filter({ hasText: "Daniel König" })).toContainText("Fire safety lead");

  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Contacts" }).click();
  await page.locator(".contacts-table-row").filter({ hasText: "Daniel König" }).getByRole("button", { name: /Daniel König/ }).click();
  await page.locator(".contact-preview-actions").getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Company name").fill("Canonical Build GmbH");
  await page.getByLabel("Job title").fill("Lead site manager");
  await page.getByRole("button", { name: "Save" }).click();

  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Projects" }).click();
  await page.getByRole("article").filter({ hasText: "Logistikzentrum West" }).getByRole("link", { name: "Open" }).click();
  const updatedDaniel = page.locator(".project-contact-list article").filter({ hasText: "Daniel König" });
  await expect(updatedDaniel).toContainText("Canonical Build GmbH");
  await expect(updatedDaniel.getByRole("button", { name: "Manage roles" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Edit assignment" })).toHaveCount(0);
});

test("creates project-only participant roles as pills without adding them to Templates", async ({ page }) => {
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Scoped roles project");
  await page.locator(".project-section-library").getByRole("button", { name: /Project participants/ }).click();
  const participants = page.locator(".project-create-contacts");
  await participants.getByRole("combobox", { name: "Add person" }).fill("Anna Richter");
  await participants.getByRole("option", { name: /Dr\. Anna Richter/ }).click();
  const participantRow = participants.locator(".project-create-contact-list > div").filter({ hasText: "Dr. Anna Richter" });
  await expect(participantRow.getByText("No role selected yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create project" })).toBeEnabled();

  await participantRow.getByRole("button", { name: "Manage roles" }).click();
  await participantRow.getByRole("button", { name: /Create new role/ }).click();
  await participantRow.getByLabel("Role name").fill("Lifting coordinator");
  const reusableRoleChoice = participantRow.getByRole("switch", { name: "Save as reusable template role" });
  await expect(reusableRoleChoice).toHaveAttribute("aria-checked", "true");
  await reusableRoleChoice.click();
  await expect(reusableRoleChoice).toHaveAttribute("aria-checked", "false");
  await participantRow.getByRole("button", { name: "Add role" }).click();
  await expect(participantRow.locator(".project-role-pill").filter({ hasText: "Lifting coordinator" })).toBeVisible();
  await participantRow.getByRole("button", { name: "Done" }).click();

  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("navigation", { name: "Project navigation" }).getByRole("link", { name: "Overview" }).click();
  await expect(page.locator(".project-contact-list article").filter({ hasText: "Dr. Anna Richter" })).toContainText("Lifting coordinator");

  await page.goto("/templates");
  await expect(page.locator(".project-roles-template-section").getByText("Lifting coordinator", { exact: true })).toHaveCount(0);
});

test("persists workspace preferences and completes a reviewed merge", async ({ page }) => {
  await importCsvContacts(page, [
    "First Name,Last Name,Email,Notes",
    "Grace,Hopper,grace@example.com,Surviving note",
    "Katherine,Johnson,katherine@example.com,Merged note",
  ].join("\n"));

  await expect(page.locator(".contacts-toolbar .contacts-column-picker")).toHaveCount(0);
  const columnPicker = page.locator(".contacts-table-panel > .contacts-column-picker");
  await columnPicker.locator("summary").click();
  await expect(columnPicker).toHaveAttribute("open", "");
  await page.locator(".contacts-toolbar .search-input").click();
  await expect(columnPicker).not.toHaveAttribute("open", "");
  await columnPicker.locator("summary").click();
  await page.getByLabel("Updated", { exact: true }).check();
  await page.reload();
  await expect(columnPicker).toBeVisible();
  await expect(page.getByLabel("Updated", { exact: true })).toBeChecked();
  await expect(page.locator(".contacts-table-head > span").filter({ hasText: /^Updated$/ })).toBeVisible();
  await page.getByRole("tab", { name: /Companies/ }).click();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Projects" }).click();
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Contacts" }).click();
  await expect(page.getByRole("tab", { name: /Companies/ })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /People/ }).click();

  await page.getByLabel("Select Grace Hopper").check();
  await page.getByLabel("Select Katherine Johnson").check();
  await expect(page.getByRole("button", { name: "Add tag" })).toHaveCount(0);

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
    database.contacts[0].prefix = "Dr.";
    database.contacts[0].givenName = "Maximilian Alexander";
    database.contacts[0].familyName = "von Beispielhausen-Schöneberg";
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
