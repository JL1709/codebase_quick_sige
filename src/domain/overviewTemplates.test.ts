import { describe, expect, it } from "vitest";
import type { OverviewTemplate } from "./types";
import {
  instantiateOverviewSection,
  localizeOverviewTemplate,
  mergeOverviewTemplateLocale,
  moveOverviewEntry,
  normalizeOverviewKey,
  overviewEntryClipboardValue,
  overviewEntryPath,
  overviewSectionTemplateData,
  uniqueProjectOverviewSectionName,
  validateOverviewTemplate,
} from "./overviewTemplates";

const template: OverviewTemplate = {
  id: "template-general",
  organizationId: "organization-demo",
  name: "Allgemein",
  entries: [
    { id: "client", label: "Bauherr", type: "text", defaultValue: "", children: [] },
    {
      id: "address", label: "Adresse", type: "group", defaultValue: "", children: [
        { id: "city", label: "Stadt", type: "text", defaultValue: "Leipzig", children: [] },
      ],
    },
    {
      id: "participants", label: "Projektbeteiligte", type: "repeating_group", defaultValue: "", children: [
        { id: "participant-name", label: "Name", type: "text", defaultValue: "", children: [] },
      ],
    },
  ],
  createdAt: "2026-09-27T00:00:00.000Z",
  updatedAt: "2026-09-27T00:00:00.000Z",
};

describe("overview template hierarchy", () => {
  it("creates predictable localized placeholder keys and engine-ready clipboard values", () => {
    expect(normalizeOverviewKey("Größe & Straße")).toBe("groesse_strasse");
    expect(normalizeOverviewKey("2026 Baustart")).toBe("_2026_baustart");
    expect(overviewEntryPath(template.name, "city", template.entries)).toBe("allgemein.adresse.stadt");
    expect(overviewEntryClipboardValue(template, "city")).toBe("{{qs.project.allgemein.adresse.stadt}}");
    expect(overviewEntryClipboardValue(template, "participant-name")).toBe("{{qs.project.allgemein.projektbeteiligte.name}}");
    expect(overviewEntryClipboardValue(template, "participants")).toBe(
      "{{#qs.project.allgemein.projektbeteiligte}}\n{{/qs.project.allgemein.projektbeteiligte}}",
    );
  });

  it("rejects duplicate normalized entry labels and template names", () => {
    const duplicateEntry = structuredClone(template);
    duplicateEntry.entries.push({ id: "duplicate", label: "BAUHERR", type: "text", defaultValue: "", children: [] });
    const validation = validateOverviewTemplate(duplicateEntry, [{ ...template, id: "other" }]);
    expect(validation.valid).toBe(false);
    expect(validation.nameConflict).toBe(true);
    expect(validation.invalidEntryIds).toEqual(new Set(["client", "duplicate"]));
  });

  it("reorders siblings and nests entries without losing their content", () => {
    const reordered = moveOverviewEntry(template.entries, "client", "address", "after");
    expect(reordered.entries.map((entry) => entry.id)).toEqual(["address", "client", "participants"]);
    expect(reordered.parentChanged).toBe(false);

    const nested = moveOverviewEntry(template.entries, "client", "address", "inside");
    expect(nested.entries.find((entry) => entry.id === "address")?.children.map((entry) => entry.id)).toEqual(["city", "client"]);
    expect(nested.parentChanged).toBe(true);
    expect(moveOverviewEntry(template.entries, "address", "city", "inside").moved).toBe(false);
  });

  it("instantiates editable project data and formats date values for documents", () => {
    const dateTemplate: OverviewTemplate = {
      ...template,
      entries: [{ id: "date", label: "Übergabe", type: "date", defaultValue: "2026-09-27", children: [] }],
    };
    let id = 0;
    const section = instantiateOverviewSection(dateTemplate, (prefix) => `${prefix}-${++id}`);
    expect(section).not.toHaveProperty("placeholderKey");
    expect(overviewSectionTemplateData(section, "de")).toEqual({ uebergabe: "27.09.2026" });
  });

  it("copies templates into independent project sections without retaining a template reference", () => {
    let id = 0;
    const sourceTemplate = structuredClone(template);
    const section = instantiateOverviewSection(sourceTemplate, (prefix) => `${prefix}-${++id}`);

    sourceTemplate.name = "Changed template";
    sourceTemplate.entries[0].label = "Changed template field";
    section.name = "Project-specific title";
    section.entries[0].label = "Project-specific field";

    expect(section).not.toHaveProperty("templateId");
    expect(section.name).toBe("Project-specific title");
    expect(section.entries[0].label).toBe("Project-specific field");
    expect(sourceTemplate.name).toBe("Changed template");
    expect(sourceTemplate.entries[0].label).toBe("Changed template field");
    expect(template.name).toBe("Allgemein");
    expect(template.entries[0].label).toBe("Bauherr");
  });

  it("creates unique visible names for repeated sections", () => {
    const first = instantiateOverviewSection(template, (prefix) => `${prefix}-first`);
    expect(uniqueProjectOverviewSectionName("Allgemein", [])).toBe("Allgemein");
    expect(uniqueProjectOverviewSectionName("Allgemein", [first])).toBe("Allgemein 2");
    expect(uniqueProjectOverviewSectionName("Allgemein", [first, { ...first, id: "second", name: "Allgemein 2" }])).toBe("Allgemein 3");
  });

  it("keeps structure shared while names, labels, and default values are language-specific", () => {
    const englishFallback = localizeOverviewTemplate(template, "en");
    expect(englishFallback.name).toBe("Allgemein");
    expect(englishFallback.entries[0].label).toBe("Bauherr");

    const englishDraft = structuredClone(englishFallback);
    englishDraft.name = "General";
    englishDraft.entries[0].label = "Client";
    englishDraft.entries[0].defaultValue = "Example Ltd";
    englishDraft.entries.reverse();
    const withEnglish = mergeOverviewTemplateLocale(template, englishDraft, "en");

    expect(localizeOverviewTemplate(withEnglish, "de").name).toBe("Allgemein");
    expect(localizeOverviewTemplate(withEnglish, "de").entries.find((entry) => entry.id === "client")?.label).toBe("Bauherr");
    expect(localizeOverviewTemplate(withEnglish, "en").name).toBe("General");
    expect(localizeOverviewTemplate(withEnglish, "en").entries.find((entry) => entry.id === "client")).toMatchObject({
      label: "Client",
      defaultValue: "Example Ltd",
    });
    expect(withEnglish.entries.map((entry) => entry.id)).toEqual(["participants", "address", "client"]);

    const englishSection = instantiateOverviewSection(withEnglish, (prefix) => `${prefix}-localized`, "en");
    expect(englishSection.name).toBe("General");
    expect(englishSection.entries.find((entry) => entry.label === "Client")?.value).toBe("Example Ltd");
  });
});
