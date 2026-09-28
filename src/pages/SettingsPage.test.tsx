import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppRepository } from "../data/localRepository";
import { createSeedDatabase } from "../data/seed";
import type { AppDatabase, DocumentTemplate, Locale } from "../domain/types";
import { I18nProvider } from "../i18n/I18nProvider";
import { AppProvider } from "../state/AppProvider";
import { TemplatesPage } from "./SettingsPage";

afterEach(cleanup);

function createMemoryRepository(initialDatabase: AppDatabase) {
  let database = structuredClone(initialDatabase);
  const repository: AppRepository = {
    load: () => database,
    save: (nextDatabase) => { database = structuredClone(nextDatabase); },
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

function wordTemplatesSection(): HTMLElement {
  return screen.getByRole("heading", { name: "Word templates" }).closest("section") as HTMLElement;
}

function overviewTemplatesSection(): HTMLElement {
  return screen.getByRole("heading", { name: "Overview templates" }).closest("section") as HTMLElement;
}

describe("Overview template localization", () => {
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
  it("shows only templates for the interface language and uses the report name as the title", () => {
    renderTemplatesPage(createSeedDatabase());

    const section = wordTemplatesSection();
    expect(within(section).getAllByRole("article")).toHaveLength(1);
    const a4SafetyPlan = within(section).getByText("A4 safety plan", { selector: "strong" });
    expect(a4SafetyPlan.closest("article")).toHaveTextContent("QuickSiGe Standard · English · Standard · v1");
    expect(within(section).queryByText("Site principles", { selector: "strong" })).not.toBeInTheDocument();
    expect(within(section).queryByText("German", { exact: false })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Duplicate" })).not.toBeInTheDocument();
    expect(within(section).queryByRole("button", { name: "Show archived" })).not.toBeInTheDocument();

    fireEvent.click(within(section).getByRole("button", { name: "Add Word template" }));
    expect(screen.queryByLabelText("Document type")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Document language")).toHaveValue("en");
  });

  it("shows only the placeholders used by the standard A4 template", () => {
    renderTemplatesPage(createSeedDatabase());

    expect(screen.getByText("{{#qs.plan.categories}}")).toBeInTheDocument();
    expect(screen.getByText("{{qs.category.title}}")).toBeInTheDocument();
    expect(screen.getByText("{{qs.section.heading}}")).toBeInTheDocument();
    expect(screen.getByText("{{qs.block.image}}")).toBeInTheDocument();
    expect(screen.getByText("{{qs.block.a4_description}}")).toBeInTheDocument();
    expect(screen.getByText("{{qs.block.regulations}}")).toBeInTheDocument();
    expect(screen.queryByText("{{qs.project.name}}")).not.toBeInTheDocument();
    expect(screen.queryByText("{{qs.block.expert_note}}")).not.toBeInTheDocument();
    expect(screen.queryByText("{{PAGEBREAK}}")).not.toBeInTheDocument();
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
