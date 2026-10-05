import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { contactsRepositorySnapshot, type AppRepository } from "../data/localRepository";
import { createSeedDatabase } from "../data/seed";
import type { AppDatabase, DocumentTemplate, Locale } from "../domain/types";
import { I18nProvider } from "../i18n/I18nProvider";
import { AppProvider, useApp } from "../state/AppProvider";
import { emptyOrganizationProfile } from "../domain/organizationProfile";
import { SettingsPage, TemplatesPage } from "./SettingsPage";

afterEach(cleanup);

function createMemoryRepository(initialDatabase: AppDatabase) {
  let database = structuredClone(initialDatabase);
  const repository: AppRepository = {
    load: () => database,
    save: (nextDatabase) => { database = structuredClone(nextDatabase); },
    loadContacts: () => structuredClone(contactsRepositorySnapshot(database)),
    saveContacts: (snapshot) => { database = { ...database, ...structuredClone(snapshot) }; },
    reset: () => database,
    hasBackup: () => false,
    restoreBackup: () => database,
    exportBackup: () => null,
    getMigrationError: () => null,
  };
  return { repository, current: () => database };
}

function renderTemplatesPage(database: AppDatabase, locale: Locale = "en") {
  const memory = createMemoryRepository(database);
  render(
    <AppProvider repository={memory.repository}>
      <I18nProvider locale={locale} setLocale={() => undefined}>
        <TemplatesPage />
      </I18nProvider>
    </AppProvider>,
  );
  return memory;
}

function renderSettingsPage(database: AppDatabase, locale: Locale = "en") {
  const memory = createMemoryRepository(database);
  render(
    <AppProvider repository={memory.repository}>
      <I18nProvider locale={locale} setLocale={() => undefined}>
        <SettingsPage />
        <OrganizationMutationProbe />
      </I18nProvider>
    </AppProvider>,
  );
  return memory;
}

function wordTemplatesSection(): HTMLElement {
  return screen.getByRole("heading", { name: "Word templates" }).closest("section") as HTMLElement;
}

function overviewTemplatesSection(): HTMLElement {
  return screen.getByRole("heading", { name: "Overview templates" }).closest("section") as HTMLElement;
}

describe("Project role templates", () => {
  it("manages reusable organization roles from Templates", () => {
    const memory = renderTemplatesPage(createSeedDatabase());

    const projectRolesSection = screen.getByRole("heading", { name: "Project roles" }).closest("section") as HTMLElement;
    fireEvent.click(within(projectRolesSection).getByRole("button", { name: "Add role" }));
    fireEvent.change(screen.getByLabelText("Role name"), { target: { value: "Fire safety lead" } });
    fireEvent.click(within(screen.getByRole("dialog", { name: "Add role" })).getByRole("button", { name: "Save" }));

    expect(within(projectRolesSection).getByText("Fire safety lead", { exact: true })).toBeInTheDocument();
    expect(memory.current().projectRoleDefinitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Fire safety lead", lifecycle: "active" }),
    ]));
  });

  it("keeps Settings focused on platform and workspace configuration", () => {
    renderSettingsPage(createSeedDatabase());

    expect(screen.queryByRole("heading", { name: "Project roles" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Platform language" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Local data storage" })).toBeInTheDocument();
  });
});

describe("Overview template localization", () => {
  it("does not expose the legacy participant bridge as an editable overview template", () => {
    renderTemplatesPage(createSeedDatabase());

    expect(within(overviewTemplatesSection()).queryByText("Project participants", { selector: "strong" })).not.toBeInTheDocument();
  });

  it("edits only the active language and saves without a placeholder warning", () => {
    const memory = renderTemplatesPage(createSeedDatabase());
    const confirmation = vi.spyOn(window, "confirm");
    const section = overviewTemplatesSection();
    const templateRow = within(section).getByText("General", { selector: "strong" }).closest("article") as HTMLElement;

    fireEvent.click(within(templateRow).getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/^Template name/), { target: { value: "General details" } });
    fireEvent.change(screen.getAllByLabelText("Label")[0], { target: { value: "Customer" } });
    fireEvent.change(screen.getAllByLabelText("Default value (optional)")[0], { target: { value: "Example Ltd" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(confirmation).not.toHaveBeenCalled();
    const saved = memory.current().overviewTemplates.find((candidate) => candidate.id === "overview-template-standard")!;
    expect(saved.name).toBe("Allgemein");
    expect(saved.entries[0].label).toBe("Bauherr");
    expect(saved.translations?.en?.name).toBe("General details");
    expect(saved.entries[0].translations?.en).toEqual({ label: "Customer", defaultValue: "Example Ltd" });
    confirmation.mockRestore();
  });
});

describe("Word template settings", () => {
  it("shows project templates in their document language alongside the localized standard report", () => {
    renderTemplatesPage(createSeedDatabase());

    const section = wordTemplatesSection();
    expect(within(section).getAllByRole("article")).toHaveLength(21);
    const a4SafetyPlan = within(section).getByText("A4 safety plan", { selector: "strong" });
    expect(a4SafetyPlan.closest("article")).toHaveTextContent("QuickSiGe Standard · English · Standard · v1");
    expect(within(section).queryByText("Site principles", { selector: "strong" })).not.toBeInTheDocument();
    expect(within(section).getByText("Brandschutzordnung Teil A", { selector: "strong" }).closest("article")).toHaveTextContent("German");
    expect(within(section).queryByRole("button", { name: "Duplicate" })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Show archived" })).not.toBeInTheDocument();

    fireEvent.click(within(section).getByRole("button", { name: "Add Word template" }));
    expect(screen.queryByLabelText("Document type")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Template language")).toHaveValue("en");
    expect(screen.getByLabelText("Template language")).toHaveAccessibleDescription("Controls date formats and the language of inserted text. Does not translate the Word file. Placeholder names stay the same.");
  });

  it.each(["de", "en"] as const)("shows stable participant placeholders in the %s interface", async (locale) => {
    renderTemplatesPage(createSeedDatabase(), locale);
    const selectorLabel = locale === "de" ? "Projekt für Platzhalter" : "Project for placeholders";
    fireEvent.change(screen.getByLabelText(selectorLabel), { target: { value: "project-logistics-center" } });
    expect(await screen.findByText("{{qs.project.projektbeteiligte.company}}")).toBeInTheDocument();
    for (const key of ["name", "role", "email", "phone"]) expect(screen.getByText(`{{qs.project.projektbeteiligte.${key}}}`)).toBeInTheDocument();
    expect(screen.queryByText("{{qs.project.projektbeteiligte.unternehmen}}")).not.toBeInTheDocument();
  });

  it("lists project and organization placeholders from the shared data builder", async () => {
    renderTemplatesPage(createSeedDatabase());

    expect(await screen.findByText("{{qs.project.plan.category_tree.title}}")).toBeInTheDocument();
    expect(document.querySelector('[data-placeholder-group="qs.project.plan.category_tree"] pre code')).toHaveTextContent("{{#qs.project.plan.category_tree}}");
    expect(screen.getByText("{{qs.project.plan.category_tree.title}}")).toBeInTheDocument();
    expect(screen.getByText("{{qs.project.plan.category_tree.path}}")).toBeInTheDocument();
    expect(document.querySelector('[data-placeholder-group="qs.project.plan.category_tree.blocks"] pre code')).toHaveTextContent("{{#qs.project.plan.category_tree.blocks}}");
    expect(screen.getByText("{{qs.project.plan.category_tree.blocks.image}}")).toBeInTheDocument();
    expect(screen.getByText("{{qs.project.plan.category_tree.blocks.a4_description}}")).toBeInTheDocument();
    expect(screen.getByText("{{qs.project.plan.category_tree.blocks.regulations}}")).toBeInTheDocument();
    expect(screen.getByText("{{qs.project.name}}")).toBeInTheDocument();
    expect(screen.getByText("{{qs.project.plan.category_tree.blocks.expert_note}}")).toBeInTheDocument();
    expect(screen.queryByText("{{qs.section.heading}}")).not.toBeInTheDocument();
    expect(screen.queryByText("{{PAGEBREAK}}")).not.toBeInTheDocument();
  });

  it("copies placeholders on an insecure connection and confirms the action", async () => {
    const originalExecCommand = Object.getOwnPropertyDescriptor(document, "execCommand");
    const execCommand = vi.fn(() => {
      expect(document.querySelector("textarea")).toHaveValue("{{qs.project.plan.category_tree.path}}");
      return true;
    });
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });

    try {
      renderTemplatesPage(createSeedDatabase());
      const copyButton = await screen.findByRole("button", { name: "Copy Word placeholder: {{qs.project.plan.category_tree.path}}" });

      fireEvent.click(copyButton);

      await waitFor(() => expect(copyButton).toHaveTextContent("Copied"));
      expect(execCommand).toHaveBeenCalledWith("copy");
    } finally {
      if (originalExecCommand) Object.defineProperty(document, "execCommand", originalExecCommand);
      else Reflect.deleteProperty(document, "execCommand");
    }
  });

  it("shows saved field labels and current values, and searches across collapsed sections", async () => {
    renderTemplatesPage(createSeedDatabase());
    fireEvent.change(screen.getByLabelText("Project for placeholders"), { target: { value: "project-logistics-center" } });
    const numberToken = await screen.findByText("{{qs.project.allgemein.nummer}}");
    expect(numberToken.closest(".reference-group")).toHaveAttribute("open");
    expect(document.querySelector('[data-placeholder-group="qs.project.projektbeteiligte"]')).not.toHaveAttribute("open");
    const numberRow = numberToken.closest(".reference-field-row") as HTMLElement;
    expect(within(numberRow).getByText("Nummer")).toBeInTheDocument();
    expect(within(numberRow).getByText("LW-2026-001")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search placeholders"), { target: { value: "Westpark Projekt GmbH" } });
    const companyToken = screen.getByText("{{qs.project.projektbeteiligte.company}}");
    expect(companyToken.closest(".reference-group")).toHaveAttribute("open");
    expect(screen.queryByText("{{qs.organization.email}}")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Search placeholders"), { target: { value: "no-matching-field" } });
    expect(screen.getByText("No matching placeholders. Try a different search.")).toBeInTheDocument();
  });

  it("copies a complete repeat block even when search shows only one matching field", async () => {
    let copiedText = "";
    const originalExecCommand = Object.getOwnPropertyDescriptor(document, "execCommand");
    Object.defineProperty(document, "execCommand", { configurable: true, value: () => { copiedText = (document.querySelector("textarea") as HTMLTextAreaElement).value; return true; } });
    try {
      renderTemplatesPage(createSeedDatabase());
      fireEvent.change(screen.getByLabelText("Project for placeholders"), { target: { value: "project-logistics-center" } });
      await screen.findByText("{{qs.project.projektbeteiligte.company}}");
      fireEvent.change(screen.getByLabelText("Search placeholders"), { target: { value: "qs.project.projektbeteiligte.company" } });
      fireEvent.click(screen.getByText("Show repeat block example"));
      fireEvent.click(screen.getByRole("button", { name: "Copy repeat block" }));
      await waitFor(() => expect(copiedText).toContain("{{qs.project.projektbeteiligte.email}}"));
      expect(copiedText.split("\n")[0]).toBe("{{#qs.project.projektbeteiligte}}");
      expect(copiedText.split("\n").at(-1)).toBe("{{/qs.project.projektbeteiligte}}");
      expect(screen.queryByText("{{qs.project.projektbeteiligte.email}}", { selector: ".placeholder-copy code" })).not.toBeInTheDocument();
    } finally {
      if (originalExecCommand) Object.defineProperty(document, "execCommand", originalExecCommand);
      else Reflect.deleteProperty(document, "execCommand");
    }
  });

  it("requires a unique custom template name", () => {
    const database = createSeedDatabase();
    database.documentTemplates.push({
      ...database.documentTemplates.find((template) => template.id === "standard-a4_plan-de")!,
      id: "custom-existing-template",
      name: "Customer safety template",
      origin: "custom",
      filename: "customer-safety-template.docx",
    });
    renderTemplatesPage(database);

    fireEvent.click(within(wordTemplatesSection()).getByRole("button", { name: "Add Word template" }));
    const nameInput = screen.getByLabelText(/^Template name/);
    fireEvent.change(nameInput, { target: { value: "  customer SAFETY template  " } });

    expect(screen.getByText("The template name must be unique.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("deletes a custom template through a confirmation dialog", () => {
    const database = createSeedDatabase();
    const customTemplate: DocumentTemplate = {
      ...database.documentTemplates.find((template) => template.id === "standard-a4_plan-en")!,
      id: "custom-a4-plan-en",
      name: "Custom risk plan",
      origin: "custom",
      blobId: "blob-custom-a4-plan-en",
      filename: "custom-risk-plan.docx",
    };
    database.documentTemplates.unshift(customTemplate);
    database.documentConfigurations.push({
      id: "configuration-custom-a4-plan-en",
      projectId: database.projects[0].id,
      documentType: "a4_plan",
      templateId: customTemplate.id,
    });
    const memory = renderTemplatesPage(database);

    fireEvent.click(within(wordTemplatesSection()).getByRole("button", { name: `Delete: ${customTemplate.name}` }));

    const confirmationDialog = screen.getByRole("dialog", { name: "Delete Word template" });
    expect(confirmationDialog).toHaveTextContent(`Delete “${customTemplate.name}”?`);
    fireEvent.click(within(confirmationDialog).getByRole("button", { name: "Delete" }));

    expect(within(wordTemplatesSection()).queryByRole("button", { name: `Delete: ${customTemplate.name}` })).not.toBeInTheDocument();
    expect(memory.current().documentTemplates.some((template) => template.id === customTemplate.id)).toBe(false);
    expect(memory.current().documentConfigurations.some((configuration) => configuration.templateId === customTemplate.id)).toBe(false);
  });
});

function OrganizationMutationProbe() {
  const { saveOrganizationProfile } = useApp();
  return <button onClick={() => {
    try { saveOrganizationProfile(emptyOrganizationProfile("Unauthorized change")); }
    catch { /* The UI tests also exercise the mutation boundary directly. */ }
  }}>Attempt organization mutation</button>;
}

describe("Organization profile settings", () => {
  it.each([
    ["DE", "01523 7894561", "+4915237894561", "1523 7894561", "+49"],
    ["IT", "02 36618 300", "+390236618300", "02 3661 8300", "+39"],
    ["US", "1 213 373 4253", "+12133734253", "213 373 4253", "+1"],
  ])("formats %s numbers beside the country code using country-specific prefixes", (country, entered, stored, displayed, callingCode) => {
    const database = createSeedDatabase();
    database.organization.address.countryCode = country;
    database.organization.mobilePhone = "";
    const memory = renderSettingsPage(database);
    fireEvent.change(screen.getByLabelText("Mobile phone"), { target: { value: entered } });
    expect(screen.getByLabelText("Mobile phone")).toHaveValue(displayed);
    expect(screen.getByRole("button", { name: /^Mobile phone country calling code:/ })).toHaveTextContent(callingCode);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(memory.current().organization.mobilePhone).toBe(stored);
    expect(screen.getByLabelText("Mobile phone")).toHaveValue(displayed);
  });

  it("accepts national significant digits and clears an optional number", () => {
    const database = createSeedDatabase();
    database.organization.address.countryCode = "DE";
    database.organization.mobilePhone = "+4915237894561";
    const memory = renderSettingsPage(database);
    expect(screen.getByLabelText("Mobile phone")).toHaveValue("1523 7894561");
    fireEvent.change(screen.getByLabelText("Mobile phone"), { target: { value: "1523 7894562" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(memory.current().organization.mobilePhone).toBe("+4915237894562");
    fireEvent.change(screen.getByLabelText("Mobile phone"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(memory.current().organization.mobilePhone).toBe("");
  });

  it("keeps a shared calling code selected while the number is incomplete", () => {
    const database = createSeedDatabase();
    database.organization.address.countryCode = "US";
    database.organization.mobilePhone = "";
    renderSettingsPage(database);
    fireEvent.change(screen.getByLabelText("Mobile phone"), { target: { value: "2" } });
    expect(screen.getByLabelText("Mobile phone")).toHaveValue("2");
    expect(screen.getByRole("button", { name: /^Mobile phone country calling code:/ })).toHaveTextContent("+1");
  });

  it("updates untouched calling codes when the organization country changes without overriding a manual choice", () => {
    const database = createSeedDatabase();
    database.organization = { ...database.organization, ...emptyOrganizationProfile(database.organization.name) };
    renderSettingsPage(database);
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "DE" } });
    fireEvent.click(screen.getByRole("button", { name: /^Mobile phone country calling code:/ }));
    const search = screen.getByRole("combobox", { name: "Search country or calling code" });
    fireEvent.change(search, { target: { value: "United Kingdom" } });
    fireEvent.keyDown(search, { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "FR" } });
    expect(screen.getByRole("button", { name: /^Phone country calling code:/ })).toHaveTextContent("+33");
    expect(screen.getByRole("button", { name: /^Fax country calling code:/ })).toHaveTextContent("+33");
    expect(screen.getByRole("button", { name: /^Mobile phone country calling code:/ })).toHaveTextContent("+44");
  });

  it("defaults calling codes to the organization country and permits independent phone countries", () => {
    const database = createSeedDatabase(); database.organization.address.countryCode = "DE";
    const memory = renderSettingsPage(database);
    expect(screen.getByRole("button", { name: /^Phone country calling code:/ })).toHaveTextContent("+49");
    expect(screen.getByRole("button", { name: /^Fax country calling code:/ })).toHaveTextContent("+49");
    fireEvent.click(screen.getByRole("button", { name: /^Mobile phone country calling code:/ }));
    const search = screen.getByRole("combobox", { name: "Search country or calling code" });
    fireEvent.change(search, { target: { value: "United Kingdom" } });
    fireEvent.keyDown(search, { key: "Enter" });
    fireEvent.change(screen.getByLabelText("Mobile phone"), { target: { value: "07400 123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(memory.current().organization.mobilePhone).toBe("+447400123456");
    expect(memory.current().organization.address.countryCode).toBe("DE");
    expect(screen.getByRole("button", { name: /^Mobile phone country calling code:/ })).toHaveTextContent("+44");
  });

  it("cancels number edits and restores empty phone-country selections", () => {
    const database = createSeedDatabase(); database.organization.address.countryCode = "DE";
    database.organization.fax = "";
    database.organization.faxExtension = "";
    const memory = renderSettingsPage(database);
    fireEvent.click(screen.getByRole("button", { name: /^Fax country calling code:/ }));
    const search = screen.getByRole("combobox", { name: "Search country or calling code" });
    fireEvent.change(search, { target: { value: "+33" } });
    fireEvent.click(within(screen.getByRole("dialog", { name: "Fax country calling code" })).getByRole("option", { name: /France/ }));
    fireEvent.change(screen.getByLabelText(/Organization name/), { target: { value: "Unsaved company" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: /^Fax country calling code:/ })).toHaveTextContent("+49");
    expect(memory.current().organization).toEqual(database.organization);
  });

  it("infers countries from saved numbers and accepts pasted international numbers", () => {
    const database = createSeedDatabase();
    database.organization.address.countryCode = "DE";
    database.organization.phone = "+442079460018";
    const memory = renderSettingsPage(database);
    expect(screen.getByRole("button", { name: /^Phone country calling code:/ })).toHaveTextContent("+44");
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "+33 1 42 68 53 00" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(memory.current().organization.phone).toBe("+33142685300");
    expect(screen.getByRole("button", { name: /^Phone country calling code:/ })).toHaveTextContent("+33");
  });

  it("saves company details independently of the user account and normalizes phone numbers", () => {
    const database = createSeedDatabase();
    const memory = renderSettingsPage(database);
    fireEvent.change(screen.getByLabelText(/Organization name/), { target: { value: "  New Company  " } });
    fireEvent.change(screen.getByLabelText("Country"), { target: { value: "DE" } });
    fireEvent.change(screen.getByLabelText("Postal code"), { target: { value: "01234" } });
    fireEvent.change(screen.getByLabelText("House number"), { target: { value: "12a" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "030 123456" } });
    fireEvent.change(screen.getByLabelText("Organization email"), { target: { value: "office@example.test" } });
    fireEvent.change(screen.getByLabelText("Website"), { target: { value: "example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(memory.current().organization).toMatchObject({ name: "New Company", email: "office@example.test", phone: "+4930123456", website: "https://example.com/", address: { postalCode: "01234", houseNumber: "12a" } });
    expect(memory.current().user.email).toBe(database.user.email);
    expect(screen.getByRole("status")).toHaveTextContent("Organization details saved.");
    expect(screen.getByLabelText("Phone")).toHaveValue("30 123456");
    expect(memory.current().auditEvents[0].action).toBe("organization.updated");
  });

  it("cancels unsaved changes and allows optional details to be cleared", () => {
    const database = createSeedDatabase();
    database.organization.email = "office@example.test";
    const memory = renderSettingsPage(database);
    fireEvent.change(screen.getByLabelText(/Organization name/), { target: { value: "Unsaved" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText(/Organization name/)).toHaveValue(database.organization.name);
    expect(memory.current().organization.name).toBe(database.organization.name);
    fireEvent.change(screen.getByLabelText("Organization email"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(memory.current().organization.email).toBe("");
  });

  it("keeps invalid input in the form and focuses the first invalid field", () => {
    const database = createSeedDatabase();
    const memory = renderSettingsPage(database);
    fireEvent.change(screen.getByLabelText(/Organization name/), { target: { value: "  " } });
    fireEvent.change(screen.getByLabelText("Organization email"), { target: { value: "invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByLabelText(/Organization name/)).toHaveFocus();
    expect(screen.getByText("Enter a valid email address.")).toBeInTheDocument();
    expect(memory.current().organization).toEqual(database.organization);
    expect(screen.queryByText("Organization details saved.")).not.toBeInTheDocument();
  });

  it("preserves the profile and draft when persistence fails", () => {
    const memory = renderSettingsPage(createSeedDatabase());
    vi.spyOn(memory.repository, "save").mockImplementation(() => { throw new Error("Storage full"); });
    fireEvent.change(screen.getByLabelText(/Organization name/), { target: { value: "Unsaved Company" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Saving failed.");
    expect(screen.getByLabelText(/Organization name/)).toHaveValue("Unsaved Company");
    expect(memory.current().organization.name).toBe("Sicher Planen Ingenieure");
  });

  it.each(["editor", "viewer"] as const)("prevents %s edits at the form and mutation boundary", (role) => {
    const database = createSeedDatabase(); database.user.role = role;
    const memory = renderSettingsPage(database);
    expect(screen.getByLabelText(/Organization name/)).toBeDisabled();
    expect(screen.getByRole("button", { name: /^Phone country calling code:/ })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Attempt organization mutation" }));
    expect(memory.current().organization).toEqual(database.organization);
  });

  it("allows admins to save and provides German field labels", () => {
    const database = createSeedDatabase(); database.user.role = "admin";
    const memory = renderSettingsPage(database, "de");
    fireEvent.change(screen.getByLabelText(/Organisationsname/), { target: { value: "Admin company" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    expect(memory.current().organization.name).toBe("Admin company");
    expect(screen.getByLabelText("Postleitzahl")).toBeInTheDocument();
  });
});
